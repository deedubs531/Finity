import './styles.css';
import { h } from './util';
import { renderDigest } from './views/digest';
import { renderShelf } from './views/shelf';
import { renderRadar } from './views/radar';
import { renderSettings } from './views/settings';
import { renderImport } from './views/import';

type Cleanup = () => void;
type View = (root: HTMLElement) => Promise<Cleanup | void>;

const VIEWS: Record<string, { title: string; render: View }> = {
  digest: { title: 'Digest', render: renderDigest },
  shelf: { title: 'Shelf', render: renderShelf },
  radar: { title: 'Radar', render: renderRadar },
  settings: { title: 'Settings', render: renderSettings },
  import: { title: 'Import', render: renderImport },
};

const TABS = ['digest', 'shelf', 'radar'] as const;

let cleanup: Cleanup | void;

function currentRoute(): string {
  const name = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return name in VIEWS ? name : 'digest';
}

function masthead(): HTMLElement {
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return h(
    'header',
    { class: 'masthead' },
    h('a', { class: 'masthead-settings', href: '#/settings', 'aria-label': 'Settings' }, 'Settings'),
    h('h1', { class: 'masthead-title' }, h('a', { href: '#/digest' }, 'Finity')),
    h('p', { class: 'masthead-date' }, date),
  );
}

function tabBar(active: string): HTMLElement {
  return h(
    'nav',
    { class: 'tabs', 'aria-label': 'Sections' },
    TABS.map((t) =>
      h('a', { href: `#/${t}`, class: t === active ? 'tab active' : 'tab', 'aria-current': t === active ? 'page' : null }, VIEWS[t].title),
    ),
  );
}

async function route(): Promise<void> {
  cleanup?.();
  cleanup = undefined;
  const name = currentRoute();
  const app = document.getElementById('app')!;
  const main = h('main', { class: `view view-${name}` });
  app.replaceChildren(masthead(), main, tabBar(name));
  document.title = name === 'digest' ? 'Finity' : `${VIEWS[name].title} · Finity`;
  window.scrollTo(0, 0);
  try {
    cleanup = await VIEWS[name].render(main);
  } catch (err) {
    main.replaceChildren(h('p', { class: 'notice error' }, `Something went wrong: ${err instanceof Error ? err.message : String(err)}`));
  }
}

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
