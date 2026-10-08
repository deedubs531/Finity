// Finds Instagram accounts you follow that are also on Bluesky, then picks the
// interesting ones automatically: active accounts, not shops or brands. Venues and
// event accounts go to the radar; everyone else goes to the digest. Only Bluesky's
// public directory is asked, one username at a time.

import { mapLimit } from '../util';

const API = 'https://public.api.bsky.app/xrpc';
const CONCURRENCY = 4;
/** Accounts that haven't posted in this long are skipped as inactive. */
const ACTIVE_DAYS = 90;
const MIN_POSTS = 3;
/** Keeps the digest calm: the most recently active accounts win. */
export const MAX_DIGEST_ADDS = 60;

export interface Candidate {
  igUsername: string;
  handle: string;
  displayName: string;
  description: string;
}

export interface Profile extends Candidate {
  postsCount: number;
  lastPostAt: number | null;
}

export type Destination = 'digest' | 'radar';

export interface Pick {
  handle: string;
  igUsername: string;
  displayName: string;
  destination: Destination;
}

export interface Skip {
  handle: string;
  displayName: string;
  reason: string;
}

export interface Selection {
  picks: Pick[];
  skipped: Skip[];
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const EVENT_WORDS =
  /\b(venue|venues|gallery|museum|theat(?:er|re)|cinema|library|festival|fest|market|events?|live music|concerts?|tickets|brewery|taproom|records|music hall|comedy|open mic|meetups?|community (?:center|centre)|bookstore|bookshop|art walk|what'?s on|shows? (?:nightly|weekly)|dance night|club night|food trucks?|farmers market)\b/i;
/** Strong venue words that also count inside a run-together username, e.g. "dougfirlounge". */
const EVENT_USERNAME_PARTS = /(venue|gallery|museum|theater|theatre|cinema|library|festival|brewery|taproom|records|lounge|events|musichall|comedyclub|bookstore|bookshop|market)/;
const SHOP_WORDS =
  /\b(shop now|online store|boutique|use (?:my )?code|discount|promo code|% ?off|free shipping|dm to order|order now|official merch|dropshipping|affiliate|wholesale|link in bio to (?:buy|shop))\b/i;
const SHOP_USERNAME_PARTS = /(shop|store|boutique|deals|official)/;

/** True if a Bluesky account is very likely the same person or place as the Instagram username. */
export function isSameAccount(igUsername: string, actor: { handle: string; displayName?: string }): boolean {
  const u = norm(igUsername);
  if (u.length < 3) return false;
  const handle = actor.handle.toLowerCase();
  if (norm(handle.split('.')[0]) === u) return true;
  return u.length >= 5 && norm(actor.displayName) === u;
}

export function destinationFor(p: Pick | Profile | Candidate): Destination {
  const text = `${p.displayName} ${'description' in p ? p.description : ''}`;
  return EVENT_WORDS.test(text) || EVENT_USERNAME_PARTS.test(norm(p.igUsername)) ? 'radar' : 'digest';
}

export function skipReason(p: Profile, now = Date.now()): string | null {
  if (SHOP_WORDS.test(`${p.displayName} ${p.description}`) || SHOP_USERNAME_PARTS.test(norm(p.igUsername))) return 'Looks like a shop or brand';
  if (p.postsCount < MIN_POSTS || p.lastPostAt === null) return 'Hardly posts on Bluesky';
  if (now - p.lastPostAt > ACTIVE_DAYS * 86_400_000) return `No posts in ${ACTIVE_DAYS} days`;
  return null;
}

/** Decides automatically which matched accounts to add, and where. */
export function select(profiles: Profile[], now = Date.now()): Selection {
  const picks: Pick[] = [];
  const skipped: Skip[] = [];
  const keep: Profile[] = [];
  for (const p of profiles) {
    const reason = skipReason(p, now);
    if (reason) skipped.push({ handle: p.handle, displayName: p.displayName, reason });
    else keep.push(p);
  }
  keep.sort((a, b) => (b.lastPostAt ?? 0) - (a.lastPostAt ?? 0));
  let digestCount = 0;
  for (const p of keep) {
    const destination = destinationFor(p);
    if (destination === 'digest' && ++digestCount > MAX_DIGEST_ADDS) {
      skipped.push({ handle: p.handle, displayName: p.displayName, reason: `Digest limit of ${MAX_DIGEST_ADDS} reached` });
      continue;
    }
    picks.push({ handle: p.handle, igUsername: p.igUsername, displayName: p.displayName, destination });
  }
  return { picks, skipped };
}

/** Instagram accounts not found on Bluesky that look like venues or event organizers. */
export function venueLike(usernames: string[]): string[] {
  return usernames.filter((u) => EVENT_USERNAME_PARTS.test(norm(u)));
}

async function getJson<T>(path: string, params: URLSearchParams): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${path}?${params}`);
    if (res.status === 429 && attempt < 3) {
      // Bluesky asks us to slow down; wait and try again.
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Bluesky answered with status ${res.status}.`);
    return (await res.json()) as T;
  }
}


