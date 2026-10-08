import * as db from './db';
import { hasRelay } from './relay-status';
import type { Settings } from './settings';
import { fetchBluesky } from './sources/bluesky';
import { fetchFeedText } from './sources/relay';
import { parseFeed } from './sources/rss';
import type { DigestItem, SourceError } from './types';
import { mapLimit, truncate } from './util';

/** Only items from the last few days make it in, so a week away doesn't become a backlog. */
export const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
/** Seen items are kept this long so they aren't shown again, then deleted. */
const KEEP_SEEN_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_RSS_TEXT = 700;

async function fetchRss(feedUrl: string, token: string, now: number): Promise<DigestItem[]> {
  const feed = parseFeed(await fetchFeedText(feedUrl, token), feedUrl);
  return feed.entries.map((e) => ({
    id: `rss:${e.id}`,
    source: 'rss' as const,
    sourceName: feed.title,
    sourceKey: feedUrl,
    title: e.title || undefined,
    text: truncate(e.text, MAX_RSS_TEXT),
    url: e.url,
    image: e.image,
    published: Math.min(e.published ?? now, now),
    seen: false,
    fetchedAt: now,
  }));
}

/** Merges fresh items into storage. Items already stored keep their "seen" state. */
export function mergeItems(existing: Map<string, DigestItem>, fresh: DigestItem[], now: number): DigestItem[] {
  const out: DigestItem[] = [];
  for (const item of fresh) {
    if (item.published < now - LOOKBACK_MS) continue;
    if (existing.has(item.id)) continue;
    out.push(item);
  }
  return out;
}

export async function refreshDigest(settings: Settings): Promise<SourceError[]> {
  const now = Date.now();
  const feeds = (await hasRelay()) ? settings.feeds : [];
  const jobs: { source: string; run: () => Promise<DigestItem[]> }[] = [
    ...settings.blueskyHandles.map((h) => ({ source: h, run: () => fetchBluesky(h, settings.showReplies) })),
    ...feeds.map((f) => ({ source: f, run: () => fetchRss(f, settings.relayToken, now) })),
  ];
  // A few at a time, so a long list of accounts doesn't trip Bluesky's rate limits.
  const results = await mapLimit(jobs, 6, (j) =>
    j.run().then(
      (value): PromiseSettledResult<DigestItem[]> => ({ status: 'fulfilled', value }),
      (reason): PromiseSettledResult<DigestItem[]> => ({ status: 'rejected', reason }),
    ),
  );
  const errors: SourceError[] = [];
  const fresh: DigestItem[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') fresh.push(...r.value);
    else errors.push({ source: jobs[i].source, message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });

  const stored = await db.all<DigestItem>('items');
  const existing = new Map(stored.map((i) => [i.id, i]));
  await db.putMany('items', mergeItems(existing, fresh, now));
  await db.delMany('items', stored.filter((i) => i.seen && i.fetchedAt < now - KEEP_SEEN_MS).map((i) => i.id));
  await db.put('kv', now, 'lastRefresh');
  return errors;
}

/** Unseen items from sources that are still configured, newest first. */
export async function unseenItems(settings: Settings): Promise<DigestItem[]> {
  const feeds = (await hasRelay()) ? settings.feeds : [];
  const active = new Set([...settings.blueskyHandles.map((h) => h.toLowerCase()), ...feeds]);
  const items = await db.all<DigestItem>('items');
  return items
    .filter((i) => !i.seen && (active.has(i.sourceKey) || active.has(i.sourceKey.toLowerCase())))
    .sort((a, b) => b.published - a.published);
}

export async function markSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const items = await db.all<DigestItem>('items');
  const wanted = new Set(ids);
  await db.putMany('items', items.filter((i) => wanted.has(i.id) && !i.seen).map((i) => ({ ...i, seen: true })));
}

export async function lastRefresh(): Promise<number> {
  return (await db.get<number>('kv', 'lastRefresh')) ?? 0;
}
