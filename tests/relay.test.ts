import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRelay, looksLikeFeed, MAX_BYTES, parseTarget } from '../relay/relay';

const env = { FINITY_TOKEN: 'secret' };
const req = (url: string, token = 'secret', method = 'GET') =>
  new Request(`https://finity.example/relay?url=${encodeURIComponent(url)}`, { method, headers: { 'x-finity-token': token } });

afterEach(() => vi.unstubAllGlobals());

describe('relay', () => {
  it('rejects requests without the right token', async () => {
    expect((await handleRelay(req('https://a.example/feed', 'wrong'), env)).status).toBe(401);
    expect((await handleRelay(req('https://a.example/feed'), {})).status).toBe(503);
  });

  it('only allows GET', async () => {
    expect((await handleRelay(req('https://a.example/feed', 'secret', 'POST'), env)).status).toBe(405);
  });

  it('refuses non-web and private addresses', () => {
    for (const bad of ['file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1/', 'http://192.168.1.1/', 'http://[::1]/', 'https://user:pw@a.example/']) {
      expect(parseTarget(bad)).toBeNull();
    }
    expect(parseTarget('https://fcbarcelona.example/feed')).not.toBeNull();
  });

  it('returns feeds as sandboxed plain text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<rss><channel><title>x</title></channel></rss>', { headers: { 'content-type': 'application/rss+xml' } })));
    const res = await handleRelay(req('https://a.example/feed'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(await res.text()).toContain('<rss>');
  });

  it('refuses ordinary web pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html><html></html>', { headers: { 'content-type': 'text/html' } })));
    expect((await handleRelay(req('https://a.example/'), env)).status).toBe(415);
  });

  it('refuses very large responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<' + 'x'.repeat(MAX_BYTES + 10))));
    expect((await handleRelay(req('https://a.example/huge'), env)).status).toBe(413);
  });

  it('decodes feeds in other character sets', async () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode('<rss>caf'), 0xe9, ...new TextEncoder().encode('</rss>')]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(latin1, { headers: { 'content-type': 'text/xml; charset=ISO-8859-1' } })));
    expect(await (await handleRelay(req('https://a.example/feed'), env)).text()).toBe('<rss>café</rss>');
  });

  it('recognises feed formats', () => {
    expect(looksLikeFeed('﻿<?xml version="1.0"?><rss/>')).toBe(true);
    expect(looksLikeFeed('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(looksLikeFeed('{"json": true}')).toBe(false);
  });
});

describe('looksLikeFeed (strict)', () => {
  it('accepts feeds with prologs, stylesheets and comments', () => {
    expect(looksLikeFeed('<?xml version="1.0"?>\n<?xml-stylesheet href="s.xsl"?>\n<!-- hi -->\n<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(looksLikeFeed('<rdf:RDF xmlns:rdf="x">')).toBe(true);
  });

  it('rejects pages and other XML', () => {
    expect(looksLikeFeed('<a href="/events">Events</a>')).toBe(false);
    expect(looksLikeFeed('<?xml version="1.0"?><svg/>')).toBe(false);
    expect(looksLikeFeed('<head><title>x</title></head>')).toBe(false);
  });
});
