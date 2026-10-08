import { describe, expect, it } from 'vitest';
import { parseCalendar } from '../src/sources/ical';

const from = Date.parse('2026-10-07T00:00:00Z');
const to = Date.parse('2026-10-14T00:00:00Z');

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:City Library',
  'BEGIN:VEVENT',
  'UID:one',
  'DTSTART:20261009T190000Z',
  'DTEND:20261009T210000Z',
  'SUMMARY:Poetry night',
  'LOCATION:Main branch',
  'GEO:45.52;-122.68',
  'URL:https://library.example/poetry',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:old',
  'DTSTART:20260101T190000Z',
  'SUMMARY:Long ago',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly',
  'DTSTART:20250106T170000Z',
  'DTEND:20250106T180000Z',
  'RRULE:FREQ=DAILY',
  'SUMMARY:Daily story time',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly',
  'RECURRENCE-ID:20261010T170000Z',
  'DTSTART:20261010T200000Z',
  'DTEND:20261010T210000Z',
  'SUMMARY:Story time (moved)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:allday',
  'DTSTART;VALUE=DATE:20261011',
  'SUMMARY:Street fair',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:cancelled',
  'DTSTART:20261012T190000Z',
  'STATUS:CANCELLED',
  'SUMMARY:Cancelled show',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseCalendar', () => {
  const events = parseCalendar(ICS, 'library.example', from, to);

  it('keeps only events inside the window', () => {
    expect(events.find((e) => e.title === 'Long ago')).toBeUndefined();
    expect(events.find((e) => e.title === 'Cancelled show')).toBeUndefined();
  });

  it('reads a single event with place, link and map location', () => {
    expect(events.find((e) => e.title === 'Poetry night')).toMatchObject({
      start: Date.parse('2026-10-09T19:00:00Z'),
      end: Date.parse('2026-10-09T21:00:00Z'),
      location: 'Main branch',
      url: 'https://library.example/poetry',
      geo: { lat: 45.52, lon: -122.68 },
      sourceName: 'City Library',
      allDay: false,
    });
  });

  it('expands a long-running daily series into this week only, applying changes', () => {
    const story = events.filter((e) => e.title.startsWith('Story') || e.title.startsWith('Daily'));
    expect(story).toHaveLength(7);
    expect(story.find((e) => e.title === 'Story time (moved)')?.start).toBe(Date.parse('2026-10-10T20:00:00Z'));
  });

  it('marks all-day events', () => {
    expect(events.find((e) => e.title === 'Street fair')?.allDay).toBe(true);
  });

  it('throws a friendly error for junk', () => {
    expect(() => parseCalendar('not a calendar', 'x', from, to)).toThrow('could not be read');
  });
});
