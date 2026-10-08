import { safeUrl } from '../util';

export interface FoundFeed {
  url: string;
  kind: 'calendar' | 'feed';
  title: string;
}

export interface FoundAccount {
  handle: string;
  displayName: string;
  description: string;
}

/** Turns "venue.com" or "www.venue.com/events" into a full https address. */
export function normalizeSite(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  return safeUrl(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
}

/** Asks the relay to look through a website for calendars and feeds it publishes. */
export async function discoverSite(site: string, token: string): Promise<FoundFeed[]> {
  if (!token) throw new Error('Add your relay token below to search websites.');
  let res: Response;
  try {
    res = await fetch(`relay?discover=${encodeURIComponent(site)}`, { headers: { 'x-finity-token': token }, cache: 'no-store' });
  } catch {
    throw new Error('You appear to be offline.');
  }
  if (!res.ok) throw new Error((await res.text()).slice(0, 200) || `Relay error ${res.status}`);
  const data = (await res.json()) as { found?: FoundFeed[] };
  return (data.found ?? []).filter((f) => safeUrl(f.url));
}

/** Searches Bluesky's public directory for accounts matching a venue's name. */
export async function searchBlueskyAccounts(name: string): Promise<FoundAccount[]> {
  const params = new URLSearchParams({ q: name, limit: '5' });
  let res: Response;
  try {
    res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?${params}`);
  } catch {
    throw new Error('You appear to be offline.');
  }
  if (!res.ok) throw new Error(`Bluesky search answered with status ${res.status}.`);
  const data = (await res.json()) as { actors?: { handle: string; displayName?: string; description?: string }[] };
  return (data.actors ?? []).map((a) => ({ handle: a.handle, displayName: a.displayName || a.handle, description: a.description ?? '' }));
}
