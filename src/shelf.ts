import * as db from './db';
import type { DigestItem, ShelfItem } from './types';
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
