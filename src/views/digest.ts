import { canTakeExtra, EXTRA_MINUTES, formatRemaining, remainingMs, takeExtra } from '../budget';
import { changeBudget, loadBudget } from '../budget-store';
import { lastRefresh, markSeen, refreshDigest, unseenItems } from '../digest';
import { ReadingClock } from '../reading-clock';
import { hasRelay } from '../relay-status';
import { loadSettings } from '../settings';
import { fromDigest, isSaved, saveShelfItem } from '../shelf';
import type { DigestItem, SourceError } from '../types';
import { h, relativeTime, toast } from '../util';
import { emptyState, errorList, externalLink, fill, image } from './common';

/** Opening the digest fetches new items if the last fetch was longer ago than this. */
const AUTO_REFRESH_MS = 15 * 60 * 1000;

function itemCard(item: DigestItem, saved: boolean): HTMLElement {
  const save = h(
    'button',
    {
      class: saved ? 'plain saved' : 'plain',
      type: 'button',
      disabled: saved,
      onclick: async () => {
        await saveShelfItem(fromDigest(item));
        save.textContent = 'Saved';
        save.disabled = true;
        save.classList.add('saved');
        toast('Saved to your shelf');
      },
    },
    saved ? 'Saved' : 'Save',
  );
  return h(
    'article',
    { class: 'story', 'data-id': item.id },
    h('p', { class: 'byline' }, item.sourceName, h('span', { class: 'dot' }, ' · '), relativeTime(item.published)),
    item.note && h('p', { class: 'note' }, item.note),
    item.title && h('h3', { class: 'headline' }, item.title),
    item.text && h('p', { class: 'body' }, item.text),
    item.quote && h('blockquote', {}, item.quote),
    item.image && h('figure', {}, image(item.image, item.imageAlt)),
    h('div', { class: 'actions' }, save, item.url && externalLink(item.url, 'Open original')),
  );
}

function timesUp(extraAvailable: boolean, onExtra: () => void): HTMLElement {
  return h(
    'section',
    { class: 'times-up' },
    h('p', { class: 'fleuron', 'aria-hidden': 'true' }, '❧'),
    h('h2', {}, "Time's up for today"),
    h('p', {}, "You've read your fill. The digest will be here tomorrow."),
    extraAvailable
      ? h('button', { class: 'button secondary', type: 'button', onclick: onExtra }, `${EXTRA_MINUTES} more minutes (once a day)`)
      : h('p', { class: 'quiet' }, 'See you tomorrow.'),
    h('p', { class: 'alternatives' }, 'Meanwhile, ', h('a', { href: '#/shelf' }, 'browse your shelf'), ' or ', h('a', { href: '#/radar' }, 'find something to do this week'), '.'),
  );
}

export async function renderDigest(root: HTMLElement): Promise<() => void> {
  let disposed = false;
  let clock: ReadingClock | undefined;
  let observer: IntersectionObserver | undefined;
  const seenNow = new Set<string>();

  const flushSeen = () => {
    const ids = [...seenNow];
    seenNow.clear();
    return markSeen(ids);
  };

  /** Stops the clock and saves what was read. */
  const pause = async () => {
    observer?.disconnect();
    observer = undefined;
    await clock?.stop();
    clock = undefined;
    await flushSeen();
  };

  async function draw(errors: SourceError[] = [], refreshing = false): Promise<void> {
    await pause();
    if (disposed) return;
    const settings = await loadSettings();
    const budget = await loadBudget();

    if (remainingMs(budget) === 0) {
      fill(root, 
        timesUp(canTakeExtra(budget), async () => {
          await changeBudget(takeExtra);
          await draw();
        }),
      );
      return;
    }

    const relay = await hasRelay();
    if (!settings.blueskyHandles.length && !(relay && settings.feeds.length)) {
      const what = relay ? 'a few Bluesky accounts or RSS feeds' : 'a few Bluesky accounts';
      fill(root, 
        emptyState('Your digest is empty', `Add ${what} you care about. Finity shows only what they post, newest first, and then stops.`, {
          label: 'Add sources',
          href: '#/settings',
        }),
      );
      return;
    }

    const items = await unseenItems(settings);
    const savedFlags = await Promise.all(items.map((i) => isSaved(i.id)));
    if (disposed) return;

    const remaining = h('span', { class: 'remaining' }, formatRemaining(remainingMs(budget)));
    fill(root, 
      h(
        'div',
        { class: 'toolbar' },
        remaining,
        h('button', { class: 'plain', type: 'button', disabled: refreshing, onclick: () => void refresh() }, refreshing ? 'Checking…' : 'Check for new'),
      ),
      errorList(errors),
      ...items.map((item, i) => itemCard(item, savedFlags[i])),
      h(
        'section',
        { class: 'caught-up' },
        h('p', { class: 'fleuron', 'aria-hidden': 'true' }, '❧'),
        h('h2', {}, "You're caught up"),
        h('p', {}, items.length ? "That's everything new from your sources." : 'Nothing new since you last looked.'),
      ),
    );

    // An item counts as read once most of it has been on screen.
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = (e.target as HTMLElement).dataset.id;
          if (id) seenNow.add(id);
          observer?.unobserve(e.target);
        }
      },
      { threshold: 0.6 },
    );
    root.querySelectorAll<HTMLElement>('.story').forEach((el) => observer!.observe(el));

    clock = new ReadingClock(
      budget,
      (ms) => (remaining.textContent = formatRemaining(ms)),
      () => void draw(),
    );
    clock.start();
  }

  async function refresh(): Promise<void> {
    await draw([], true);
    const errors = await refreshDigest(await loadSettings());
    await draw(errors);
  }

  // Save read items when the app goes to the background, in case iOS closes it.
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSeen();
  };
  document.addEventListener('visibilitychange', onHide);

  const settings = await loadSettings();
  const hasSources = settings.blueskyHandles.length + ((await hasRelay()) ? settings.feeds.length : 0) > 0;
  if (hasSources && remainingMs(await loadBudget()) > 0 && Date.now() - (await lastRefresh()) > AUTO_REFRESH_MS) {
    await refresh();
  } else {
    await draw();
  }

  return () => {
    disposed = true;
    document.removeEventListener('visibilitychange', onHide);
    void pause();
  };
}
