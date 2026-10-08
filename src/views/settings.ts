import { setLimit } from '../budget';
import { changeBudget, loadBudget } from '../budget-store';
import * as db from '../db';
import { geocodeCity, loadSettings, updateSettings, type Settings } from '../settings';
import { normalizeHandle } from '../sources/bluesky';
import { h, safeUrl, toast } from '../util';
import { fill } from './common';
import { SETTINGS_CHANGED, venueFinder } from './venue-finder';
import { hasRelay } from '../relay-status';

type ListKey = 'blueskyHandles' | 'feeds' | 'eventHandles' | 'calendars';

function listEditor(opts: {
  key: ListKey;
  settings: Settings;
  label: string;
  hint: string;
  placeholder: string;
  inputmode?: string;
  normalize: (raw: string) => string | null;
  invalidMessage: string;
}): HTMLElement {
  let items = [...opts.settings[opts.key]];
  const list = h('ul', { class: 'list' });
  const input = h('input', { placeholder: opts.placeholder, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', inputmode: opts.inputmode, 'aria-label': opts.label });

  const save = async () => {
    await updateSettings({ [opts.key]: items } as Partial<Settings>);
    renderList();
  };

  function renderList(): void {
    list.replaceChildren(
      ...items.map((item) =>
        h(
          'li',
          {},
          h('span', { class: 'list-item' }, item),
          h(
            'button',
            {
              class: 'plain danger',
              type: 'button',
              'aria-label': `Remove ${item}`,
              onclick: async () => {
                items = items.filter((i) => i !== item);
                await save();
              },
            },
            'Remove',
          ),
        ),
      ),
    );
    if (!items.length) list.append(h('li', { class: 'quiet' }, 'None yet.'));
  }

  const form = h(
    'form',
    { class: 'add-row' },
    input,
    h('button', { class: 'button secondary', type: 'submit' }, 'Add'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = opts.normalize(input.value);
    if (!value) {
      toast(opts.invalidMessage);
      return;
    }
    if (!items.includes(value)) items.push(value);
    input.value = '';
    await save();
  });

  renderList();
  // The venue finder can add to these lists too; reload when it does.
  const reload = async () => {
    if (!list.isConnected) return window.removeEventListener(SETTINGS_CHANGED, reload);
    items = [...(await loadSettings())[opts.key]];
    renderList();
  };
  window.addEventListener(SETTINGS_CHANGED, reload);
  return h('div', { class: 'setting' }, h('h3', {}, opts.label), h('p', { class: 'hint' }, opts.hint), list, form);
}

const handleInput = (raw: string) => {
  const handle = normalizeHandle(raw);
  return /^([a-z0-9-]+\.)+[a-z0-9-]+$|^did:[a-z]+:[\w.:-]+$/.test(handle) ? handle : null;
};
const urlInput = (raw: string) => safeUrl(raw.trim().replace(/^webcal:/i, 'https:')) ?? null;

async function budgetSection(): Promise<HTMLElement> {
  const budget = await loadBudget();
  const input = h('input', { type: 'number', min: 1, max: 240, inputmode: 'numeric', value: budget.limitMinutes, 'aria-label': 'Daily minutes' }) as HTMLInputElement;
  const status = h('p', { class: 'hint' });
  const showStatus = (limit: number, pending: number | null) => {
    status.textContent = pending
      ? `Today: ${limit} minutes. Starting tomorrow: ${pending} minutes.`
      : `Currently ${limit} minutes a day. Lowering it applies right away; raising it starts tomorrow.`;
  };
  showStatus(budget.limitMinutes, budget.pendingLimitMinutes);
  const form = h('form', { class: 'add-row' }, input, h('span', { class: 'unit' }, 'minutes'), h('button', { class: 'button secondary', type: 'submit' }, 'Save'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 1) return toast('Enter a number of minutes.');
    const next = await changeBudget((s) => setLimit(s, value));
    input.value = String(next.limitMinutes);
    showStatus(next.limitMinutes, next.pendingLimitMinutes);
    toast(next.pendingLimitMinutes ? 'New limit starts tomorrow' : 'Saved');
  });
  return h('div', { class: 'setting' }, h('h3', {}, 'Daily reading time'), h('p', { class: 'hint' }, 'How long the digest stays open each day. The shelf and radar are never limited.'), form, status);
}

function locationSection(settings: Settings): HTMLElement {
  const city = h('input', { value: settings.city, placeholder: 'e.g. Portland, Oregon', 'aria-label': 'City' }) as HTMLInputElement;
  const radius = h('input', { type: 'number', min: 1, max: 500, inputmode: 'numeric', value: settings.radiusMiles, 'aria-label': 'Radius in miles' }) as HTMLInputElement;
  const status = h('p', { class: 'hint' }, settings.cityGeo ? 'Location found.' : settings.city ? "Couldn't find that place; events won't be filtered by distance." : '');
  const form = h(
    'form',
    { class: 'stack' },
    h('label', { class: 'field' }, h('span', {}, 'City'), city),
    h('label', { class: 'field' }, h('span', {}, 'Radius (miles)'), radius),
    h('button', { class: 'button secondary', type: 'submit' }, 'Save location'),
    status,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = city.value.trim();
    let cityGeo: Settings['cityGeo'] = null;
    try {
      cityGeo = await geocodeCity(name);
      status.textContent = !name ? '' : cityGeo ? 'Location found.' : "Couldn't find that place; events won't be filtered by distance.";
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Lookup failed.';
    }
    await updateSettings({ city: name, radiusMiles: Math.max(1, Number(radius.value) || 25), cityGeo });
    toast('Location saved');
  });
  return h(
    'div',
    { class: 'setting' },
    h('h3', {}, 'Your area'),
    h('p', { class: 'hint' }, 'Typed in, never tracked. Finity looks the city up once on OpenStreetMap to filter events that list a map location.'),
    form,
  );
}

