// ==UserScript==
// @name         Finity for Instagram
// @description  Instagram the calm way: your Following feed only, no Reels, Explore, suggestions, ads or like counts, a daily time budget, and Save to Finity.
// @version      1.0.0
// @match        https://www.instagram.com/*
// @run-at       document-start
// @noframes
// @downloadURL  https://deedubs531.github.io/Finity/finity-instagram.user.js
// @updateURL    https://deedubs531.github.io/Finity/finity-instagram.user.js
// ==/UserScript==

// This only changes how instagram.com looks in your own Safari. It never logs in,
// clicks, likes, follows or collects anything. Instagram's page markup changes from
// time to time; everything here matches on links and visible text rather than its
// internal class names, so most changes only switch off a single feature.

(function () {
  'use strict';

  const FINITY_URL = 'https://deedubs531.github.io/Finity/';
  const KEY = 'finity:';
  const DEFAULTS = { minutes: 20, maxPosts: 40, allowReels: false, hideLikes: true };
  const EXTRA_MINUTES = 5;

  // ---------- storage (instagram.com's localStorage, prefixed) ----------

  function load(name, fallback) {
    try {
      const raw = localStorage.getItem(KEY + name);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }

  function save(name, value) {
    try {
      localStorage.setItem(KEY + name, JSON.stringify(value));
    } catch {
      // Private browsing or storage full: features keep working for this visit.
    }
  }

  const settings = load('settings', DEFAULTS);

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function loadBudget() {
    const b = load('budget', { day: today(), usedMs: 0, extraTaken: false });
    return b.day === today() ? b : { day: today(), usedMs: 0, extraTaken: false };
  }

  function allowanceMs(b) {
    return (settings.minutes + (b.extraTaken ? EXTRA_MINUTES : 0)) * 60000;
  }

  // ---------- routing: Following feed only ----------

  const path = () => location.pathname;
  const isHome = () => path() === '/' || path() === '';
  const isBlockedPage = () => /^\/(reels|explore)(\/|$)/.test(path());

  function enforceRoute() {
    if (isHome() && !/variant=following/.test(location.search)) {
      location.replace('/?variant=following');
      return true;
    }
    return false;
  }

  if (enforceRoute()) return;

  // ---------- styles ----------

  const CSS = `
    :root {
      --ig-primary-background: 246, 239, 224 !important;
      --ig-secondary-background: 239, 229, 208 !important;
      --ig-elevated-background: 251, 247, 238 !important;
      --ig-primary-text: 43, 36, 32 !important;
      --ig-secondary-text: 95, 82, 73 !important;
      --ig-separator: 217, 203, 178 !important;
      --ig-elevated-separator: 217, 203, 178 !important;
      --ig-link: 140, 59, 42 !important;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --ig-primary-background: 31, 26, 22 !important;
        --ig-secondary-background: 41, 34, 28 !important;
        --ig-elevated-background: 38, 32, 25 !important;
        --ig-primary-text: 236, 227, 211 !important;
        --ig-secondary-text: 196, 183, 164 !important;
        --ig-separator: 64, 54, 44 !important;
        --ig-elevated-separator: 64, 54, 44 !important;
        --ig-link: 224, 154, 127 !important;
      }
    }
    html, body { background: rgb(var(--ig-primary-background)) !important; }
    a[href="/reels/"], a[href^="/explore"], a[href="/explore/"] { display: none !important; }
    .finity-hidden { display: none !important; }
    .finity-bar { display: flex; gap: 18px; padding: 8px 12px 12px; font: 600 14px -apple-system, system-ui, sans-serif; }
    .finity-bar button { all: unset; cursor: pointer; color: rgb(140, 59, 42); }
    .finity-bar button.done { color: rgb(138, 123, 110); }
    .finity-card { margin: 24px 16px 120px; padding: 28px 20px; text-align: center; border-radius: 12px;
      background: #fbf7ee; color: #2b2420; border: 1px solid #d9cbb2;
      font: 17px/1.5 'Iowan Old Style', Palatino, Georgia, serif; }
    .finity-card h2 { margin: 6px 0; font-size: 24px; }
    .finity-card p { color: #5f5249; margin: 8px 0; }
    .finity-card a, .finity-card button { display: inline-block; margin: 8px 6px 0; padding: 10px 16px; border-radius: 8px;
      font: 600 15px -apple-system, system-ui, sans-serif; text-decoration: none; cursor: pointer;
      border: 1px solid #8c3b2a; background: #8c3b2a; color: #fbf7ee; }
    .finity-card .secondary { background: transparent; color: #8c3b2a; }
    .finity-overlay { position: fixed; inset: 0; z-index: 2147483646; display: flex; align-items: center; justify-content: center;
      background: rgba(246, 239, 224, 0.97); }
    .finity-overlay .finity-card { margin: 16px; max-width: 420px; }
    .finity-fab { position: fixed; right: 12px; bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 2147483645;
      display: flex; gap: 8px; align-items: center; }
    .finity-fab button { all: unset; cursor: pointer; padding: 9px 14px; border-radius: 999px; background: #2b2420; color: #f6efe0;
      font: 600 14px -apple-system, system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
    .finity-toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(120px + env(safe-area-inset-bottom));
      z-index: 2147483647; padding: 10px 16px; border-radius: 8px; background: #2b2420; color: #f6efe0;
      font: 15px -apple-system, system-ui, sans-serif; max-width: calc(100vw - 32px); }
    .finity-form label { display: block; text-align: left; margin: 10px 0; font: 14px -apple-system, system-ui, sans-serif; color: #5f5249; }
    .finity-form input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 9px 10px; font-size: 16px;
      border: 1px solid #d9cbb2; border-radius: 8px; background: #fff; color: #2b2420; }
  `;

  function addStyles() {
    const style = document.createElement('style');
    style.id = 'finity-style';
    style.textContent = CSS;
    (document.head || document.documentElement).append(style);
  }

  // ---------- small UI helpers ----------

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }

  function toast(message) {
    const t = el('div', { class: 'finity-toast', role: 'status' }, message);
    document.body.append(t);
    setTimeout(() => t.remove(), 2800);
  }

  function overlay(...content) {
    const o = el('div', { class: 'finity-overlay', 'data-finity': 'overlay' }, el('div', { class: 'finity-card' }, ...content));
    document.body.append(o);
    return o;
  }

  // ---------- basket: posts waiting to be sent to Finity ----------

  function loadBasket() {
    return load('basket', { items: [] }).items;
  }

  function saveBasket(items) {
    save('basket', { items });
    renderFab();
  }

  function addToBasket(item) {
    const items = loadBasket().filter((i) => !(i.kind === item.kind && i.url === item.url));
    items.push(item);
    saveBasket(items);
  }

  let fab;
  function renderFab() {
    const items = loadBasket();
    if (!fab) {
      fab = el('div', { class: 'finity-fab', 'data-finity': 'fab' });
      document.body.append(fab);
    }
    fab.replaceChildren(
      ...(items.length
        ? [el('button', { type: 'button', onclick: sendBasket }, `Send ${items.length} to Finity`)]
        : []),
      el('button', { type: 'button', onclick: openSettings, 'aria-label': 'Finity settings' }, 'F'),
    );
  }

  async function sendBasket() {
    const items = loadBasket();
    if (!items.length) return;
    const payload = 'finity:v1:' + JSON.stringify({ items });
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      toast("Couldn't copy. Try again.");
      return;
    }
    saveBasket([]);
    overlay(
      el('h2', {}, 'Copied for Finity'),
      el('p', {}, `${items.length} ${items.length === 1 ? 'item is' : 'items are'} on your clipboard. Open Finity, go to Shelf and tap "Save copied item".`),
      el('a', { href: FINITY_URL + '#/shelf' }, 'Open Finity'),
      el('button', { type: 'button', class: 'secondary', onclick: (e) => e.target.closest('[data-finity=overlay]').remove() }, 'Keep reading'),
    );
  }

  // ---------- reading a post ----------

  function postInfo(article) {
    const link = [...article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].find((a) => a.querySelector('time')) ||
      article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    const url = link ? new URL(link.getAttribute('href'), location.origin).toString().split('?')[0] : location.href;
    const author = [...article.querySelectorAll('header a[href^="/"]')].map((a) => a.getAttribute('href').replace(/\//g, '')).find(Boolean) || '';
    const images = [...article.querySelectorAll('img')].filter((img) => (img.naturalWidth || img.width) >= 150 && !img.closest('header'));
    const img = images[0];
    const caption = (img && img.alt && !/^Photo (by|shared by)/i.test(img.alt) ? img.alt : '') || captionText(article, author);
    return { url, author, caption: caption.slice(0, 1000), image: img ? img.currentSrc || img.src : '' };
  }

  function captionText(article, author) {
    // The caption usually starts with the author's name as a link, followed by text.
    const spans = [...article.querySelectorAll('span, h1')].map((s) => s.textContent.trim()).filter((t) => t.length > 20);
    const longest = spans.sort((a, b) => b.length - a.length)[0] || '';
    return longest.startsWith(author) ? longest.slice(author.length).trim() : longest;
  }

  /** Small copy of the image, so it still shows after Instagram's link expires. */
  async function imageData(src) {
    if (!src) return '';
    try {
      const blob = await (await fetch(src, { mode: 'cors', credentials: 'omit' })).blob();
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return src;
    }
  }

  async function saveToShelf(article, button) {
    const info = postInfo(article);
    button.textContent = 'Saving…';
    addToBasket({ kind: 'shelf', url: info.url, text: info.caption, source: info.author ? `@${info.author} on Instagram` : 'Instagram', image: await imageData(info.image) });
    button.textContent = 'Saved for Finity';
    button.classList.add('done');
  }

  function addToRadar(article, button) {
    const info = postInfo(article);
    const firstLine = info.caption.split('\n')[0].slice(0, 120);
    const form = el(
      'form',
      { class: 'finity-form' },
      el('label', {}, 'What', el('input', { name: 'title', value: firstLine || (info.author ? `Event by @${info.author}` : 'Event'), required: true })),
      el('label', {}, 'Date', el('input', { name: 'date', type: 'date', required: true })),
      el('label', {}, 'Time (optional)', el('input', { name: 'time', type: 'time' })),
      el('label', {}, 'Where', el('input', { name: 'location' })),
      el('button', { type: 'submit' }, 'Add to Radar'),
      el('button', { type: 'button', class: 'secondary', onclick: () => o.remove() }, 'Cancel'),
    );
    const o = overlay(el('h2', {}, 'Add to your Radar'), form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      addToBasket({
        kind: 'event',
        url: info.url,
        title: String(data.get('title')).trim(),
        date: String(data.get('date')),
        time: String(data.get('time') || ''),
        location: String(data.get('location') || '').trim(),
        text: info.caption,
        source: info.author ? `@${info.author} on Instagram` : 'Instagram',
      });
      o.remove();
      button.textContent = 'Added for Finity';
      button.classList.add('done');
    });
  }

  // ---------- cleaning the feed ----------

  let shownPosts = 0;
  let endCard = null;

  const textOf = (node) => (node.innerText || node.textContent || '');

  /** Ads are marked by a small label element reading "Sponsored" (or similar) near the top. */
  function isSponsored(article) {
    if (article.querySelector('a[href*="/ads/"]')) return true;
    return [...article.querySelectorAll('span, a, div')].some(
      (n) => n.children.length === 0 && /^(Sponsored|Ad|Paid partnership( with .+)?)$/i.test(n.textContent.trim()),
    );
  }

  function isSuggested(article) {
    return /Suggested for you|Suggested posts|Because you (liked|follow)/i.test(textOf(article).slice(0, 400));
  }

  function isReel(article) {
    return !!article.querySelector('a[href*="/reel/"]');
  }

  function hideLikeCounts(root) {
    if (!settings.hideLikes) return;
    root.querySelectorAll('a[href$="/liked_by/"], a[href*="/liked_by"]').forEach((a) => a.classList.add('finity-hidden'));
    root.querySelectorAll('span, a, div').forEach((n) => {
      if (n.children.length > 3) return;
      const t = n.textContent.trim();
      if (/^[\d,.]+[KMB]?\s+(likes?|views?|plays?)$/i.test(t) || /^Liked by\b/.test(t)) n.classList.add('finity-hidden');
    });
  }

  function caughtUpCard(reason) {
    return el(
      'section',
      { class: 'finity-card', 'data-finity': 'end' },
      el('p', { 'aria-hidden': 'true' }, '❧'),
      el('h2', {}, "You're caught up"),
      el('p', {}, reason),
      el('a', { href: FINITY_URL }, 'Open Finity'),
    );
  }

  /** Places the end card after `node`, unless an earlier end point already exists. */
  function endFeedAfter(node, reason) {
    if (endCard && endCard.isConnected && node.compareDocumentPosition(endCard) & Node.DOCUMENT_POSITION_PRECEDING) return;
    endCard?.remove();
    endCard = caughtUpCard(reason);
    node.after(endCard);
    // Anything already shown below the new end point gets hidden too.
    document.querySelectorAll('article[data-finity=kept]').forEach((a) => {
      if (endCard.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) {
        a.classList.add('finity-hidden');
        a.dataset.finity = 'hidden';
      }
    });
  }

  function processArticle(article) {
    if (article.dataset.finity === 'hidden') return;
    if (endCard && endCard.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING) {
      article.classList.add('finity-hidden');
      article.dataset.finity = 'hidden';
      return;
    }
    if (!article.dataset.finity) {
      if (isSponsored(article) || isSuggested(article) || (!settings.allowReels && isReel(article))) {
        article.classList.add('finity-hidden');
        article.dataset.finity = 'hidden';
        return;
      }
      article.dataset.finity = 'kept';
      shownPosts++;
      if (onFollowingFeed() && shownPosts === settings.maxPosts) endFeedAfter(article, `That's ${settings.maxPosts} posts from people you follow. Plenty for now.`);
    }
    hideLikeCounts(article);
    if (!article.querySelector('.finity-bar')) {
      const save = el('button', { type: 'button', onclick: () => saveToShelf(article, save) }, 'Save to Finity');
      const radar = el('button', { type: 'button', onclick: () => addToRadar(article, radar) }, 'Add to Radar');
      article.append(el('div', { class: 'finity-bar', 'data-finity': 'bar' }, save, radar));
    }
  }

  function onFollowingFeed() {
    return isHome() && /variant=following/.test(location.search);
  }

  function processFeed() {
    // Instagram's own end-of-feed marker: everything after it is suggested content.
    if (onFollowingFeed() && !document.querySelector('[data-finity=igend]')) {
      const marker = [...document.querySelectorAll('span, h3')].find((n) => n.children.length === 0 && /^You'?re all caught up$/i.test(n.textContent.trim()));
      if (marker) {
        marker.dataset.finity = 'igend';
        endFeedAfter(marker.closest('div') || marker, "You've seen everything new from people you follow.");
      }
    }
    document.querySelectorAll('article').forEach(processArticle);
    // Suggestion blocks outside posts ("Suggested for you" carousels).
    document.querySelectorAll('span, h4').forEach((n) => {
      if (n.children.length === 0 && /^Suggested for you$/i.test(n.textContent.trim())) {
        const block = n.closest('div[role="presentation"]') || n.parentElement?.parentElement?.parentElement;
        if (block && !block.contains(document.querySelector('[data-finity=end]'))) block.classList.add('finity-hidden');
      }
    });
  }

  function blockPage() {
    if (document.querySelector('[data-finity=blocked]')) return;
    const o = overlay(
      el('h2', {}, 'Reels and Explore are off'),
      el('p', {}, 'Finity keeps Instagram to the people you follow.'),
      el('a', { href: '/?variant=following' }, 'Back to Following'),
      el('a', { href: FINITY_URL, class: 'secondary' }, 'Open Finity'),
    );
    o.dataset.finity = 'blocked';
  }

  // ---------- time budget ----------

  let budget = loadBudget();
  let last = Date.now();

  function showTimesUp() {
    if (document.querySelector('[data-finity=timesup]')) return;
    const content = [
      el('p', { 'aria-hidden': 'true' }, '❧'),
      el('h2', {}, "Time's up for today"),
      el('p', {}, `You've had your ${settings.minutes} ${settings.minutes === 1 ? 'minute' : 'minutes'} of Instagram. It'll be here tomorrow.`),
    ];
    if (!budget.extraTaken) {
      content.push(
        el('button', {
          type: 'button',
          class: 'secondary',
          onclick: () => {
            budget.extraTaken = true;
            save('budget', budget);
            document.querySelector('[data-finity=timesup]')?.remove();
          },
        }, `${EXTRA_MINUTES} more minutes (once a day)`),
      );
    }
    content.push(el('a', { href: FINITY_URL }, 'Open Finity'));
    const o = overlay(...content);
    o.dataset.finity = 'timesup';
  }

  function tick() {
    const now = Date.now();
    const delta = Math.min(now - last, 2000);
    last = now;
    if (document.visibilityState !== 'visible') return;
    if (budget.day !== today()) budget = loadBudget();
    // Messages and posting don't count against reading time.
    if (/^\/(direct|accounts|create)/.test(path())) return;
    budget.usedMs += delta;
    if (budget.usedMs % 5000 < delta) save('budget', budget);
    if (budget.usedMs >= allowanceMs(budget)) {
      save('budget', budget);
      showTimesUp();
    }
  }

  // ---------- settings panel ----------

  function openSettings() {
    const remaining = Math.max(0, Math.ceil((allowanceMs(budget) - budget.usedMs) / 60000));
    const form = el(
      'form',
      { class: 'finity-form' },
      el('label', {}, 'Daily Instagram minutes', el('input', { name: 'minutes', type: 'number', min: 1, max: 240, value: settings.minutes })),
      el('label', {}, 'Posts per visit', el('input', { name: 'maxPosts', type: 'number', min: 5, max: 200, value: settings.maxPosts })),
      el('label', {}, el('input', { name: 'allowReels', type: 'checkbox', checked: settings.allowReels, style: 'display:inline;width:auto;margin-right:8px' }), 'Show Reels from people I follow'),
      el('label', {}, el('input', { name: 'hideLikes', type: 'checkbox', checked: settings.hideLikes, style: 'display:inline;width:auto;margin-right:8px' }), 'Hide like counts'),
      el('button', { type: 'submit' }, 'Save'),
      el('button', { type: 'button', class: 'secondary', onclick: () => o.remove() }, 'Close'),
    );
    const o = overlay(el('h2', {}, 'Finity for Instagram'), el('p', {}, `${remaining} minutes left today.`), form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const minutes = Math.max(1, Math.min(240, Number(data.get('minutes')) || DEFAULTS.minutes));
      // Like Finity: lowering applies now; raising waits until tomorrow.
      if (minutes <= settings.minutes) settings.minutes = minutes;
      else save('pendingMinutes', { minutes, day: today() });
      settings.maxPosts = Math.max(5, Math.min(200, Number(data.get('maxPosts')) || DEFAULTS.maxPosts));
      settings.allowReels = data.get('allowReels') === 'on';
      settings.hideLikes = data.get('hideLikes') === 'on';
      save('settings', settings);
      o.remove();
      toast(minutes > settings.minutes ? 'Saved. The higher limit starts tomorrow.' : 'Saved');
    });
  }

  function applyPendingMinutes() {
    const pending = load('pendingMinutes', { minutes: 0, day: '' });
    if (pending.minutes && pending.day !== today()) {
      settings.minutes = pending.minutes;
      save('settings', settings);
      save('pendingMinutes', { minutes: 0, day: '' });
    }
  }

  // ---------- start ----------

  let lastHref = location.href;
  let scheduled = false;

  function run() {
    scheduled = false;
    if (location.href !== lastHref) {
      lastHref = location.href;
      shownPosts = 0;
      endCard?.remove();
      endCard = null;
      document.querySelectorAll('[data-finity=blocked]').forEach((n) => n.remove());
      if (enforceRoute()) return;
    }
    if (isBlockedPage()) blockPage();
    processFeed();
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(run);
    }
  }

  function start() {
    addStyles();
    applyPendingMinutes();
    renderFab();
    run();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    // Instagram changes pages without reloading; check the address regularly.
    setInterval(() => location.href !== lastHref && schedule(), 400);
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => {
      last = Date.now();
      if (document.visibilityState === 'hidden') save('budget', budget);
    });
    if (budget.usedMs >= allowanceMs(budget)) showTimesUp();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
