/** Fetches a feed through Finity's own relay, which lives at /relay on the same site. */
export async function fetchFeedText(feedUrl: string, token: string): Promise<string> {
  if (!token) throw new Error('Add your relay token in Settings to load feeds.');
  let res: Response;
  try {
    res = await fetch(`relay?url=${encodeURIComponent(feedUrl)}`, {
      headers: { 'x-finity-token': token },
      cache: 'no-store',
    });
  } catch {
    throw new Error('You appear to be offline.');
  }
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 200) || `Relay error ${res.status}`);
  return text;
}
