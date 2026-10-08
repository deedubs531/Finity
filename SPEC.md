# Finity v1 Specification

Finity v1 has three features: a **finite digest**, an **inspiration shelf** and a
**weekend radar**.

## Platform

- **Progressive web app (PWA)** used on an **iPhone**, added to the home screen from Safari.
- Also works in any desktop browser.
- No App Store, no accounts, no sign-up.

## Storage and privacy

- **Local-only.** All settings, saved items, events and usage time live on the device (IndexedDB).
- **Export / import** of all data as a single JSON file, for backups or moving to a new phone.
- **Wipe all data** button.
- No analytics, no ads, no third-party scripts, no cookies.

## Architecture

```
iPhone (Finity PWA) ──► Bluesky public API (direct, no login)
        │
        └────────────► Finity relay (Cloudflare Worker) ──► RSS / Atom / iCal feeds
```

- **Hosting:** one free Cloudflare Worker, owned by the user, serves both the app
  (static HTML/CSS/TypeScript) and the relay at `/relay`. (GitHub Pages isn't free for private repos.)
- **Relay:** exists only because most sites block browsers from reading their feeds directly (CORS).
  - Fetches a feed URL and returns it. **Stores nothing, logs nothing.**
  - Only `GET`; only RSS, Atom, XML and iCal responses; size limit (e.g. 2 MB); timeout.
  - Requires a secret token configured in the app, so strangers can't use it as an open proxy.
  - Identifies itself honestly with a `User-Agent` that names Finity.

## Feature 1: Finite digest

### Sources
- **Bluesky:** the user types in handles to follow inside Finity. **No login.** Uses the
  public, unauthenticated Bluesky API (`public.api.bsky.app`). Original posts and reposts
  shown; replies hidden by default.
- **RSS / Atom:** blogs, news sites, newsletters (Substack etc.), fetched through the relay.

### Feed behaviour
- **On demand:** content is fetched only when the user opens the digest or taps refresh.
- **Chronological**, newest first. No algorithmic ranking.
- **Shows only items not yet seen.** When everything has been seen, the feed ends with
  **"You're caught up."** No infinite scroll, and no older content loads underneath.
- **No numbers:** like, repost, reply and follower counts are never shown.
- **No autoplay.** Images load at a modest size; videos and links open only when tapped
  (links open the original source).
- Each item shows: source name, time, text/summary, optional image, **Save to shelf**
  button, and a link to the original.

### Daily reading budget
- A **daily minutes budget** for the digest, **set by the user** in settings (default **20**).
- Time counts **only while the digest is on screen and the app is in the foreground**.
- A small, calm indicator shows minutes remaining, as text rather than a countdown animation.
- **Soft stop:** when the budget runs out, a "Time's up for today" screen replaces the
  digest. Once per day, the user may tap **"5 more minutes."** After that, the digest stays
  closed until midnight local time.
- The shelf and radar are **not** affected by the budget.
- **Lowering** the budget applies right away; **raising** it takes effect **tomorrow**,
  so the limit can't be raised in the moment.

## Feature 2: Inspiration shelf

### Adding items
- **Save from the digest:** tap **Save** on any digest item. Stores text, link, source,
  date and image URL.
- **Share from other iPhone apps** via an iOS Shortcut ("Save to Finity"):
  - Safari blocks web apps from appearing in the iPhone share sheet, and a home-screen
    PWA keeps separate storage from Safari, so the Shortcut cannot write into Finity directly.
  - **v1 approach:** the Shortcut copies the shared link or text to the clipboard and opens
    Finity. The shelf has a prominent **"Save copied item"** button that reads the clipboard
    (iOS asks permission) and saves it.
  - Setup instructions for the Shortcut are included in the app.

### Viewing
- A **grid** of everything saved, newest first.
- Tap an item to see it full size, open the original, add a note, or delete it.
- No counts, no "memories" notifications, no streaks.

## Feature 3: Weekend radar

### Location
- The user types a **city and radius** (e.g. "Portland, OR, 25 miles") in settings.
- **No GPS**, no location tracking. Radius filtering applies where events include coordinates
  or a city; otherwise events from the user's chosen sources are shown as-is.

### Sources
- **Venue, library and city calendars:** the user adds **iCal (.ics)** or **RSS** links
  (fetched through the relay).
- **Bluesky event accounts:** the user picks local event accounts. Their posts appear in
  the radar instead of the digest. Dates are not reliably machine-readable here, so these
  appear in a separate "From local accounts" section.
- **Manual add:** title, date/time, place, link, note.

### Find a venue
For venues and organizers you know from Instagram (which can't be read within its terms):
- Enter a venue's **website** and/or **name**.
- The relay reads that page (and at most two of the site's own events pages) and returns only
  **verified** calendar and feed addresses it links to: iCal/webcal links, RSS/Atom
  autodiscovery, Google Calendar embeds, and the standard addresses of common event plugins
  (WordPress The Events Calendar, Squarespace). The page itself is never passed to the app.
- The name is searched in Bluesky's public account directory.
- Each result has one-tap **Add to radar** (and **Add to digest** for feeds).
- A tip explains turning a venue's email newsletter into a feed with Kill the Newsletter.

### Behaviour
- Available **anytime**; shows events in the **next 7 days**, grouped by day.
- Each event shows: title, date/time, place, source, link.
- **"Interested"** toggle per event; interested events appear first.
- **Add to calendar:** download an `.ics` file for that event (opens in iPhone Calendar).
- **Share to a friend:** uses the iPhone share sheet (Web Share API) to send the event
  by text or any app.

## Look and feel: warm paper

- A cozy, newspaper-like feel: cream background, dark ink text, a serif typeface
  for reading and a clean sans-serif for controls.
- Generous margins and comfortable line length; reads like a morning paper.
- Dark mode ("night edition"): warm dark background, soft off-white text.
- Bottom tab bar with three sections: **Digest · Shelf · Radar**, plus a settings icon.
- No red notification badges, no attention-grabbing animation.

## Settings

- Bluesky handles (digest) and Bluesky event accounts (radar)
- RSS/Atom feeds (digest)
- iCal/RSS event calendars (radar)
- City and radius
- Daily digest minutes
- Relay URL and token
- Export / import / wipe data
- iOS Shortcut setup guide

## Out of scope for v1

- Notifications of any kind
- Logins to any platform
- YouTube, Mastodon, Ticketmaster (possible later)
- Sync between devices
- Screen Time / app blocking (a possible later native app)

## Terms-of-use check

| Source | Access method | Status |
|---|---|---|
| Bluesky | Public, unauthenticated AT Protocol API | Allowed, open protocol |
| RSS / Atom | Feeds the publishers provide for exactly this purpose | Allowed |
| iCal calendars | Feeds published for subscribing | Allowed |
| Content display | Excerpt + link back to original; no republishing | Fair, standard reader behaviour |

No scraping, no unofficial APIs, no third-party credentials.

## Open questions for later

- Encrypted relay "inbox" so the iOS Shortcut can save directly, with no clipboard step?
- Mastodon or YouTube channel feeds in the digest?
- Weekly "you read X minutes" reflection?
