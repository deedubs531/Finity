import * as db from './db';

export interface Settings {
  /** Bluesky accounts whose posts fill the digest. */
  blueskyHandles: string[];
  /** RSS/Atom feed addresses for the digest. */
  feeds: string[];
  /** Bluesky accounts that post about local events (shown in the radar). */
  eventHandles: string[];
  /** iCal or RSS calendar addresses for the radar. */
  calendars: string[];
  city: string;
  radiusMiles: number;
  /** Coordinates of `city`, looked up once when the city is saved. */
  cityGeo: { lat: number; lon: number } | null;
  relayToken: string;
  showReplies: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  blueskyHandles: [],
  feeds: [],
  eventHandles: [],
  calendars: [],
  city: '',
  radiusMiles: 25,
  cityGeo: null,
  relayToken: '',
  showReplies: false,
};

export async function loadSettings(): Promise<Settings> {
  const saved = await db.get<Partial<Settings>>('kv', 'settings');
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.put('kv', settings, 'settings');
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await saveSettings(next);
  return next;
}

/** Looks up a city's coordinates with OpenStreetMap's Nominatim (one request, on save). */
export async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  if (!city.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('Could not look up that city right now.');
  const results = (await res.json()) as { lat: string; lon: string }[];
  if (!results.length) return null;
  return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
}
