import { addUsage, remainingMs, type BudgetState } from './budget';
import { changeBudget } from './budget-store';

const TICK_MS = 1000;
const SAVE_EVERY_MS = 5000;

/**
 * Counts reading time while the digest is on screen and the app is in the
 * foreground, and saves it to the budget every few seconds.
 */
export class ReadingClock {
  private unsaved = 0;
  private last = Date.now();
  private timer: number | undefined;
  private saving: Promise<unknown> = Promise.resolve();

  constructor(
    private budget: BudgetState,
    private onTick: (remaining: number) => void,
    private onEmpty: () => void,
  ) {}

  start(): void {
    this.last = Date.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Stops counting and saves any unsaved time. */
  stop(): Promise<unknown> {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
    return this.flush();
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') void this.flush();
    this.last = Date.now();
  };

  private tick(): void {
    const now = Date.now();
    if (document.visibilityState !== 'visible') {
      this.last = now;
      return;
    }
    const delta = Math.min(now - this.last, TICK_MS * 2);
    this.last = now;
    this.budget = addUsage(this.budget, delta);
    this.unsaved += delta;
    const remaining = remainingMs(this.budget);
    this.onTick(remaining);
    if (remaining === 0) {
      void this.stop().then(this.onEmpty);
    } else if (this.unsaved >= SAVE_EVERY_MS) {
      void this.flush();
    }
  }

  private flush(): Promise<unknown> {
    const added = this.unsaved;
    this.unsaved = 0;
    if (added > 0) this.saving = this.saving.then(() => changeBudget((s) => addUsage(s, added)));
    return this.saving;
  }
}
