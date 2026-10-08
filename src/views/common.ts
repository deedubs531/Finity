import type { SourceError } from '../types';
import { h } from '../util';

export function errorList(errors: SourceError[]): HTMLElement | null {
  if (!errors.length) return null;
  return h(
    'details',
    { class: 'notice quiet' },
    h('summary', {}, errors.length === 1 ? "1 source couldn't be loaded" : `${errors.length} sources couldn't be loaded`),
    h('ul', {}, errors.map((e) => h('li', {}, h('strong', {}, e.source), ': ', e.message))),
  );
}

export function emptyState(title: string, body: string, action?: { label: string; href: string }): HTMLElement {
  return h(
    'section',
    { class: 'empty' },
    h('h2', {}, title),
    h('p', {}, body),
    action && h('a', { class: 'button', href: action.href }, action.label),
  );
}

export function externalLink(url: string, label: string, cls = 'link'): HTMLAnchorElement {
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', class: cls }, label);
}

export function image(src: string, alt = ''): HTMLImageElement {
  return h('img', { src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
}

/** Opens a modal dialog. Returns the dialog so callers can close it. */
export function openDialog(title: string, ...content: (Node | null | false)[]): HTMLDialogElement {
  const dialog = h(
    'dialog',
    { class: 'sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'plain', type: 'button', onclick: () => dialog.close(), 'aria-label': 'Close' }, 'Close')),
    ...content.filter((c): c is Node => !!c),
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/** Replaces an element's content, skipping empty (null/false) parts. */
export function fill(root: HTMLElement, ...children: (Node | string | null | undefined | false)[]): void {
  root.replaceChildren(...children.filter((c): c is Node | string => c != null && c !== false));
}
