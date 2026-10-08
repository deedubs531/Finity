import ICAL from 'ical.js';
import type { EventItem } from '../types';
import { safeUrl, stableId } from '../util';

// Limits for recurring events, so a daily series that started years ago stays cheap.
const MAX_STEPS = 20_000;
const MAX_OCCURRENCES = 200;

/** Parses an iCal file and returns events that start between `from` and `to`. */
export function parseCalendar(text: string, sourceName: string, from: number, to: number): EventItem[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new Error('This calendar could not be read.');
  }
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // A broken timezone block shouldn't hide the whole calendar.
    }
  }
  const calName = String(root.getFirstPropertyValue('x-wr-calname') ?? '') || sourceName;
  const out: EventItem[] = [];

  // Changed occurrences of recurring events (RECURRENCE-ID) get attached to their series.
  const vevents = root.getAllSubcomponents('vevent');
  const exceptions = new Map<string, ICAL.Component[]>();
  for (const v of vevents) {
    if (!v.hasProperty('recurrence-id')) continue;
    const uid = String(v.getFirstPropertyValue('uid') ?? '');
    exceptions.set(uid, [...(exceptions.get(uid) ?? []), v]);
  }

  for (const vevent of vevents) {
    if (vevent.hasProperty('recurrence-id')) continue;
    if (String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    const event = new ICAL.Event(vevent);
    if (!event.startDate) continue;
    for (const ex of exceptions.get(event.uid) ?? []) {
      try {
        event.relateException(ex);
      } catch {
        // Ignore exceptions that don't match their series.
      }
    }

    const geoValue = vevent.getFirstPropertyValue('geo') as unknown;
    const geo = Array.isArray(geoValue) && geoValue.length === 2 ? { lat: Number(geoValue[0]), lon: Number(geoValue[1]) } : undefined;
    const base = {
      title: event.summary || 'Untitled event',
      allDay: event.startDate.isDate,
      location: event.location || undefined,
      url: safeUrl(String(vevent.getFirstPropertyValue('url') ?? '')),
      description: event.description || undefined,
      geo,
      sourceName: calName,
    };
    const durationMs = event.endDate ? event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime() : 0;

    const push = (start: number) => {
      if (start + Math.max(durationMs, 0) < from || start > to) return;
      out.push({ ...base, id: stableId(sourceName, event.uid || base.title, String(start)), start, end: durationMs > 0 ? start + durationMs : undefined });
    };

    if (event.isRecurring()) {
      const it = event.iterator();
      const before = out.length;
      for (let i = 0; i < MAX_STEPS && out.length - before < MAX_OCCURRENCES; i++) {
        const next = it.next();
        if (!next) break;
        const start = next.toJSDate().getTime();
        if (start > to) break;
        const details = event.getOccurrenceDetails(next);
        if (details.item !== event) {
          if (String(details.item.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
          // This occurrence was moved or changed by an exception.
          const moved = details.startDate.toJSDate().getTime();
          if (moved + Math.max(durationMs, 0) >= from && moved <= to) {
            out.push({ ...base, title: details.item.summary || base.title, location: details.item.location || base.location, id: stableId(sourceName, event.uid, String(moved)), start: moved, end: details.endDate.toJSDate().getTime() });
          }
        } else {
          push(start);
        }
      }
    } else {
      push(event.startDate.toJSDate().getTime());
    }
  }
  return out;
}
