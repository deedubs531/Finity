import * as db from '../db';
import { eventToIcs, interestedIds, loadRadar, toggleInterested } from '../radar';
import { hasRelay } from '../relay-status';
import { loadSettings } from '../settings';
import type { DigestItem, EventItem } from '../types';
import { dayKey, h, newId, relativeTime, safeUrl, toast } from '../util';
import { emptyState, errorList, externalLink, fill, image, openDialog } from './common';

function timeLabel(e: EventItem): string {
  if (e.start === undefined) return '';
  if (e.allDay) return 'All day';
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const start = new Date(e.start).toLocaleTimeString(undefined, opts);
  return e.end ? `${start}–${new Date(e.end).toLocaleTimeString(undefined, opts)}` : start;
}

function dayLabel(ms: number): string {
  const key = dayKey(new Date(ms));
  if (key === dayKey()) return 'Today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === dayKey(tomorrow)) return 'Tomorrow';
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function downloadIcs(event: EventItem): void {
  const blob = new Blob([eventToIcs(event)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${event.title.replace(/[^\w -]+/g, '').slice(0, 40) || 'event'}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function share(event: EventItem): Promise<void> {
  const when = event.start ? `${dayLabel(event.start)} ${timeLabel(event)}`.trim() : '';
  const text = [event.title, when, event.location].filter(Boolean).join(' · ');
  if (navigator.share) {
    try {
      await navigator.share({ title: event.title, text, url: event.url });
    } catch {
      // Closing the share sheet isn't an error.
    }
  } else {
    await navigator.clipboard.writeText([text, event.url].filter(Boolean).join('\n'));
    toast('Copied event details');
  }
}

function eventCard(e: EventItem, interested: boolean, redraw: () => void, reload: () => void): HTMLElement {
  const star = h(
    'button',
    {
      class: interested ? 'plain star on' : 'plain star',
      type: 'button',
      'aria-pressed': String(interested),
      onclick: async () => {
        await toggleInterested(e.id);
        redraw();
      },
    },
    interested ? '★ Interested' : '☆ Interested',
  );
  return h(
    'article',
    { class: 'event' },
    h('p', { class: 'byline' }, [interested && e.start !== undefined ? dayLabel(e.start) : '', timeLabel(e), e.location].filter(Boolean).join(' · ')),
    h('h3', { class: 'headline' }, e.title),
    e.description && h('p', { class: 'body clamp' }, e.description),
    h('p', { class: 'source' }, e.manual ? 'Added by you' : `From ${e.sourceName}`),
    h(
      'div',
      { class: 'actions' },
      star,
      e.start !== undefined && h('button', { class: 'plain', type: 'button', onclick: () => downloadIcs(e) }, 'Add to calendar'),
      h('button', { class: 'plain', type: 'button', onclick: () => void share(e) }, 'Share'),
      e.url && externalLink(e.url, 'Details'),
      e.manual &&
        h(
          'button',
          {
            class: 'plain danger',
            type: 'button',
            onclick: async () => {
              if (!confirm('Delete this event?')) return;
              await db.del('events', e.id);
              reload();
            },
          },
          'Delete',
        ),
    ),
  );
}

function localCard(item: EventItem | DigestItem): HTMLElement {
  if ('source' in item) {
    return h(
      'article',
      { class: 'story compact' },
      h('p', { class: 'byline' }, item.sourceName, ` · ${relativeTime(item.published)}`),
      h('p', { class: 'body' }, item.text),
      item.image && h('figure', {}, image(item.image, item.imageAlt)),
      item.url && h('div', { class: 'actions' }, externalLink(item.url, 'Open post')),
    );
  }
  return h(
    'article',
    { class: 'story compact' },
    h('p', { class: 'byline' }, item.sourceName),
    h('h3', { class: 'headline' }, item.title),
    item.description && h('p', { class: 'body clamp' }, item.description),
    item.url && h('div', { class: 'actions' }, externalLink(item.url, 'Details')),
  );
}

function addEventDialog(redraw: () => void): void {
  const today = dayKey();
  const form = h(
    'form',
    { class: 'form' },
    h('label', { class: 'field' }, h('span', {}, 'What'), h('input', { name: 'title', required: true, maxlength: 140 })),
    h('label', { class: 'field' }, h('span', {}, 'Date'), h('input', { name: 'date', type: 'date', required: true, value: today, min: today })),
    h('label', { class: 'field' }, h('span', {}, 'Time (optional)'), h('input', { name: 'time', type: 'time' })),
    h('label', { class: 'field' }, h('span', {}, 'Where'), h('input', { name: 'location', maxlength: 140 })),
    h('label', { class: 'field' }, h('span', {}, 'Link'), h('input', { name: 'url', type: 'url', inputmode: 'url', placeholder: 'https://' })),
    h('label', { class: 'field' }, h('span', {}, 'Note'), h('textarea', { name: 'description', rows: 2 })),
    h('button', { class: 'button', type: 'submit' }, 'Add event'),
  );
  const dialog = openDialog('Add an event', form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = new FormData(form);
    const date = String(data.get('date'));
    const time = String(data.get('time') || '');
    const start = new Date(`${date}T${time || '00:00'}`).getTime();
    const event: EventItem = {
      id: `manual:${newId()}`,
      title: String(data.get('title')).trim(),
      start,
      allDay: !time,
      location: String(data.get('location') || '').trim() || undefined,
      url: safeUrl(String(data.get('url') || '')),
      description: String(data.get('description') || '').trim() || undefined,
      sourceName: 'You',
      manual: true,
    };
    await db.put('events', event);
    dialog.close();
    redraw();
  });
}

export async function renderRadar(root: HTMLElement): Promise<void> {
  const settings = await loadSettings();
  const relay = await hasRelay();
  const hasSources = (relay ? settings.calendars.length : 0) + settings.eventHandles.length > 0;
  const addButton = h('button', { class: 'button secondary', type: 'button', onclick: () => addEventDialog(reload) }, 'Add event');
  fill(root, h('div', { class: 'toolbar' }, h('span', { class: 'remaining' }, 'Looking ahead…'), addButton));

  let data = await loadRadar(settings);

  async function reload(): Promise<void> {
    data = await loadRadar(settings);
    await draw();
  }

  async function draw(): Promise<void> {
    const interested = await interestedIds();
    const picks = data.events.filter((e) => interested.has(e.id));

    const byDay = new Map<string, EventItem[]>();
    for (const e of data.events) {
      const key = dayKey(new Date(e.start!));
      byDay.set(key, [...(byDay.get(key) ?? []), e]);
    }

    const where = settings.city ? `Near ${settings.city}` : 'The next 7 days';
    fill(root, 
      h('div', { class: 'toolbar' }, h('span', { class: 'remaining' }, where), addButton),
      errorList(data.errors),
      !hasSources && !data.events.length
        ? emptyState('Nothing on the radar yet', relay
            ? 'Add calendars from local venues, libraries or your city, or Bluesky accounts that post about local events. You can also add events yourself.'
            : 'Add Bluesky accounts that post about local events, or add events yourself.', {
            label: 'Add sources',
            href: '#/settings',
          })
        : null,
      picks.length ? h('section', { class: 'day picks' }, h('h2', { class: 'day-head' }, 'Your picks'), picks.map((e) => eventCard(e, true, draw, reload))) : null,
      ...[...byDay.values()]
        .map((events) => events.filter((e) => !interested.has(e.id)))
        .filter((events) => events.length)
        .map((events) =>
          h('section', { class: 'day' }, h('h2', { class: 'day-head' }, dayLabel(events[0].start!)), events.map((e) => eventCard(e, false, draw, reload))),
        ),
      hasSources && !data.events.length ? h('p', { class: 'notice quiet' }, 'No dated events in the next 7 days from your calendars.') : null,
      data.local.length ? h('section', { class: 'day local' }, h('h2', { class: 'day-head' }, 'From local sources'), data.local.map(localCard)) : null,
    );
  }
  await draw();
}
