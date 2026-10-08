import { fromClipboard, removeShelfItem, saveShelfItem, shelfItems } from '../shelf';
import type { ShelfItem } from '../types';
import { h, hostOf, toast, truncate } from '../util';
import { emptyState, externalLink, fill, image, openDialog } from './common';

function card(item: ShelfItem, onOpen: () => void): HTMLElement {
  const label = item.title || truncate(item.text, 140) || hostOf(item.url) || 'Saved item';
  return h(
    'button',
    { class: item.image ? 'tile has-image' : 'tile', type: 'button', onclick: onOpen, 'aria-label': label },
    item.image && image(item.image, item.imageAlt),
    h(
      'span',
      { class: 'tile-text' },
      item.title && h('strong', {}, item.title),
      !item.title && item.text && h('span', {}, truncate(item.text, item.image ? 80 : 220)),
      !item.title && !item.text && h('span', {}, hostOf(item.url)),
    ),
    h('span', { class: 'tile-source' }, item.sourceName || hostOf(item.url)),
  );
}

function openItem(item: ShelfItem, redraw: () => void): void {
  const note = h('textarea', { rows: 3, placeholder: 'Why did this inspire you?', 'aria-label': 'Note' }) as HTMLTextAreaElement;
  note.value = item.note;
  const dialog = openDialog(
    item.title || item.sourceName || 'Saved',
    item.image ? h('figure', {}, image(item.image, item.imageAlt)) : null,
    item.text ? h('p', { class: 'body' }, item.text) : null,
    h('label', { class: 'field' }, h('span', {}, 'Note'), note),
    h(
      'div',
      { class: 'actions' },
      item.url ? externalLink(item.url, 'Open original') : null,
      h(
        'button',
        {
          class: 'plain danger',
          type: 'button',
          onclick: async () => {
            if (!confirm('Remove this from your shelf?')) return;
            await removeShelfItem(item.id);
            dialog.close();
            redraw();
          },
        },
        'Remove',
      ),
    ),
  );
  dialog.addEventListener('close', async () => {
    if (note.value !== item.note) {
      await saveShelfItem({ ...item, note: note.value });
      redraw();
    }
  });
}

async function saveFromClipboard(redraw: () => void): Promise<void> {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    toast("Finity couldn't read the clipboard. Allow it when iOS asks.");
    return;
  }
  const item = fromClipboard(text);
  if (!item) {
    toast('The clipboard is empty.');
    return;
  }
  await saveShelfItem(item);
  toast('Saved to your shelf');
  redraw();
}

export async function renderShelf(root: HTMLElement): Promise<void> {
  const draw = async () => {
    const items = await shelfItems();
    fill(root, 
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'button', type: 'button', onclick: () => void saveFromClipboard(draw) }, 'Save copied item'),
        h('a', { class: 'plain', href: '#/settings?section=shortcut' }, 'Share from other apps'),
      ),
      items.length
        ? h('div', { class: 'grid' }, items.map((item) => card(item, () => openItem(item, draw))))
        : emptyState('Your shelf is empty', 'Tap Save on anything in your digest that inspires you, or copy a link from another app and tap "Save copied item".'),
    );
  };
  await draw();
}
