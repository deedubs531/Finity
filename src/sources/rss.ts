import { firstImage, htmlToText, safeUrl, stableId } from '../util';

export interface FeedEntry {
  id: string;
  title: string;
  text: string;
  url?: string;
  image?: string;
  published?: number;
  /** Event start, for event feeds that publish one (ev:startdate, xCal dtstart). */
  eventStart?: number;
  eventLocation?: string;
}

export interface ParsedFeed {
  title: string;
  entries: FeedEntry[];
}

/** Child elements matched by local name, so namespaced tags (media:, ev:, dc:) work too. */
function kids(parent: Element, ...names: string[]): Element[] {
  const wanted = names.map((n) => n.toLowerCase());
  return Array.from(parent.children).filter((c) => wanted.includes(c.localName.toLowerCase()) || wanted.includes(c.tagName.toLowerCase()));
}

function kidText(parent: Element, ...names: string[]): string {
  for (const name of names) {
    const el = kids(parent, name)[0];
    const text = el?.textContent?.trim();
    if (text) return text;
  }
  return '';
}

function parseDate(raw: string): number | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

function atomLink(entry: Element): string | undefined {
  const links = kids(entry, 'link');
  const alt = links.find((l) => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate');
  return (alt ?? links[0])?.getAttribute('href') ?? undefined;
}

function mediaImage(entry: Element, base: string): string | undefined {
  for (const el of kids(entry, 'media:thumbnail', 'thumbnail', 'media:content', 'content', 'enclosure')) {
    const url = el.getAttribute('url');
    const type = el.getAttribute('type') ?? el.getAttribute('medium') ?? '';
    if (url && (el.localName === 'thumbnail' || type.startsWith('image'))) return safeUrl(url, base);
  }
  for (const group of kids(entry, 'media:group', 'group')) {
    const img = mediaImage(group, base);
    if (img) return img;
  }
  return undefined;
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml.replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This feed could not be read.');
  const root = doc.documentElement;
  const isAtom = root.localName === 'feed';
  const channel = isAtom ? root : (kids(root, 'channel')[0] ?? root);
  const feedTitle = kidText(channel, 'title') || new URL(feedUrl).hostname;
  const siteLink = isAtom ? atomLink(root) : kidText(channel, 'link');
  const base = safeUrl(siteLink, feedUrl) ?? feedUrl;

  // RSS 1.0 (RDF) puts items beside the channel rather than inside it.
  const rawEntries = isAtom ? kids(root, 'entry') : [...kids(channel, 'item'), ...(channel !== root ? kids(root, 'item') : [])];

  const entries = rawEntries.map((entry): FeedEntry => {
    const html = isAtom
      ? kidText(entry, 'content', 'summary')
      : kidText(entry, 'content:encoded', 'encoded', 'description', 'summary');
    const url = safeUrl(isAtom ? atomLink(entry) : kidText(entry, 'link') || kidText(entry, 'guid'), base);
    const title = htmlToText(kidText(entry, 'title'));
    const published = parseDate(kidText(entry, 'published', 'updated', 'pubDate', 'dc:date', 'date'));
    const guid = kidText(entry, 'id', 'guid');
    return {
      id: stableId(feedUrl, guid || url || title),
      title,
      text: htmlToText(html),
      url,
      image: mediaImage(entry, base) ?? firstImage(html, base),
      published,
      eventStart: parseDate(kidText(entry, 'ev:startdate', 'startdate', 'xcal:dtstart', 'dtstart')),
      eventLocation: kidText(entry, 'ev:location', 'location', 'xcal:location') || undefined,
    };
  });
  return { title: htmlToText(feedTitle), entries };
}