export async function findOnBluesky(igUsername: string): Promise<Candidate | null> {
  const data = await getJson<{ actors?: { handle: string; displayName?: string; description?: string }[] }>(
    'app.bsky.actor.searchActors',
    new URLSearchParams({ q: igUsername, limit: '10' }),
  );
  const actor = (data.actors ?? []).find((a) => isSameAccount(igUsername, a));
  return actor ? { igUsername, handle: actor.handle, displayName: actor.displayName || actor.handle, description: actor.description ?? '' } : null;
}

async function lastPostAt(handle: string): Promise<number | null> {
  const data = await getJson<{ feed?: { post: { record?: { createdAt?: string }; indexedAt?: string } }[] }>(
    'app.bsky.feed.getAuthorFeed',
    new URLSearchParams({ actor: handle, limit: '1', filter: 'posts_no_replies' }),
  );
  const post = data.feed?.[0]?.post;
  const ms = Date.parse(post?.record?.createdAt ?? post?.indexedAt ?? '');
  return Number.isNaN(ms) ? null : ms;
}

async function enrich(candidates: Candidate[], onDone: () => void): Promise<Profile[]> {
  const counts = new Map<string, number>();
  for (let i = 0; i < candidates.length; i += 25) {
    const params = new URLSearchParams();
    candidates.slice(i, i + 25).forEach((c) => params.append('actors', c.handle));
    const data = await getJson<{ profiles?: { handle: string; postsCount?: number; description?: string }[] }>('app.bsky.actor.getProfiles', params);
    for (const p of data.profiles ?? []) counts.set(p.handle, p.postsCount ?? 0);
  }
  return mapLimit(
    candidates,
    CONCURRENCY,
    async (c) => ({ ...c, postsCount: counts.get(c.handle) ?? 0, lastPostAt: await lastPostAt(c.handle).catch(() => null) }),
    onDone,
  );
}

export interface Progress {
  stage: 'searching' | 'checking';
  done: number;
  total: number;
}

export interface Analysis {
  following: number;
  profiles: Profile[];
  notFound: string[];
  failed: number;
}

/** Looks up every username on Bluesky (a few at a time), then checks how active each match is. */
export async function analyze(usernames: string[], onProgress: (p: Progress) => void): Promise<Analysis> {
  let done = 0;
  let failed = 0;
  onProgress({ stage: 'searching', done, total: usernames.length });
  const found = await mapLimit(
    usernames,
    CONCURRENCY,
    (u) =>
      findOnBluesky(u).catch(() => {
        failed++;
        return null;
      }),
    () => onProgress({ stage: 'searching', done: ++done, total: usernames.length }),
  );
  const candidates = found.filter((c): c is Candidate => c !== null);
  // Two Instagram accounts can point at the same Bluesky account; keep one.
  const unique = [...new Map(candidates.map((c) => [c.handle, c])).values()];
  const matched = new Set(candidates.map((c) => c.igUsername));

  done = 0;
  onProgress({ stage: 'checking', done, total: unique.length });
  const profiles = await enrich(unique, () => onProgress({ stage: 'checking', done: ++done, total: unique.length }));
  return { following: usernames.length, profiles, notFound: usernames.filter((u) => !matched.has(u)), failed };
}
