import { describe, expect, it } from 'vitest';
import { normalizeHandle, toDigestItems } from '../src/sources/bluesky';

describe('normalizeHandle', () => {
  it.each([
    ['@Alice.bsky.social', 'alice.bsky.social'],
    ['alice', 'alice.bsky.social'],
    ['https://bsky.app/profile/news.example.com', 'news.example.com'],
    ['did:plc:abc123', 'did:plc:abc123'],
  ])('%s → %s', (input, expected) => expect(normalizeHandle(input)).toBe(expected));
});

describe('toDigestItems', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const author = { did: 'did:plc:a', handle: 'alice.bsky.social', displayName: 'Alice' };

  it('maps a post with an image', () => {
    const [item] = toDigestItems(
      [
        {
          post: {
            uri: 'at://did:plc:a/app.bsky.feed.post/3abc',
            author,
            record: { text: 'Sunset', createdAt: '2026-10-07T10:00:00Z' },
            embed: { $type: 'app.bsky.embed.images#view', images: [{ fullsize: 'https://cdn.bsky.app/full.jpg', alt: 'Orange sky' }] },
          },
        },
      ],
      'alice.bsky.social',
      now,
    );
    expect(item).toMatchObject({
      sourceName: 'Alice',
      sourceKey: 'alice.bsky.social',
      text: 'Sunset',
      url: 'https://bsky.app/profile/alice.bsky.social/post/3abc',
      image: 'https://cdn.bsky.app/full.jpg',
      imageAlt: 'Orange sky',
      published: Date.parse('2026-10-07T10:00:00Z'),
      seen: false,
    });
  });

  it('labels reposts and uses the repost time', () => {
    const [item] = toDigestItems(
      [
        {
          post: { uri: 'at://did:plc:b/app.bsky.feed.post/9', author: { did: 'did:plc:b', handle: 'bob.bsky.social' }, record: { text: 'Hi', createdAt: '2026-01-01T00:00:00Z' } },
          reason: { $type: 'app.bsky.feed.defs#reasonRepost', by: author, indexedAt: '2026-10-07T11:00:00Z' },
        },
      ],
      'alice.bsky.social',
      now,
    );
    expect(item.note).toBe('Reposted by Alice');
    expect(item.published).toBe(Date.parse('2026-10-07T11:00:00Z'));
    expect(item.id).toContain(':rp:');
  });

  it('describes videos instead of playing them', () => {
    const [item] = toDigestItems(
      [{ post: { uri: 'at://x/app.bsky.feed.post/1', author, record: { text: '' }, embed: { $type: 'app.bsky.embed.video#view', thumbnail: 'https://video.bsky.app/t.jpg' } } }],
      'alice.bsky.social',
      now,
    );
    expect(item.note).toBe('Video: open in Bluesky to watch');
    expect(item.image).toBe('https://video.bsky.app/t.jpg');
  });
});
