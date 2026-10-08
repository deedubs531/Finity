// "Find a venue": looks through a venue's website for calendars and feeds it
// already publishes, the way feed readers do autodiscovery. Only public pages
// the user points at are read, plus at most two of the site's own events pages.
// The page itself is never returned, only verified feed addresses.
import { fetchUpstream, looksLikeFeed, parseTarget } from './relay.ts';

export interface Found {
  url: string;
  kind: 'calendar' | 'feed';
  title: string;
}

export interface Discovery {
  site: string;
  found: Found[];
}

interface Candidates {
  calendars: string[];
  feeds: string[];
  eventPages: string[];
}

const HTML_ACCEPT = 'text/html, application/xhtml+xml, */*;q=0.5';
const MAX_EVENT_PAGES = 2;
const MAX_CHECKS = 10;
const EVENT_PATH = /\/(events?|calendar|shows|gigs|whats-?on|concerts|lineup|schedule|programs?)(\/|$|\?|\.)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'");
}

function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

function absolute(raw: string, base: URL): URL | null {
  try {
    const href = raw.trim().replace(/^webcals?:\/\//i, 'https://');
    const url = new URL(href, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** Google Calendar embeds and "add to Google Calendar" links → the calendar's public iCal address. */
function googleCalendarIcs(url: URL): string[] {
  if (url.hostname !== 'calendar.google.com') return [];
  const ids = url.searchParams.getAll('src');
  const cid = url.searchParams.get('cid');
  if (cid) {
    try {
      ids.push(cid.includes('@') ? cid : atob(cid.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      // Not base64; ignore.
    }
  }
  return ids.filter((id) => /^[\w.+-]+@[\w.-]+$/.test(id)).map((id) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`);
}

function isCalendarLink(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  const query = url.search.toLowerCase();
  return path.endsWith('.ics') || path.includes('/ical') || query.includes('ical=1') || query.includes('format=ical') || query.includes('outlook-ical=1');
}

/** Finds calendar, feed and events-page links in a page's HTML. */
export function extractCandidates(html: string, pageUrl: URL): Candidates {
  const calendars = new Set<string>();
  const feeds = new Set<string>();
  const eventPages = new Set<string>();

  for (const m of html.matchAll(/<(link|a|iframe)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase();
    const attrs = attrsOf(m[2]);
    const raw = tag === 'iframe' ? attrs.src : attrs.href;
    if (!raw) continue;
    const url = absolute(raw, pageUrl);
    if (!url) continue;

    googleCalendarIcs(url).forEach((c) => calendars.add(c));
    if (tag === 'link') {
      const type = (attrs.type ?? '').toLowerCase();
      if (/\balternate\b/i.test(attrs.rel ?? '') && (type.includes('rss') || type.includes('atom'))) feeds.add(url.toString());
      if (type.includes('calendar')) calendars.add(url.toString());
    } else if (tag === 'a') {
      if (isCalendarLink(url) || /^webcals?:/i.test(raw.trim())) calendars.add(url.toString());
      else if (url.hostname === pageUrl.hostname && EVENT_PATH.test(url.pathname + url.search) && url.toString() !== pageUrl.toString()) {
        eventPages.add(url.toString().replace(/#.*$/, ''));
      }
    }
  }

  // Common website tools publish calendars at predictable addresses.
  const lower = html.toLowerCase();
  if (lower.includes('tribe-events') || lower.includes('the-events-calendar')) {
    calendars.add(new URL('/events/?ical=1', pageUrl).toString());
  }
  if (lower.includes('squarespace') && EVENT_PATH.test(pageUrl.pathname)) {
    const ics = new URL(pageUrl.toString());
    ics.search = '?format=ical';
    calendars.add(ics.toString());
  }

  return { calendars: [...calendars], feeds: [...feeds], eventPages: [...eventPages] };
}

function titleOf(text: string, fallback: string): string {
  const cal = text.match(/^X-WR-CALNAME:(.+)$/im)?.[1];
  const xml = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const raw = (cal ?? xml ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
  return decodeEntities(raw).slice(0, 120) || fallback;
}

async function verify(url: string): Promise<Found | null> {
  const target = parseTarget(url);
  if (!target) return null;
  const fetched = await fetchUpstream(target, 'text/calendar, application/rss+xml, application/atom+xml, application/xml, */*;q=0.5');
  if (!fetched.ok || !looksLikeFeed(fetched.text)) return null;
  const isCalendar = /^\s*BEGIN:VCALENDAR/i.test(fetched.text.replace(/^﻿/, ''));
  return { url, kind: isCalendar ? 'calendar' : 'feed', title: titleOf(fetched.text, target.hostname) };
}

export async function discoverFeeds(site: URL): Promise<Discovery> {
  const first = await fetchUpstream(site, HTML_ACCEPT);
  if (!first.ok) return { site: site.toString(), found: [] };
  if (looksLikeFeed(first.text)) {
    const found = await verify(site.toString());
    return { site: site.toString(), found: found ? [found] : [] };
  }

  const all: Candidates = extractCandidates(first.text, site);
  // Calendars are usually linked from the events page rather than the home page.
  const pages = await Promise.all(
    all.eventPages.slice(0, MAX_EVENT_PAGES).map(async (page) => {
      const target = parseTarget(page);
      const fetched = target ? await fetchUpstream(target, HTML_ACCEPT) : null;
      return fetched?.ok && target ? extractCandidates(fetched.text, target) : null;
    }),
  );
  for (const p of pages) {
    if (!p) continue;
    all.calendars.push(...p.calendars);
    all.feeds.push(...p.feeds);
  }

  // Calendars first: they're the most useful for the radar.
  const toCheck = [...new Set([...all.calendars, ...all.feeds])].slice(0, MAX_CHECKS);
  const verified = await Promise.all(toCheck.map(verify));
  return { site: site.toString(), found: verified.filter((f): f is Found => f !== null) };
}
