import { describe, expect, it } from 'vitest';
import { LOOKBACK_MS, mergeItems } from '../src/digest';
import { fromClipboard } from '../src/shelf';
import type { DigestItem } from '../src/types';

describe('fromClipboard', () => {
  it('saves a shared link with its caption', () => {
    const item = fromClipboard('Look at this https://example.com/art?x=1 so good');
    expect(item?.url).toBe('https://example.com/art?x=1');
    expect(item?.text).toBe('Look at this  so good');
  });

  it('saves plain text', () => {
    expect(fromClipboard('  A quote I love  ')).toMatchObject({ text: 'A quote I love', url: undefined });
  });

  it('ignores an empty clipboard', () => {
    expect(fromClipboard('   ')).toBeNull();
  });
});

describe('mergeItems', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const item = (id: string, published: number): DigestItem => ({ id, source: 'rss', sourceName: 's', sourceKey: 'k', text: '', published, seen: false, fetchedAt: now });

  it('adds only new, recent items and keeps stored ones untouched', () => {
    const stored = new Map([['a', { ...item('a', now), seen: true }]]);
    const added = mergeItems(stored, [item('a', now), item('b', now - 1000), item('old', now - LOOKBACK_MS - 1)], now);
    expect(added.map((i) => i.id)).toEqual(['b']);
  });
});
