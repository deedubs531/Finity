export interface DigestItem {
  id: string;
  source: 'bluesky' | 'rss';
  /** Feed title or Bluesky display name. */
  sourceName: string;
  /** The feed address or Bluesky handle this item came from. */
  sourceKey: string;
  title?: string;
  text: string;
  url?: string;
  image?: string;
  imageAlt?: string;
  /** Extra context, e.g. "Reposted by …" or "Video: open to watch". */
  note?: string;
  /** Quoted post or link card text. */
  quote?: string;
  published: number;
  seen: boolean;
  fetchedAt: number;
}

export interface ShelfItem {
  id: string;
  title?: string;
  text: string;
  url?: string;
  image?: string;
  imageAlt?: string;
  sourceName?: string;
  note: string;
  savedAt: number;
}

export interface EventItem {
  id: string;
  title: string;
  /** Start time in ms. Undefined for listings without a usable date. */
  start?: number;
  end?: number;
  allDay: boolean;
  location?: string;
  url?: string;
  description?: string;
  geo?: { lat: number; lon: number };
  sourceName: string;
  manual?: boolean;
}

export interface SourceError {
  source: string;
  message: string;
}
