import * as db from '../db';
import { loadSettings, updateSettings } from '../settings';
import type { Pick, Skip } from './match';

export interface ImportRecord {
  at: number;
  following: number;
  picks: Pick[];
  skipped: Skip[];
  /** Instagram accounts not on Bluesky that look like venues. */
  venueLike: string[];
  notFound: number;
  failed: number;
}

const KEY = 'instagramImport';

export async function lastImport(): Promise<ImportRecord | undefined> {
  return db.get<ImportRecord>('kv', KEY);
}

/**
 * Adds the picked accounts to the digest or radar. Accounts you already had are
 * left alone and not recorded, so undoing the import never removes them.
 */
export async function applyImport(record: ImportRecord): Promise<ImportRecord> {
  const settings = await loadSettings();
  const had = new Set([...settings.blueskyHandles, ...settings.eventHandles]);
  const picks = record.picks.filter((p) => !had.has(p.handle));
  const digest = [...settings.blueskyHandles, ...picks.filter((p) => p.destination === 'digest').map((p) => p.handle)];
  const radar = [...settings.eventHandles, ...picks.filter((p) => p.destination === 'radar').map((p) => p.handle)];
  await updateSettings({ blueskyHandles: digest, eventHandles: radar });
  // Importing again keeps earlier picks on the record, so Undo still covers them.
  const previous = (await lastImport())?.picks.filter((p) => had.has(p.handle)) ?? [];
  const saved = { ...record, picks: [...previous, ...picks] };
  await db.put('kv', saved, KEY);
  return saved;
}

/** Removes one imported account from wherever it was added. */
export async function removeImported(handle: string): Promise<void> {
  const settings = await loadSettings();
  await updateSettings({
    blueskyHandles: settings.blueskyHandles.filter((h) => h !== handle),
    eventHandles: settings.eventHandles.filter((h) => h !== handle),
  });
  const record = await lastImport();
  if (record) await db.put('kv', { ...record, picks: record.picks.filter((p) => p.handle !== handle) }, KEY);
}

/** Moves an imported account between the digest and the radar. */
export async function moveImported(handle: string, to: 'digest' | 'radar'): Promise<void> {
  const settings = await loadSettings();
  const digest = settings.blueskyHandles.filter((h) => h !== handle);
  const radar = settings.eventHandles.filter((h) => h !== handle);
  (to === 'radar' ? radar : digest).push(handle);
  await updateSettings({ blueskyHandles: digest, eventHandles: radar });
  const record = await lastImport();
  if (record) await db.put('kv', { ...record, picks: record.picks.map((p) => (p.handle === handle ? { ...p, destination: to } : p)) }, KEY);
}

/** Takes back everything the last import added. */
export async function undoImport(): Promise<void> {
  const record = await lastImport();
  if (!record) return;
  const added = new Set(record.picks.map((p) => p.handle));
  const settings = await loadSettings();
  await updateSettings({
    blueskyHandles: settings.blueskyHandles.filter((h) => !added.has(h)),
    eventHandles: settings.eventHandles.filter((h) => !added.has(h)),
  });
  await db.del('kv', KEY);
}