function relaySection(settings: Settings): HTMLElement {
  const input = h('input', { type: 'password', value: settings.relayToken, autocomplete: 'off', 'aria-label': 'Relay token' }) as HTMLInputElement;
  const status = h('p', { class: 'hint' });
  const form = h('form', { class: 'add-row' }, input, h('button', { class: 'button secondary', type: 'submit' }, 'Save & test'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateSettings({ relayToken: input.value.trim() });
    status.textContent = 'Testing…';
    try {
      // Without a feed address, a correct token gets "400" and a wrong one gets "401".
      const res = await fetch('relay', { headers: { 'x-finity-token': input.value.trim() } });
      status.textContent =
        res.status === 400 ? 'The relay is working.' : res.status === 401 ? 'The relay rejected this token.' : res.status === 503 ? 'The relay has no token set yet (see README).' : `Unexpected answer: ${res.status}`;
    } catch {
      status.textContent = "Couldn't reach the relay.";
    }
  });
  return h(
    'div',
    { class: 'setting' },
    h('h3', {}, 'Relay token'),
    h('p', { class: 'hint' }, 'The secret you set as FINITY_TOKEN when deploying. Needed for RSS feeds and calendars; Bluesky works without it.'),
    form,
    status,
  );
}

/** Shown on hosts without the relay (e.g. GitHub Pages). */
function noRelayNote(): HTMLElement {
  return h(
    'div',
    { class: 'setting' },
    h('h3', {}, 'RSS feeds and calendars'),
    h(
      'p',
      { class: 'hint' },
      'This copy of Finity runs without its relay, so RSS feeds, event calendars and website search are switched off. Bluesky, the shelf and your own events work fully. Hosting Finity on Cloudflare adds the relay; see the README.',
    ),
  );
}

function shortcutSection(): HTMLElement {
  return h(
    'div',
    { class: 'setting', id: 'shortcut' },
    h('h3', {}, 'Share from other apps (iPhone)'),
    h('p', { class: 'hint' }, "iPhone doesn't let web apps appear in the Share menu, so a Shortcut copies the item and you save it in Finity."),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, 'Open the Shortcuts app and tap + to make a new shortcut. Name it "Save to Finity".'),
      h('li', {}, 'Tap the (i) button, turn on "Show in Share Sheet", and set it to receive URLs and Text.'),
      h('li', {}, 'Add the action "Copy to Clipboard" with Shortcut Input.'),
      h('li', {}, 'Add the action "Show Notification" with the text "Copied. Open Finity and tap Save copied item."'),
      h('li', {}, 'Now in any app: Share → Save to Finity. Then open Finity → Shelf → Save copied item.'),
    ),
  );
}

