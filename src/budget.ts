// The daily reading budget for the digest. Pure functions, so they're easy to test;
// budget-store.ts persists the state.

export const EXTRA_MINUTES = 5;
export const DEFAULT_MINUTES = 20;

export interface BudgetState {
  /** Local day (YYYY-MM-DD) this state belongs to. */
  day: string;
  usedMs: number;
  /** Whether today's one-time "5 more minutes" has been taken. */
  extraTaken: boolean;
  limitMinutes: number;
  /** A higher limit waiting to start tomorrow. */
  pendingLimitMinutes: number | null;
}

export function freshBudget(day: string, limitMinutes = DEFAULT_MINUTES): BudgetState {
  return { day, usedMs: 0, extraTaken: false, limitMinutes, pendingLimitMinutes: null };
}

/** Starts a new day: usage resets and any pending higher limit takes effect. */
export function rollover(state: BudgetState, today: string): BudgetState {
  if (state.day === today) return state;
  return freshBudget(today, state.pendingLimitMinutes ?? state.limitMinutes);
}

/** Lowering the limit applies at once; raising it waits until tomorrow. */
export function setLimit(state: BudgetState, minutes: number): BudgetState {
  const m = Math.max(1, Math.min(240, Math.round(minutes)));
  if (m <= state.limitMinutes) return { ...state, limitMinutes: m, pendingLimitMinutes: null };
  return { ...state, pendingLimitMinutes: m };
}

export function allowanceMs(state: BudgetState): number {
  return (state.limitMinutes + (state.extraTaken ? EXTRA_MINUTES : 0)) * 60_000;
}

export function remainingMs(state: BudgetState): number {
  return Math.max(0, allowanceMs(state) - state.usedMs);
}

export function addUsage(state: BudgetState, ms: number): BudgetState {
  return { ...state, usedMs: state.usedMs + Math.max(0, ms) };
}

export function canTakeExtra(state: BudgetState): boolean {
  return !state.extraTaken && remainingMs(state) === 0;
}

export function takeExtra(state: BudgetState): BudgetState {
  return canTakeExtra(state) ? { ...state, extraTaken: true } : state;
}

export function formatRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return ms > 0 ? 'Under a minute left today' : 'No reading time left today';
  return `${minutes} minutes left today`;
}
