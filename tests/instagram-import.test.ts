import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyImport, removeImported, undoImport, lastImport, moveImported } from '../src/importers/apply';
import { parseFollowingHtml, parseFollowingJson, readInstagramExport } from '../src/importers/instagram';
import { analyze, destinationFor, isSameAccount, MAX_DIGEST_ADDS, select, venueLike, type Profile } from '../src/importers/match';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/settings';

afterEach(() => vi.unstubAllGlobals());

const OLD_JSON = JSON.stringify({
  relationships_following: [
    { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/alice_art', value: 'alice_art', timestamp: 1690000000 }] },
    { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/Doug.Fir.Lounge', value: 'Doug.Fir.Lounge', timestamp: 1690000001 }] },
  ],
});
const NEW_JSON = JSON.stringify({
  relationships_following: [
    { title: 'bob.music', string_list_data: [{ href: 'https://www.instagram.com/_u/bob.music', timestamp: 1 }] },
    { title: '', string_list_data: [{ href: 'https://www.instagram.com/_u/carol', timestamp: 2 }] },
  ],
});

describe('reading the Instagram download', () => {
  it('reads the older JSON format', () => {
    expect(parseFollowingJson(OLD_JSON)).toEqual(['alice_art', 'doug.fir.lounge']);
  });

  it('reads the newer JSON format', () => {
    expect(parseFollowingJson(NEW_JSON)).toEqual(['bob.music', 'carol']);
  });

  it('reads the HTML format', () => {
    const html = '<div><a target="_blank" href="https://www.instagram.com/alice_art">alice_art</a></div><a href="https://www.instagram.com/_u/bob.music">bob</a><a href="https://example.com/x">x</a>';
    expect(parseFollowingHtml(html)).toEqual(['alice_art', 'bob.music']);
  });

  it('finds the following list inside the zip, ignoring everything else', async () => {
    const zip = zipSync({
      'connections/followers_and_following/followers_1.json': strToU8('[]'),
      'connections/followers_and_following/following.json': strToU8(OLD_JSON),
      'media/posts/huge.jpg': new Uint8Array(1000),
    });
    const file = new File([zip], 'instagram-alice-2026-10-08.zip', { type: 'application/zip' });
    expect(await readInstagramExport(file)).toEqual(['alice_art', 'doug.fir.lounge']);
  });

  it('explains when the zip has no following list', async () => {
    const file = new File([zipSync({ 'messages/inbox.json': strToU8('{}') })], 'x.zip');
    await expect(readInstagramExport(file)).rejects.toThrow('Followers and following');
  });
});

describe('matching accounts on Bluesky', () => {
  it('matches the same username, ignoring dots and underscores', () => {
    expect(isSameAccount('alice_art', { handle: 'aliceart.bsky.social' })).toBe(true);
    expect(isSameAccount('doug.fir.lounge', { handle: 'dougfirlounge.com' })).toBe(true);
    expect(isSameAccount('bob.music', { handle: 'someone.bsky.social', displayName: 'Bob Music' })).toBe(true);
  });

  it('does not match different or too-short names', () => {
    expect(isSameAccount('alice_art', { handle: 'alice.bsky.social' })).toBe(false);
    expect(isSameAccount('jo', { handle: 'jo.bsky.social' })).toBe(false);
    expect(isSameAccount('bob', { handle: 'x.bsky.social', displayName: 'Bob' })).toBe(false);
  });
});

const now = Date.parse('2026-10-08T12:00:00Z');
const profile = (over: Partial<Profile>): Profile => ({
  igUsername: 'someone',
  handle: 'someone.bsky.social',
  displayName: 'Someone',
  description: '',
  postsCount: 50,
  lastPostAt: now - 86_400_000,
  ...over,
});

describe('choosing automatically', () => {
  it('sends venues and events to the radar, people to the digest', () => {
    expect(destinationFor(profile({ igUsername: 'dougfirlounge', displayName: 'Doug Fir' }))).toBe('radar');
    expect(destinationFor(profile({ description: 'Live music venue in Portland' }))).toBe('radar');
    expect(destinationFor(profile({ description: 'Painter. Cat person.' }))).toBe('digest');
  });

  it('leaves out shops, quiet accounts and inactive accounts', () => {
    const { picks, skipped } = select(
      [
        profile({ handle: 'artist.bsky.social', displayName: 'Artist' }),
        profile({ handle: 'shop.bsky.social', description: 'Use code SAVE20 for 20% off!' }),
        profile({ handle: 'quiet.bsky.social', postsCount: 1 }),
        profile({ handle: 'gone.bsky.social', lastPostAt: now - 200 * 86_400_000 }),
        profile({ handle: 'never.bsky.social', lastPostAt: null }),
      ],
      now,
    );
    expect(picks.map((p) => p.handle)).toEqual(['artist.bsky.social']);
    expect(skipped.map((s) => s.reason)).toEqual(['Looks like a shop or brand', 'Hardly posts on Bluesky', 'No posts in 90 days', 'Hardly posts on Bluesky']);
  });

  it('keeps the digest to a calm size, preferring the most recently active', () => {
    const many = Array.from({ length: MAX_DIGEST_ADDS + 5 }, (_, i) => profile({ handle: `p${i}.bsky.social`, lastPostAt: now - i * 60_000 }));
    const { picks, skipped } = select(many, now);
    expect(picks).toHaveLength(MAX_DIGEST_ADDS);
    expect(picks[0].handle).toBe('p0.bsky.social');
    expect(skipped).toHaveLength(5);
  });

  it('flags Instagram-only venues', () => {
    expect(venueLike(['alice_art', 'thegallerypdx', 'mississippistudios', 'portlandfarmersmarket'])).toEqual(['thegallerypdx', 'portlandfarmersmarket']);
  });
});

describe('analyze (with Bluesky mocked)', () => {
  it('searches each username, then checks activity of matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = new URL(url);
        if (u.pathname.endsWith('searchActors')) {
          const q = u.searchParams.get('q');
          return Response.json({ actors: q === 'alice_art' ? [{ handle: 'other.bsky.social' }, { handle: 'aliceart.bsky.social', displayName: 'Alice' }] : [] });
        }
        if (u.pathname.endsWith('getProfiles')) return Response.json({ profiles: [{ handle: 'aliceart.bsky.social', postsCount: 120 }] });
        if (u.pathname.endsWith('getAuthorFeed')) return Response.json({ feed: [{ post: { record: { createdAt: '2026-10-07T10:00:00Z' } } }] });
        return new Response('', { status: 404 });
      }),
    );
    const progress: string[] = [];
    const result = await analyze(['alice_art', 'nobody_here'], (p) => progress.push(`${p.stage}:${p.done}/${p.total}`));
    expect(result.profiles).toEqual([
      { igUsername: 'alice_art', handle: 'aliceart.bsky.social', displayName: 'Alice', description: '', postsCount: 120, lastPostAt: Date.parse('2026-10-07T10:00:00Z') },
    ]);
    expect(result.notFound).toEqual(['nobody_here']);
    expect(progress.at(-1)).toBe('checking:1/1');
  });
});

