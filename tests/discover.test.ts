import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverFeeds, extractCandidates } from '../relay/discover';
import { handleRelay } from '../relay/relay';
import { normalizeSite } from '../src/sources/venue';

afterEach(() => vi.unstubAllGlobals());

const page = new URL('https://venue.example/');

describe('extractCandidates', () => {
  it('finds advertised RSS/Atom feeds', () => {
    const html = `<link rel="alternate" type="application/rss+xml" title="News" href="/feed/">
      <link rel='alternate' type='application/atom+xml' href='https://venue.example/atom.xml'>`;
    expect(extractCandidates(html, page).feeds).toEqual(['https://venue.example/feed/', 'https://venue.example/atom.xml']);
  });

  it('finds iCal and webcal links', () => {
    const html = `<a href="/cal/shows.ics">iCal</a> <a href="webcal://venue.example/sub">Subscribe</a> <a href="/events/?ical=1&amp;x=2">Export</a>`;
    expect(extractCandidates(html, page).calendars).toEqual([
      'https://venue.example/cal/shows.ics',
      'https://venue.example/sub',
      'https://venue.example/events/?ical=1&x=2',
    ]);
  });

  it('turns Google Calendar embeds and links into iCal addresses', () => {
    const id = 'abc123@group.calendar.google.com';
    const html = `<iframe src="https://calendar.google.com/calendar/embed?src=${encodeURIComponent(id)}&ctz=America%2FLos_Angeles"></iframe>
      <a href="https://calendar.google.com/calendar/u/0?cid=${btoa('other@group.calendar.google.com')}">Add</a>`;
    expect(extractCandidates(html, page).calendars).toEqual([
      'https://calendar.google.com/calendar/ical/abc123%40group.calendar.google.com/public/basic.ics',
      'https://calendar.google.com/calendar/ical/other%40group.calendar.google.com/public/basic.ics',
    ]);
  });

  it("finds the site's own events pages, not other sites'", () => {
    const html = `<a href="/events">Events</a><a href="/about">About</a><a href="https://tickets.example/events/1">Tix</a><a href="/whats-on#top">On</a>`;
    expect(extractCandidates(html, page).eventPages).toEqual(['https://venue.example/events', 'https://venue.example/whats-on']);
  });

  it('knows where common event plugins publish calendars', () => {
    expect(extractCandidates('<div class="tribe-events-calendar">', page).calendars).toEqual(['https://venue.example/events/?ical=1']);
    expect(extractCandidates('<!-- squarespace -->', new URL('https://venue.example/events')).calendars).toEqual(['https://venue.example/events?format=ical']);
  });

  it('ignores unsafe links', () => {
    expect(extractCandidates('<a href="javascript:alert(1).ics">x</a>', page).calendars).toEqual([]);
  });
});

describe('discoverFeeds', () => {
  it('follows the events page, then keeps only addresses that really are feeds', async () => {
    const pages: Record<string, string> = {
      'https://venue.example/': '<a href="/events">Events</a><link rel="alternate" type="application/rss+xml" href="/feed">',
      'https://venue.example/events': '<a href="/shows.ics">iCal</a><a href="/broken.ics">old</a>',
      'https://venue.example/feed': '<rss><channel><title>Venue News</title></channel></rss>',
      'https://venue.example/shows.ics': 'BEGIN:VCALENDAR\r\nX-WR-CALNAME:Venue Shows\r\nEND:VCALENDAR',
      'https://venue.example/broken.ics': '<!doctype html><html>404</html>',
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url in pages ? new Response(pages[url]) : new Response('nope', { status: 404 }))));
    const result = await discoverFeeds(page);
    expect(result.found).toEqual([
      { url: 'https://venue.example/shows.ics', kind: 'calendar', title: 'Venue Shows' },
      { url: 'https://venue.example/feed', kind: 'feed', title: 'Venue News' },
    ]);
  });

  it('returns nothing when the site is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await discoverFeeds(page)).found).toEqual([]);
  });
});

describe('relay discover route', () => {
  const req = (site: string, token = 'secret') => new Request(`https://finity.example/relay?discover=${encodeURIComponent(site)}`, { headers: { 'x-finity-token': token } });

  it('needs the token and a public address', async () => {
    expect((await handleRelay(req('https://venue.example', 'wrong'), { FINITY_TOKEN: 'secret' })).status).toBe(401);
    expect((await handleRelay(req('http://localhost/'), { FINITY_TOKEN: 'secret' })).status).toBe(400);
  });

  it('answers with JSON, never the page itself', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><script>secret()</script></html>')));
    const res = await handleRelay(req('https://venue.example'), { FINITY_TOKEN: 'secret' });
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.text();
    expect(body).not.toContain('script');
    expect(JSON.parse(body)).toEqual({ site: 'https://venue.example/', found: [] });
  });
});

describe('normalizeSite', () => {
  it('adds https:// when missing', () => {
    expect(normalizeSite('venue.com/events')).toBe('https://venue.com/events');
    expect(normalizeSite('http://venue.com')).toBe('http://venue.com/');
    expect(normalizeSite('  ')).toBeUndefined();
  });
});
