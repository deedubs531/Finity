// The Finity relay fetches RSS, Atom and iCal feeds on behalf of the app, because
// most sites block browsers from reading feeds directly (CORS). It can also look
// through a venue's website for the feeds it advertises (see discover.ts). It
// stores and logs nothing, and only answers requests that carry the owner's token.
import { discoverFeeds } from './discover.ts';

export interface RelayEnv {
  FINITY_TOKEN?: string;
}

export const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'Finity feed reader (personal use; +https://github.com/deedubs531/Punk)';

function reply(status: number, body: string, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(body, {
    status,
    headers: {
      // Plain text (or JSON), sandboxed, so fetched content can never run as a page on our origin.
      'content-type': contentType,
      'content-security-policy': "sandbox; default-src 'none'",
      'x-content-type-options': 'nosniff',
      'cache-control': status === 200 ? 'private, max-age=300' : 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) return h === '::' || h === '::1' || /^f[cd]/.test(h) || h.startsWith('fe80');
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function parseTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return null;
  if (target.username || target.password) return null;
  if (isPrivateHost(target.hostname)) return null;
  return target;
}

function charsetOf(contentType: string | null, head: Uint8Array): string {
  const fromHeader = contentType?.match(/charset="?([\w-]+)"?/i)?.[1];
  if (fromHeader) return fromHeader;
  const prolog = new TextDecoder('ascii').decode(head.subarray(0, 200));
  return prolog.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1] ?? 'utf-8';
}

async function readLimited(body: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** True for RSS, Atom, RSS 1.0 (RDF) and iCal documents; false for web pages and everything else. */
export function looksLikeFeed(text: string): boolean {
  const start = text.replace(/^\uFEFF/, '').trimStart();
  if (/^begin:vcalendar/i.test(start)) return true;
  if (!start.startsWith('<')) return false;
  // Skip the XML prolog, stylesheet instructions and comments, then expect a feed's root element.
  const root = start.slice(0, 4000).replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi, '').trimStart();
  return /^<(rss|feed|rdf:rdf)[\s>/]/i.test(root);
}

export type Fetched = { ok: true; text: string; contentType: string } | { ok: false; status: number; message: string };

/** Fetches a public page or feed with the relay's limits: timeout, size cap, charset decoding. */
export async function fetchUpstream(target: URL, accept: string): Promise<Fetched> {
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { 'user-agent': USER_AGENT, accept },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, message: 'Could not reach that site.' };
  }
  if (!upstream.ok || !upstream.body) return { ok: false, status: 502, message: `The site answered with status ${upstream.status}.` };

  const bytes = await readLimited(upstream.body);
  if (!bytes) return { ok: false, status: 413, message: 'That page is too large.' };

  const contentType = upstream.headers.get('content-type') ?? '';
  let text: string;
  try {
    text = new TextDecoder(charsetOf(contentType, bytes)).decode(bytes);
  } catch {
    text = new TextDecoder('utf-8').decode(bytes);
  }
  return { ok: true, text, contentType };
}

const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/calendar, */*;q=0.5';

export async function handleRelay(request: Request, env: RelayEnv): Promise<Response> {
  if (request.method !== 'GET') return reply(405, 'Only GET is allowed.');
  if (!env.FINITY_TOKEN) return reply(503, 'Relay is not configured: set the FINITY_TOKEN secret.');
  const token = request.headers.get('x-finity-token') ?? '';
  if (!sameSecret(token, env.FINITY_TOKEN)) return reply(401, 'Wrong or missing relay token.');

  const params = new URL(request.url).searchParams;
  const discoverTarget = params.get('discover');
  if (discoverTarget !== null) {
    const site = parseTarget(discoverTarget);
    if (!site) return reply(400, 'Give a public http(s) website address.');
    const found = await discoverFeeds(site);
    return reply(200, JSON.stringify(found), 'application/json; charset=utf-8');
  }

  const target = parseTarget(params.get('url'));
  if (!target) return reply(400, 'Give a public http(s) feed address.');

  const fetched = await fetchUpstream(target, FEED_ACCEPT);
  if (!fetched.ok) return reply(fetched.status, fetched.message.replace('page', 'feed'));
  if (!looksLikeFeed(fetched.text)) return reply(415, 'That address is a web page, not an RSS, Atom or iCal feed.');
  return reply(200, fetched.text);
}
