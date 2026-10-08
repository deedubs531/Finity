// Reads public Bluesky posts through the open, no-login AppView API.
import type { DigestItem } from '../types';
import { safeUrl } from '../util';

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';

/** Accepts "@name.bsky.social", "name.bsky.social" or a bsky.app profile link. */
export function normalizeHandle(input: string): string {
  let s = input.trim();
  const fromUrl = s.match(/bsky\.app\/profile\/([^/?#\s]+)/i);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, '').toLowerCase();
  if (s && !s.includes('.') && !s.startsWith('did:')) s = `${s}.bsky.social`;
  return s;
}

interface Author {
  did: string;
  handle: string;
  displayName?: string;
}

interface EmbedView {
  $type?: string;
  images?: { thumb?: string; fullsize?: string; alt?: string }[];
  external?: { uri?: string; title?: string; description?: string; thumb?: string };
  thumbnail?: string;
  media?: EmbedView;
  record?: { value?: { text?: string }; author?: Author; record?: { value?: { text?: string }; author?: Author } };
}

interface FeedViewPost {
  post: {
    uri: string;
    author: Author;
    record: { text?: string; createdAt?: string };
    embed?: EmbedView;
    indexedAt?: string;
  };
  reason?: { $type?: string; by?: Author; indexedAt?: string };
  reply?: unknown;
}

function postUrl(uri: string, handle: string): string | undefined {
  const rkey = uri.split('/').pop();
  return rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : undefined;
}

function applyEmbed(item: DigestItem, embed: EmbedView | undefined): void {
  if (!embed) return;
  const type = embed.$type ?? '';
  if (type.startsWith('app.bsky.embed.images')) {
    const img = embed.images?.[0];
    item.image = safeUrl(img?.fullsize ?? img?.thumb);
    item.imageAlt = img?.alt || undefined;
    if ((embed.images?.length ?? 0) > 1) item.note = `${embed.images!.length} images`;
  } else if (type.startsWith('app.bsky.embed.external')) {
    const ext = embed.external;
    item.quote = [ext?.title, ext?.description].filter(Boolean).join(': ') || undefined;
    item.image = safeUrl(ext?.thumb);
    const link = safeUrl(ext?.uri);
    if (link) item.note = `Link: ${new URL(link).hostname.replace(/^www\./, '')}`;
  } else if (type.startsWith('app.bsky.embed.video')) {
    item.image = safeUrl(embed.thumbnail);
    item.note = 'Video: open in Bluesky to watch';
  } else if (type.startsWith('app.bsky.embed.recordWithMedia')) {
    applyEmbed(item, embed.media);
    const quoted = embed.record?.record;
    if (quoted?.value?.text) item.quote = `${quoted.author?.handle ?? ''}: ${quoted.value.text}`;
  } else if (type.startsWith('app.bsky.embed.record')) {
    const quoted = embed.record;
    if (quoted?.value?.text) item.quote = `${quoted.author?.handle ?? ''}: ${quoted.value.text}`;
  }
}

export function toDigestItems(feed: FeedViewPost[], sourceKey: string, now = Date.now()): DigestItem[] {
  return feed.map(({ post, reason }) => {
    const isRepost = reason?.$type?.includes('reasonRepost') ?? false;
    const shownAt = Date.parse((isRepost ? reason?.indexedAt : post.record.createdAt) ?? post.indexedAt ?? '') || now;
    const item: DigestItem = {
      id: `bsky:${post.uri}${isRepost ? `:rp:${reason?.by?.did ?? ''}` : ''}`,
      source: 'bluesky',
      sourceName: post.author.displayName || post.author.handle,
      sourceKey,
      text: post.record.text ?? '',
      url: postUrl(post.uri, post.author.handle),
      published: Math.min(shownAt, now),
      seen: false,
      fetchedAt: now,
    };
    applyEmbed(item, post.embed);
    if (isRepost) {
      const by = reason?.by?.displayName || reason?.by?.handle;
      item.note = [by ? `Reposted by ${by}` : 'Repost', item.note].filter(Boolean).join(' · ');
    }
    return item;
  });
}

export async function fetchBluesky(handle: string, showReplies = false): Promise<DigestItem[]> {
  const actor = normalizeHandle(handle);
  const params = new URLSearchParams({ actor, limit: '30', filter: showReplies ? 'posts_with_replies' : 'posts_no_replies' });
  let res: Response;
  try {
    res = await fetch(`${API}?${params}`);
  } catch {
    throw new Error('You appear to be offline.');
  }
  if (res.status === 400) throw new Error(`Couldn't find the Bluesky account "${actor}".`);
  if (!res.ok) throw new Error(`Bluesky answered with status ${res.status}.`);
  const data = (await res.json()) as { feed?: FeedViewPost[] };
  return toDigestItems(data.feed ?? [], actor);
}