describe('applying and undoing an import', () => {
  it('adds picks, never touches accounts you already had, and undoes cleanly', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, blueskyHandles: ['mine.bsky.social', 'aliceart.bsky.social'] });
    const base = { at: now, following: 3, skipped: [], venueLike: [], notFound: 0, failed: 0 };
    const saved = await applyImport({
      ...base,
      picks: [
        { handle: 'aliceart.bsky.social', igUsername: 'alice_art', displayName: 'Alice', destination: 'digest' },
        { handle: 'bob.bsky.social', igUsername: 'bob', displayName: 'Bob', destination: 'digest' },
        { handle: 'venue.bsky.social', igUsername: 'venue', displayName: 'Venue', destination: 'radar' },
      ],
    });
    expect(saved.picks.map((p) => p.handle)).toEqual(['bob.bsky.social', 'venue.bsky.social']);
    let s = await loadSettings();
    expect(s.blueskyHandles).toEqual(['mine.bsky.social', 'aliceart.bsky.social', 'bob.bsky.social']);
    expect(s.eventHandles).toEqual(['venue.bsky.social']);

    await moveImported('venue.bsky.social', 'digest');
    s = await loadSettings();
    expect(s.eventHandles).toEqual([]);
    expect((await lastImport())?.picks.find((p) => p.handle === 'venue.bsky.social')?.destination).toBe('digest');

    await removeImported('bob.bsky.social');
    await undoImport();
    s = await loadSettings();
    expect(s.blueskyHandles).toEqual(['mine.bsky.social', 'aliceart.bsky.social']);
    expect(await lastImport()).toBeUndefined();
  });
});
