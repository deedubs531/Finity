import { describe, expect, it } from 'vitest';
import { addUsage, canTakeExtra, formatRemaining, freshBudget, remainingMs, rollover, setLimit, takeExtra } from '../src/budget';

const MIN = 60_000;

describe('reading budget', () => {
  it('counts down from the daily limit', () => {
    const b = addUsage(freshBudget('2026-10-07', 20), 5 * MIN);
    expect(remainingMs(b)).toBe(15 * MIN);
  });

  it('never goes below zero', () => {
    expect(remainingMs(addUsage(freshBudget('d', 1), 10 * MIN))).toBe(0);
  });

  it('offers 5 extra minutes once, only after time runs out', () => {
    let b = freshBudget('d', 10);
    expect(canTakeExtra(b)).toBe(false);
    b = addUsage(b, 10 * MIN);
    expect(canTakeExtra(b)).toBe(true);
    b = takeExtra(b);
    expect(remainingMs(b)).toBe(5 * MIN);
    b = addUsage(b, 5 * MIN);
    expect(canTakeExtra(b)).toBe(false);
    expect(takeExtra(b)).toBe(b);
  });

  it('applies a lower limit right away', () => {
    const b = setLimit(freshBudget('d', 20), 10);
    expect(b.limitMinutes).toBe(10);
    expect(b.pendingLimitMinutes).toBeNull();
  });

  it('makes a higher limit wait until tomorrow', () => {
    let b = setLimit(freshBudget('2026-10-07', 20), 45);
    expect(b.limitMinutes).toBe(20);
    expect(b.pendingLimitMinutes).toBe(45);
    b = rollover(b, '2026-10-07');
    expect(b.limitMinutes).toBe(20);
    b = rollover(b, '2026-10-08');
    expect(b.limitMinutes).toBe(45);
    expect(b.pendingLimitMinutes).toBeNull();
  });

  it('resets usage and the extra minutes each day', () => {
    let b = takeExtra(addUsage(freshBudget('2026-10-07', 10), 10 * MIN));
    b = rollover(b, '2026-10-08');
    expect(b.usedMs).toBe(0);
    expect(b.extraTaken).toBe(false);
  });

  it('formats the time left in plain words', () => {
    expect(formatRemaining(12 * MIN)).toBe('12 minutes left today');
    expect(formatRemaining(30_000)).toBe('Under a minute left today');
    expect(formatRemaining(0)).toBe('No reading time left today');
  });
});
