// Finity can be hosted with its relay (Cloudflare) or without it (GitHub Pages).
// Without the relay, RSS feeds, calendars and website search are hidden, and
// everything else (Bluesky, shelf, manual events) works as normal.

let cached: Promise<boolean> | undefined;

/** True when this site has Finity's relay. Checked once per app launch. */
export function hasRelay(): Promise<boolean> {
  cached ??= fetch('relay', { cache: 'no-store' })
    // The relay answers 400/401/503 to an empty request; a plain static host answers 404.
    .then((res) => [400, 401, 503].includes(res.status))
    .catch(() => false);
  return cached;
}
