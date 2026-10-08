import { applyImport, lastImport, moveImported, removeImported, undoImport, type ImportRecord } from '../importers/apply';
import { readInstagramExport } from '../importers/instagram';
import { analyze, select, venueLike, type Pick, type Progress } from '../importers/match';
import { h, toast } from '../util';
import { externalLink, fill } from './common';

function howToGetFile(open: boolean): HTMLElement {
  return h(
    'details',
    { class: 'setting how-to', open },
    h('summary', {}, 'Step 1: Get your following list from Instagram'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, 'In the Instagram app, go to your profile and tap the ☰ menu, then Accounts Center.'),
      h('li', {}, 'Tap Your information and permissions → Download your information.'),
      h('li', {}, 'Tap Download or transfer information, pick your Instagram account, then Some of your information.'),
      h('li', {}, 'Tick only Followers and following, then Next → Download to device.'),
      h('li', {}, 'Set Date range to All time and Format to JSON, then tap Create files.'),
      h('li', {}, 'Instagram tells you when it is ready, usually within minutes (sometimes a few hours). Go back to the same screen and tap Download. It saves to your Files app.'),
    ),
    h('p', { class: 'hint' }, 'Instagram sometimes renames these menus. If a step looks different, look for "Download your information".'),
  );
}

function progressText(p: Progress): string {
  return p.stage === 'searching'
    ? `Looking for your accounts on Bluesky: ${p.done} of ${p.total}…`
    : `Checking which ones are active: ${p.done} of ${p.total}…`;
}

function pickRow(p: Pick, redraw: () => void): HTMLElement {
  const other = p.destination === 'digest' ? 'radar' : 'digest';
  return h(
    'li',
    { class: 'result' },
    h('span', { class: 'result-text' }, h('strong', {}, p.displayName), h('span', { class: 'quiet' }, ` @${p.handle}`), p.igUsername !== p.handle.split('.')[0] && h('span', { class: 'result-desc' }, `Instagram: @${p.igUsername}`)),
    h(
      'span',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'plain',
          type: 'button',
          onclick: async () => {
            await moveImported(p.handle, other);
            redraw();
          },
        },
        `Move to ${other === 'radar' ? 'Radar' : 'Digest'}`,
      ),
      h(
        'button',
        {
          class: 'plain danger',
          type: 'button',
          onclick: async () => {
            await removeImported(p.handle);
            redraw();
          },
        },
        'Remove',
      ),
      externalLink(`https://bsky.app/profile/${p.handle}`, 'View'),
    ),
  );
}

function summary(record: ImportRecord, redraw: () => void, again: () => void): HTMLElement[] {
  const digest = record.picks.filter((p) => p.destination === 'digest');
  const radar = record.picks.filter((p) => p.destination === 'radar');
  const onBluesky = record.picks.length + record.skipped.length;
  return [
    h(
      'section',
      { class: 'import-summary' },
      h('h2', {}, 'Your follows are in'),
      h(
        'p',
        {},
        `You follow ${record.following} accounts on Instagram. ${onBluesky} of them are also on Bluesky. Finity added the ${record.picks.length} most worthwhile: `,
        h('strong', {}, `${digest.length} to your Digest`),
        ' and ',
        h('strong', {}, `${radar.length} to your Radar`),
        '.',
      ),
      record.failed > 0 && h('p', { class: 'hint' }, `${record.failed} lookups didn't get an answer from Bluesky. Import again later to try those.`),
      h('div', { class: 'actions' }, h('a', { class: 'button', href: '#/digest' }, 'Open my digest'), h('a', { class: 'button secondary', href: '#/radar' }, 'Open my radar')),
    ),
    digest.length ? h('div', { class: 'setting' }, h('h3', {}, 'Added to your Digest'), h('ul', { class: 'list' }, digest.map((p) => pickRow(p, redraw)))) : null,
    radar.length
      ? h('div', { class: 'setting' }, h('h3', {}, 'Added to your Radar'), h('p', { class: 'hint' }, 'Venues, events and local spots.'), h('ul', { class: 'list' }, radar.map((p) => pickRow(p, redraw))))
      : null,
    record.skipped.length
      ? h(
          'details',
          { class: 'setting' },
          h('summary', {}, `Left out (${record.skipped.length})`),
          h('ul', { class: 'list' }, record.skipped.map((s) => h('li', {}, h('span', { class: 'list-item' }, `${s.displayName} (@${s.handle})`), h('span', { class: 'quiet' }, s.reason)))),
        )
      : null,
    record.venueLike.length
      ? h(
          'details',
          { class: 'setting' },
          h('summary', {}, `Venues that are only on Instagram (${record.venueLike.length})`),
          h('p', { class: 'hint' }, "These aren't on Bluesky, and Instagram doesn't let other apps read posts. Check their bio for a website or newsletter, or add their events yourself in Radar."),
          h('ul', { class: 'list' }, record.venueLike.map((u) => h('li', {}, h('span', { class: 'list-item' }, `@${u}`), externalLink(`https://www.instagram.com/${u}/`, 'Open')))),
        )
      : null,
    h(
      'div',
      { class: 'setting' },
      h('h3', {}, 'Change your mind?'),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'button secondary', type: 'button', onclick: again }, 'Import a newer file'),
        h(
          'button',
          {
            class: 'button danger',
            type: 'button',
            onclick: async () => {
              if (!confirm('Remove every account this import added?')) return;
              await undoImport();
              toast('Import undone');
              again();
            },
          },
          'Undo import',
        ),
      ),
    ),
  ].filter((x): x is HTMLElement => !!x);
}

