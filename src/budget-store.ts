import * as db from './db';
import { freshBudget, rollover, type BudgetState } from './budget';
import { dayKey } from './util';

export async function loadBudget(): Promise<BudgetState> {
  const saved = await db.get<BudgetState>('kv', 'budget');
  const state = rollover(saved ?? freshBudget(dayKey()), dayKey());
  if (state !== saved) await saveBudget(state);
  return state;
}

export async function saveBudget(state: BudgetState): Promise<void> {
  await db.put('kv', state, 'budget');
}

export async function changeBudget(fn: (s: BudgetState) => BudgetState): Promise<BudgetState> {
  const next = fn(await loadBudget());
  await saveBudget(next);
  return next;
}
