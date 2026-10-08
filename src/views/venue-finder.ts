import { loadSettings, updateSettings, type Settings } from '../settings';
import { discoverSite, normalizeSite, searchBlueskyAccounts, type FoundAccount, type FoundFeed } from '../sources/venue';
import { h, hostOf, toast, truncate } from '../util';
import { externalLink, fill } from './common';

/** Tells the list editors on the settings screen to reload after the finder adds something. */
export const SETTINGS_CHANGED = 'finity:settings-changed';

type ListKey = 'feeds' | 'calendars' | 'eventHandles';

async function addTo(key: ListKey, value: string, label: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings[key].includes(value)) await updateSettings({ [key]: [...settings[key], value] } as Partial<Settings>);
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
  toast(`Added to ${label}`);
}

function addButton(key: ListKey, value: string, label: string, settings: Settings): HTMLButtonElement {
  const already = settings[key].includes(value);
  const button = h(
    'button',
    {
      class: 'plain',
      type: 'button',
      disabled: already,
      onclick: async () => {
        await addTo(key, value, label);
        button.textContent = 'Added';
        button.disabled = true;
      },
    },
    already ? 'Added' : `Add to ${label}`,
  );
  return button;
}

function feedRow(found: FoundFeed, settings: Settings): HTMLElement {
  return h(
    'li',
    { class: 'result' },
    h('span', { class: 'result-text' }, h('strong', {}, found.title), h('span', { class: 'quiet' }, ` · ${found.kind === 'calendar' ? 'Calendar' : 'Feed'} · ${hostOf(found.url)}`)),
    h(
      'span',
      { class: 'actions' },
      addButton('calendars', found.url, 'radar', settings),
      found.kind === 'feed' && addButton('feeds', found.url, 'digest', settings),
    ),
  );
}

function accountRow(account: FoundAccount, settings: Settings): HTMLElement {
  return h(
    'li',
    { class: 'result' },
    h(
      'span',
      { class: 'result-text' },
      h('strong', {}, account.displayName),
      h('span', { class: 'quiet' }, ` @${account.handle}`),
      account.description && h('span', { class: 'result-desc' }, truncate(account.description, 140)),
    ),
    h('span', { class: 'actions' }, addButton('eventHandles', account.handle, 'radar', settings), externalLink(`https://bsky.app/profile/${account.handle}`, 'View')),
  );
}

/** `relay` is false on hosts without Finity's relay; then only the Bluesky name search is offered. */
export function venueFinder(relay: boolean): HTMLElement {
  const site = h('input', { name: 'site', inputmode: 'url', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: 'venue.com' }) as HTMLInputElement;
  const name = h('input', { name: 'name', placeholder: 'e.g. Doug Fir Lounge' }) as HTMLInputElement;
  const submit = h('button', { class: 'button secondary', type: 'submit' }, 'Search');
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const form = h(
    'form',
    { class: 'stack' },
    relay && h('label', { class: 'field' }, h('span', {}, 'Their website'), site),
    h('label', { class: 'field' }, h('span', {}, relay ? 'Their name (to search Bluesky)' : 'Their name'), name),
    submit,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const siteUrl = relay ? normalizeSite(site.value) : undefined;
    const query = name.value.trim();
    if (!siteUrl && !query) return toast(relay ? 'Enter a website, a name, or both.' : 'Enter their name.');
    submit.disabled = true;
    submit.textContent = 'Searching…';
    fill(results, h('p', { class: 'hint' }, 'Looking…'));

    const settings = await loadSettings();
    const [feeds, accounts] = await Promise.allSettled([
      siteUrl ? discoverSite(siteUrl, settings.relayToken) : Promise.resolve(null),
      query ? searchBlueskyAccounts(query) : Promise.resolve(null),
    ]);
    submit.disabled = false;
    submit.textContent = 'Search';

    const sections: (HTMLElement | null)[] = [];
    if (siteUrl) {
      if (feeds.status === 'rejected') {
        sections.push(h('p', { class: 'notice' }, feeds.reason instanceof Error ? feeds.reason.message : 'Website search failed.'));
      } else if (feeds.value?.length) {
        sections.push(h('h4', {}, `On ${hostOf(siteUrl)}`), h('ul', { class: 'list' }, feeds.value.map((f) => feedRow(f, settings))));
      } else {
        sections.push(
          h('h4', {}, `On ${hostOf(siteUrl)}`),
          h(
            'p',
            { class: 'hint' },
            "No calendar or feed found automatically. On their events page, look for a link called Subscribe, iCal, ICS or Add to calendar, copy it, and paste it under Event calendars below.",
          ),
        );
      }
    }
    if (query) {
      if (accounts.status === 'rejected') {
        sections.push(h('p', { class: 'notice' }, accounts.reason instanceof Error ? accounts.reason.message : 'Bluesky search failed.'));
      } else if (accounts.value?.length) {
        sections.push(
          h('h4', {}, 'On Bluesky'),
          h('p', { class: 'hint' }, 'Check it is really them before adding: names can match by chance.'),
          h('ul', { class: 'list' }, accounts.value.map((a) => accountRow(a, settings))),
        );
      } else {
        sections.push(h('h4', {}, 'On Bluesky'), h('p', { class: 'hint' }, `No Bluesky accounts match "${query}".`));
      }
    }
    fill(results, ...sections);
  });

  return h(
    'div',
    { class: 'setting', id: 'venue-finder' },
    h('h3', {}, 'Find a venue'),
    h(
      'p',
      { class: 'hint' },
      relay
        ? 'Found a venue or organizer on Instagram? Most also publish a calendar or feed on their own website, or post on Bluesky. Enter their website and name, and Finity will look.'
        : 'Found a venue or organizer on Instagram? Many also post on Bluesky. Enter their name and Finity will look.',
    ),
    form,
    results,
    relay && newsletterTip(),
  );
}

/** Newsletter-to-feed tip; only useful when RSS feeds can be read (needs the relay). */
function newsletterTip(): HTMLElement {
  return h(
    'details',
    { class: 'tip' },
    h('summary', {}, 'Only on Instagram and email?'),
    h(
      'p',
      { class: 'hint' },
      'Many venues send a newsletter. ',
      externalLink('https://kill-the-newsletter.com/', 'Kill the Newsletter'),
      ' turns one into a feed: it gives you an email address to sign up with, plus a feed address to paste under Event calendars or RSS feeds. That free service can read the newsletters you send to it, so use it only for public mailing lists.',
    ),
  );
}