function dataSection(): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!confirm('Replace everything in Finity with this backup?')) return;
    try {
      await db.importAll(JSON.parse(await file.text()));
      toast('Backup restored');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That file could not be read.');
    }
  });
  return h(
    'div',
    { class: 'setting' },
    h('h3', {}, 'Your data'),
    h('p', { class: 'hint' }, 'Everything stays on this device. Nothing is sent anywhere except requests to the sources you add.'),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'button secondary',
          type: 'button',
          onclick: async () => {
            const blob = new Blob([JSON.stringify(await db.exportAll(), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = h('a', { href: url, download: `finity-backup-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          },
        },
        'Export backup',
      ),
      h('button', { class: 'button secondary', type: 'button', onclick: () => fileInput.click() }, 'Import backup'),
      h(
        'button',
        {
          class: 'button danger',
          type: 'button',
          onclick: async () => {
            if (!confirm('Delete all of Finity\'s data on this device? This cannot be undone.')) return;
            await db.wipeAll();
            location.hash = '#/digest';
            location.reload();
          },
        },
        'Wipe all data',
      ),
    ),
    fileInput,
  );
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  const settings = await loadSettings();
  const replies = h('input', { type: 'checkbox', checked: settings.showReplies }) as HTMLInputElement;
  replies.addEventListener('change', () => void updateSettings({ showReplies: replies.checked }));

  // RSS feeds and calendars are read through the relay; hosts without it (GitHub Pages) hide them.
  const relay = await hasRelay();
  const feedsEditor = relay
    ? listEditor({
        key: 'feeds',
        settings,
        label: 'RSS feeds',
        hint: 'Feed addresses for blogs, news sites and newsletters (Substack: add /feed to the address).',
        placeholder: 'https://example.com/feed',
        inputmode: 'url',
        normalize: urlInput,
        invalidMessage: 'Enter a full web address starting with https://',
      })
    : null;
  const calendarsEditor = relay
    ? listEditor({
        key: 'calendars',
        settings,
        label: 'Event calendars',
        hint: 'iCal (.ics) or RSS links from venues, libraries, museums or your city. Look for "Subscribe" or "iCal" on their events page.',
        placeholder: 'https://venue.com/events.ics',
        inputmode: 'url',
        normalize: urlInput,
        invalidMessage: 'Enter a full web address starting with https:// or webcal://',
      })
    : null;

  fill(root, 
    h('h2', { class: 'section-head' }, 'Digest'),
    listEditor({
      key: 'blueskyHandles',
      settings,
      label: 'Bluesky accounts',
      hint: 'Handles like name.bsky.social, or a bsky.app profile link. No login needed.',
      placeholder: 'name.bsky.social',
      normalize: handleInput,
      invalidMessage: "That doesn't look like a Bluesky handle.",
    }),
    h('label', { class: 'toggle' }, replies, h('span', {}, 'Include replies from these accounts')),
    feedsEditor,
    await budgetSection(),
    h('h2', { class: 'section-head' }, 'Radar'),
    locationSection(settings),
    venueFinder(relay),
    calendarsEditor,
    listEditor({
      key: 'eventHandles',
      settings,
      label: 'Local event accounts on Bluesky',
      hint: 'Accounts that post about things happening near you. Shown in the radar, not the digest.',
      placeholder: 'localevents.bsky.social',
      normalize: handleInput,
      invalidMessage: "That doesn't look like a Bluesky handle.",
    }),
    h('h2', { class: 'section-head' }, 'Setup'),
    relay ? relaySection(settings) : noRelayNote(),
    shortcutSection(),
    dataSection(),
    h('p', { class: 'colophon' }, 'Finity: no ads, no tracking, no infinite scroll. Does this help you live your life, or keep you inside the app?'),
  );

  if (location.hash.includes('section=shortcut')) document.getElementById('shortcut')?.scrollIntoView();
}