export async function renderImport(root: HTMLElement): Promise<() => void> {
  let busy = false;
  const leaveWarning = (e: BeforeUnloadEvent) => {
    if (busy) e.preventDefault();
  };
  window.addEventListener('beforeunload', leaveWarning);

  function chooser(): void {
    const input = h('input', { type: 'file', accept: '.zip,.json,.html,application/zip,application/json,text/html', hidden: true }) as HTMLInputElement;
    const status = h('p', { class: 'hint', 'aria-live': 'polite' });
    const choose = h('button', { class: 'button', type: 'button', onclick: () => input.click() }, 'Choose the file');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      busy = true;
      choose.disabled = true;
      try {
        status.textContent = 'Reading your following list…';
        const usernames = await readInstagramExport(file);
        if (!usernames.length) throw new Error('That following list is empty.');
        status.textContent = `Found ${usernames.length} accounts. Keep Finity open while it looks them up.`;
        const result = await analyze(usernames, (p) => (status.textContent = `${progressText(p)} Keep Finity open.`));
        const { picks, skipped } = select(result.profiles);
        const record = await applyImport({
          at: Date.now(),
          following: result.following,
          picks,
          skipped,
          venueLike: venueLike(result.notFound),
          notFound: result.notFound.length,
          failed: result.failed,
        });
        busy = false;
        fill(root, ...summary(record, () => void draw(), chooser));
      } catch (err) {
        busy = false;
        choose.disabled = false;
        status.textContent = err instanceof Error ? err.message : 'Something went wrong reading that file.';
      }
    });

    fill(
      root,
      h(
        'section',
        { class: 'import-intro' },
        h('h2', {}, 'Bring your Instagram follows'),
        h(
          'p',
          {},
          'Finity reads the list of accounts you follow from your own Instagram download, finds the ones that are also on Bluesky, and adds the active ones for you. Shops, brands and quiet accounts are left out. Venues and events go to your Radar.',
        ),
        h('p', { class: 'hint' }, "The file stays on your phone. Finity only asks Bluesky's public directory about each username. Instagram itself is never contacted."),
      ),
      howToGetFile(true),
      h('div', { class: 'setting' }, h('h3', {}, 'Step 2: Choose the file here'), h('p', { class: 'hint' }, 'Pick the .zip file Instagram gave you (from Files → Downloads).'), choose, status, input),
      h('p', { class: 'hint' }, 'Why Bluesky? Instagram doesn\'t let other apps show its posts. Bluesky is open, and many artists, venues and friends post there too. ', externalLink('https://bsky.app', 'What is Bluesky?')),
    );
  }

  async function draw(): Promise<void> {
    const record = await lastImport();
    if (record) fill(root, ...summary(record, () => void draw(), chooser));
    else chooser();
  }

  await draw();
  return () => window.removeEventListener('beforeunload', leaveWarning);
}
