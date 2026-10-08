import * as db from './db';
import { hasRelay } from './relay-status';
import type { Settings } from './settings';
import { fetchBluesky } from './sources/bluesky';
import { parseCalendar } from './sources/ical';
import { fetchFeedText } from './sources/relay';
import { parseFeed } from './sources/rss';
import type { DigestItem, EventItem, SourceError } from './types';
import { milesBetween, safeUrl, truncate } from './util';

export const WINDOW_DAYS = 7;
const MAX_LOCAL_POSTS = 20;

export interface RadarData {
  /** Dated events in the next 7 days, soonest first. */
  events: EventItem[];
  /** Listings without a usable date and posts from local Bluesky accounts. */
  local: (EventItem | DigestItem)[];
  errors: SourceError[];
}

export function windowRange(now = new Date()): { from: number; to: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + WINDOW_DAYS);
  return { from: start.getTime(), to: end.getTime() };
}

export function withinRadius(event: EventItem, settings: Settings): boolean {
  if (!event.geo || !settings.cityGeo) return true;
  return milesBetween(event.geo, settings.cityGeo) <= settings.radiusMiles;
}

async function loadCalendar(url: string, token: string, from: number, to: number): Promise<{ dated: EventItem[]; undated: EventItem[] }> {
  const text = await fetchFeedText(url, token);
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (/^\s*BEGIN:VCALENDAR/i.test(text.replace(/^\uFEFF/, ''))) {
    return { dated: parseCalendar(text, host, from, to), undated: [] };
  }
  const feed = parseFeed(text, url);
  const dated: EventItem[] = [];
  const undated: EventItem[] = [];
  for (const e of feed.entries) {
    const item: EventItem = {
      id: `cal:${e.id}`,
      title: e.title || 'Untitled listing',
      start: e.eventStart,
      allDay: false,
      location: e.eventLocation,
      url: e.url,
      description: truncate(e.text, 400) || undefined,
      sourceName: feed.title,
    };
    if (e.eventStart === undefined) {
      if ((e.published ?? 0) >= from - WINDOW_DAYS * 86_400_000) undated.push(item);
    } else if (e.eventStart >= from && e.eventStart <= to) {
      dated.push(item);
    }
  }
  return { dated, undated: undated.slice(0, 10) };
}

export async function loadRadar(settings: Settings): Promise<RadarData> {
  const { from, to } = windowRange();
  const errors: SourceError[] = [];
  const events: EventItem[] = [];
  const local: (EventItem | DigestItem)[] = [];

  const calendars = (await hasRelay()) ? settings.calendars : [];
  const calendarResults = await Promise.allSettled(calendars.map((c) => loadCalendar(c, settings.relayToken, from, to)));
  calendarResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      events.push(...r.value.dated);
      local.push(...r.value.undated);
    } else {
      errors.push({ source: calendars[i], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  });

  const postResults = await Promise.allSettled(settings.eventHandles.map((h) => fetchBluesky(h)));
  const posts: DigestItem[] = [];
  postResults.forEach((r, i) => {
    if (r.status === 'fulfilled') posts.push(...r.value.filter((p) => p.published >= from - WINDOW_DAYS * 86_400_000));
    else errors.push({ source: settings.eventHandles[i], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  posts.sort((a, b) => b.published - a.published);
  local.push(...posts.slice(0, MAX_LOCAL_POSTS));

  const manual = (await db.all<EventItem>('events')).filter((e) => e.start !== undefined && e.start >= from && e.start <= to);
  events.push(...manual);

  return {
    events: events.filter((e) => withinRadius(e, settings)).sort((a, b) => (a.start ?? 0) - (b.start ?? 0)),
    local,
    errors,
  };
}

export async function interestedIds(): Promise<Set<string>> {
  return new Set((await db.get<string[]>('kv', 'interested')) ?? []);
}

export async function toggleInterested(id: string): Promise<boolean> {
  const ids = await interestedIds();
  const on = !ids.has(id);
  if (on) ids.add(id);
  else ids.delete(id);
  await db.put('kv', [...ids], 'interested');
  return on;
}

function icsDate(ms: number, allDay: boolean): string {
  const iso = new Date(ms).toISOString();
  if (allDay) {
    const d = new Date(ms);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}

/** A one-event .ics file for "Add to calendar". */
export function eventToIcs(event: EventItem): string {
  const start = event.start ?? Date.now();
  const end = event.end ?? (event.allDay ? start + 86_400_000 : start + 2 * 3_600_000);
  const dateProp = (name: string, ms: number) => (event.allDay ? `${name};VALUE=DATE:${icsDate(ms, true)}` : `${name}:${icsDate(ms, false)}`);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finity//Weekend Radar//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@finity`,
    `DTSTAMP:${icsDate(Date.now(), false)}`,
    dateProp('DTSTART', start),
    dateProp('DTEND', end),
    `SUMMARY:${icsEscape(event.title)}`,
    event.location && `LOCATION:${icsEscape(event.location)}`,
    event.description && `DESCRIPTION:${icsEscape(truncate(event.description, 800))}`,
    safeUrl(event.url) && `URL:${event.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}
