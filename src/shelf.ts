import * as db from './db';
import type { DigestItem, EventItem, ShelfItem } from './types';
import { newId, safeUrl } from './util';

export async function shelfItems(): Promise<ShelfItem[]> {
  return (await db.all<ShelfItem>('shelf')).sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveShelfItem(item: ShelfItem): Promise<void> {
  await db.put('shelf', item);
}

export async function removeShelfItem(id: string): Promise<void> {
  await db.del('shelf', id);
}

export function fromDigest(item: DigestItem): ShelfItem {
  return {
    id: `shelf:${item.id}`,
    title: item.title,
    text: item.text,
    url: item.url,
    image: item.image,
    imageAlt: item.imageAlt,
    sourceName: item.sourceName,
    note: '',
    savedAt: Date.now(),
  };
}

/** Turns clipboard text (a link, or a link with a caption, or plain text) into a shelf item. */
export function fromClipboard(text: string): ShelfItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/https?:\/\/\S+/);
  const url = safeUrl(match?.[0]);
  const rest = url ? trimmed.replace(match![0], '').trim() : trimmed;
  return {
    id: newId(),
    text: rest.slice(0, 4000),
    url,
    note: '',
    savedAt: Date.now(),
  };
}

export async function isSaved(digestId: string): Promise<boolean> {
  return (await db.get('shelf', `shelf:${digestId}`)) !== undefined;
}

const PAYLOAD_PREFIX = 'finity:v1:';

interface PayloadItem {
  kind?: string;
  url?: string;
  text?: string;
  title?: string;
  image?: string;
  source?: string;
  date?: string;
  time?: string;
  location?: string;
}

/** Only http(s) images, or small JPEG/PNG/WebP copies made by Finity for Instagram. */
function safeImage(src: string | undefined): string | undefined {
  if (src && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(src) && src.length < 400_000) return src;
  return safeUrl(src);
}

/**
 * Reads a batch copied by "Finity for Instagram" (Send to Finity). Returns null for
 * any other clipboard text, which is then saved as a plain link or note.
 */
export function fromFinityPayload(text: string): { shelf: ShelfItem[]; events: EventItem[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PAYLOAD_PREFIX)) return null;
  let items: PayloadItem[];
  try {
    items = (JSON.parse(trimmed.slice(PAYLOAD_PREFIX.length)) as { items?: PayloadItem[] }).items ?? [];
  } catch {
    return null;
  }
  const shelf: ShelfItem[] = [];
  const events: EventItem[] = [];
  const now = Date.now();
  for (const item of items.slice(0, 200)) {
    const url = safeUrl(item.url);
    const source = String(item.source ?? 'Instagram').slice(0, 100);
    if (item.kind === 'event') {
      if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
      const time = item.time && /^\d{2}:\d{2}$/.test(item.time) ? item.time : '';
      const start = new Date(`${item.date}T${time || '00:00'}`).getTime();
      if (Number.isNaN(start)) continue;
      events.push({
        id: `manual:${newId()}`,
        title: String(item.title || 'Event').slice(0, 140),
        start,
        allDay: !time,
        location: item.location ? String(item.location).slice(0, 140) : undefined,
        url,
        description: item.text ? String(item.text).slice(0, 800) : undefined,
        sourceName: source,
        manual: true,
      });
    } else {
      shelf.push({
        id: newId(),
        text: String(item.text ?? '').slice(0, 4000),
        url,
        image: safeImage(item.image),
        sourceName: source,
        note: '',
        savedAt: now,
      });
    }
  }
  return { shelf, events };
}
