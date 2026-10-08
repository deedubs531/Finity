# Finity

A calm, finite alternative to endless feeds, built on the [manifesto](MANIFESTO.md).
Full details are in the [v1 spec](SPEC.md).

- **Digest:** posts from Bluesky accounts and RSS feeds you choose. Chronological, no counts,
  no autoplay, ends with "You're caught up". A daily reading-time budget you set.
- **Shelf:** a grid of things that inspired you, saved from the digest or shared from other apps.
- **Radar:** what's happening near you in the next 7 days, from venue/library/city calendars,
  local Bluesky accounts and events you add yourself. **Find a venue** (in Settings) looks up a
  venue's calendar, feed or Bluesky account from its website and name, handy for places you
  follow on Instagram.

- **Import from Instagram:** read the following list from your own Instagram data download,
  find which of those accounts are on Bluesky, and add the active ones automatically (venues and
  events to the radar, people to the digest; shops and quiet accounts left out). Undo anytime.

Everything you save stays on your phone. No accounts, ads or tracking.

## Put it on your iPhone

Finity runs as one free **Cloudflare Worker**. It serves the app and a small relay that fetches
RSS and calendar feeds. You do this setup once.

### 1. Deploy to Cloudflare (no command line needed)

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Import a repository**, connect GitHub and pick `deedubs531/Punk`.
3. Use these build settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Branch:** `main`
4. Deploy. Cloudflare gives you an address like `https://finity.<your-name>.workers.dev`.

### 2. Set your relay token

The token is a password that stops strangers from using your relay.

1. In Cloudflare, open the **finity** Worker → **Settings → Variables and Secrets → Add**.
2. Type: **Secret**, name: `FINITY_TOKEN`, value: a long random phrase you make up. Save, then redeploy.

### 3. Add it to your home screen

1. Open your Finity address in **Safari** on your iPhone.
2. Tap **Share → Add to Home Screen**.
3. Open Finity from the home screen, go to **Settings**, enter your relay token and tap **Save & test**.
4. Add Bluesky accounts, RSS feeds, calendars and your city.

To share from other apps into the shelf, follow **Settings → Share from other apps** to make a
one-time iOS Shortcut.

> Tip: always open Finity from the home-screen icon. iPhone keeps its data separate from Safari's.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (local relay token: "dev")
npm test           # unit tests
npm run build      # type check + production build into dist/
```

Code map:

| Path | What it does |
|---|---|
| `src/views/` | The four screens: digest, shelf, radar, settings |
| `src/sources/` | Bluesky, RSS/Atom and iCal readers |
| `src/budget.ts`, `src/reading-clock.ts` | Daily reading budget and the timer |
| `src/db.ts` | On-device storage (IndexedDB), export/import/wipe |
| `relay/` | The Cloudflare Worker: serves the app and the feed relay |
| `public/` | Icons, web-app manifest, offline service worker |
