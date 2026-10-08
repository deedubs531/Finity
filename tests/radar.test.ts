import { describe, expect, it } from 'vitest';
import { eventToIcs, windowRange, withinRadius } from '../src/radar';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { EventItem } from '../src/types';

const event: EventItem = {
  id: 'e1',
  title: 'Jazz, live; outdoors',
  start: Date.parse('2026-10-09T19:00:00Z'),
  allDay: false,
  location: 'Park',
  sourceName: 'x',
};

describe('radar', () => {
  it('covers today plus the next 7 days', () => {
    const { from, to } = windowRange(new Date(2026, 9, 7, 15, 30));
    expect(new Date(from)).toEqual(new Date(2026, 9, 7));
    expect(new Date(to)).toEqual(new Date(2026, 9, 14));
  });

  it('filters by distance only when both places are known', () => {
    const portland = { ...DEFAULT_SETTINGS, cityGeo: { lat: 45.52, lon: -122.68 }, radiusMiles: 25 };
    expect(withinRadius({ ...event, geo: { lat: 45.6, lon: -122.6 } }, portland)).toBe(true);
    expect(withinRadius({ ...event, geo: { lat: 47.6, lon: -122.3 } }, portland)).toBe(false);
    expect(withinRadius(event, portland)).toBe(true);
    expect(withinRadius({ ...event, geo: { lat: 47.6, lon: -122.3 } }, DEFAULT_SETTINGS)).toBe(true);
  });

  it('builds a valid .ics file for Add to calendar', () => {
    const ics = eventToIcs(event);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261009T190000Z');
    expect(ics).toContain('DTEND:20261009T210000Z');
    expect(ics).toContain('SUMMARY:Jazz\\, live\\; outdoors');
    expect(ics.endsWith('\r\n')).toBe(true);
  });
});
