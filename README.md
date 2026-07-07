# NoteCord

A self-hosted personal notes app with a Discord-inspired UI. Single-user, gated behind login, installable as an offline-capable PWA — a clean dark interface for capturing text, images, files, links, and voice notes organized into sections and pages, that keeps working with no connection.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vite 6 |
| State | Pinia |
| Routing | Vue Router 4 |
| Offline storage | Dexie (IndexedDB) + a service worker (`vite-plugin-pwa`) |
| Backend / API | Directus 11 (headless CMS) |
| Database | PostgreSQL 16 |
| Infrastructure | Docker Compose (backend), Cloudflare Workers (frontend hosting) |

## Features

### Login
- Cookie-based session auth against Directus's own `/auth/login` — no third-party auth provider
- The app authenticates as a purpose-provisioned, non-admin "NoteCord User" role (scoped to CRUD on this app's own collections), kept separate from the Directus super-admin account
- Refresh token lives in an httpOnly cookie set by Directus itself; the access token is only ever held in memory, never in `localStorage`
- Reconnecting after a spell offline transparently re-authenticates in the background — no need to log back in just because the network dropped

### Navigation
- Sidebar with collapsible **sections** and **pages**
- Drag-friendly section/page hierarchy (section → pages, or root-level pages)
- Inline **emoji picker** on every section and page (click the emoji square, then use your OS picker — Win+. on Windows, ⌘⌃Space on Mac)
- Modal **create** and **rename** flows for both sections and pages
- Delete with confirmation; orphaned pages fall back to root
- Smart initial routing — auto-navigates to the first page on load

### Notes feed
- Discord-style **floating hover toolbar** (edit + delete) that appears above each note row — always visible on touch devices, since there's no hover to reveal it
- Rich text via **Tiptap**: bold/italic/strike/code, lists, checklists, blockquotes, tables, headings, font size, text/highlight color, and inline link-embed cards. Enter sends the note; Shift+Enter (or plain Enter inside a list/table/code block) adds a line
- Notes are stored and rendered as Tiptap-generated HTML via `v-html` — safe because Tiptap's schema-based parser only ever serializes nodes/marks it defines, so arbitrary script tags can't make it into `content` in the first place
- Notes grouped by day with human-readable date headers
- **Paginated** — loads 30 notes at a time with a "Load earlier notes" button, rather than rendering a page's entire history at once

### Attachments
- Up to **4 attachments** per note (configurable)
- **Images** — lightbox on click, Escape to close, fade-in on load, broken-image fallback
- **Files** — download card with filename, size, and hover download arrow
- **Embed links** — auto-detected when you paste a URL; rendered as a link card with accent bar
- **Voice notes** — recorded directly in the composer (see below)
- **Drag and drop** files onto the composer
- **Paste images** from clipboard (Ctrl+V)
- **Multi-file select** from the file picker (Ctrl/Shift+click)

### Voice notes
- One-click **record** button in the composer
- Live **elapsed timer** while recording
- **Pause / Resume** mid-recording
- **Discard** to throw away without attaching
- Preferred MIME type detection (`webm/opus` → `webm` → `ogg` → `mp4`)
- Playback with a **progress scrubber**, play/pause toggle, and `currentTime / duration` display
- Handles the WebM `Infinity` duration bug via seek-to-end detection

### Offline support
- **Installable PWA** — the app shell (static assets) is precached by a service worker, so it loads with no network at all, not just "shows an error gracefully"
- **Read**: every page's ~200 most recent notes are mirrored into a local IndexedDB store (via Dexie) on login/reconnect — the app always reads from this local mirror first, online or offline, so navigating between pages never waits on the network. Reaching further back than what's cached is an online-only action ("Load earlier notes" fetches directly from Directus once the local cache runs out); offline, it tells you plainly rather than failing silently
- **Write**: creating, editing, and deleting sections/pages/notes/attachments all work fully offline — every change writes to the local mirror instantly and queues for sync, replaying against Directus in dependency order once connectivity returns, with exponential backoff on failure. Deletes are soft (tombstoned) so a stale queued edit can never resurrect an already-deleted record, and a delete queued behind a note that was itself created offline cancels both locally with zero network calls
- **File/image/voice attachments** queue for deferred upload the same way — shown instantly via a local preview with an "Uploading…" badge until the real upload completes
- A small status dot next to the app name shows connection/sync state at a glance: green (fully synced), amber/pulsing (syncing), red (offline)

## Project structure

```
notecord/
├── backend/
│   ├── docker-compose.yml     # Directus + PostgreSQL
│   ├── .env                   # DB creds + admin/app-login credentials (gitignored)
│   ├── .env.example
│   ├── setup-schema.js        # Idempotent schema + permissions bootstrap (UUID PKs from the start)
│   └── migrations/
│       └── 001-uuid-ids.sql   # Only needed to upgrade a pre-UUID install — see below
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── attachments/   # ImageAttachment, FileAttachment, EmbedAttachment, VoiceAttachment, AttachmentRenderer
    │   │   ├── composer/      # NoteComposer, RichTextEditor (Tiptap), FileUploadButton, VoiceRecorderButton
    │   │   ├── AppShell.vue
    │   │   ├── EmojiInput.vue
    │   │   ├── LoginView.vue
    │   │   ├── NoteBlock.vue
    │   │   ├── NoteFeed.vue
    │   │   ├── PageListItem.vue
    │   │   ├── SectionGroup.vue
    │   │   ├── ServerSidebar.vue
    │   │   └── ThemeCustomizer.vue
    │   ├── composables/
    │   │   └── useOnlineStatus.js   # Active-probe connectivity check (navigator.onLine isn't reliable everywhere)
    │   ├── router/
    │   ├── services/
    │   │   ├── api.js               # Directus SDK wrapper
    │   │   ├── db.js                # Dexie (IndexedDB) schema
    │   │   ├── offlineData.js       # Sync-from-server + read-from-cache
    │   │   └── mutationQueue.js     # Offline write queue, drain/backoff, tombstones
    │   ├── stores/             # authStore, navStore, notesStore, themeStore (Pinia)
    │   └── utils/
    ├── worker.js               # Cloudflare Worker: serves the built app + a small Pinterest link-resolver route
    ├── wrangler.jsonc
    ├── .env                    # Directus URL + asset token (gitignored)
    └── .env.example
```

## Setup

### 1. Start the backend

```bash
cd backend
cp .env.example .env          # fill in your values
docker compose up -d
node setup-schema.js          # creates collections (UUID PKs), relations, permissions, and both service accounts below
```

`setup-schema.js` provisions two separate accounts, distinct from each other:
- An **admin** account (`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_TOKEN`) — full Directus access, used only for schema/admin operations.
- An **app login** account (`APP_USER_EMAIL`/`APP_USER_PASSWORD`) — scoped to CRUD on this app's own collections, `admin_access: false`. This is what the Vue app's login screen actually authenticates as.

> **Upgrading an existing pre-UUID install:** if your database predates this app's UUID migration (integer primary keys), run `backend/migrations/001-uuid-ids.sql` against your Postgres instance and restart Directus afterward — see the comments at the top of that file. Brand new installs don't need this; `setup-schema.js` creates UUID primary keys directly.

### 2. Start the frontend

```bash
cd frontend
cp .env.example .env          # set VITE_DIRECTUS_URL and VITE_DIRECTUS_ASSET_TOKEN
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with `APP_USER_EMAIL` / `APP_USER_PASSWORD`.

Pinterest `pin.it` link previews need the small resolver Worker (`worker.js`) running alongside — `npm run worker:dev` in a second terminal (Vite proxies `/api/*` to it at `localhost:8787`). Not needed for anything else; production serves it from the same Worker as the static app, no proxy involved.

The Directus admin panel is at [http://localhost:8055](http://localhost:8055).

### Environment variables

**`backend/.env`**
```
DB_USER=directus
DB_PASSWORD=your_password
DB_DATABASE=notecord
DIRECTUS_SECRET=your_secret

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_admin_password
ADMIN_TOKEN=your_static_admin_token

ASSET_TOKEN=your_asset_token          # scoped read-only token; setup-schema.js provisions the user it belongs to

APP_USER_EMAIL=you@example.com        # the account the app's login screen actually authenticates as
APP_USER_PASSWORD=your_login_password

# httpOnly refresh-token cookie settings. Local dev (frontend/backend both on
# localhost, same-site): secure=false, samesite=lax. Production (frontend on a
# Workers domain, backend on a different domain, both HTTPS): secure=true,
# samesite=none.
REFRESH_TOKEN_COOKIE_SECURE=false
REFRESH_TOKEN_COOKIE_SAME_SITE=lax
```

**`frontend/.env`**
```
VITE_DIRECTUS_URL=http://localhost:8055
VITE_DIRECTUS_ASSET_TOKEN=your_asset_token    # must match ASSET_TOKEN above — used only for file/image URLs
```

> **Note:** `VITE_DIRECTUS_ASSET_TOKEN` is the only credential embedded in the built JS, and it's scoped to read-only access on `directus_files` — so the token that ends up in every `<img>`/`<a>` `src` in the DOM, browser history, and disk cache is deliberately low-privilege. Actual write access requires a real login (`APP_USER_EMAIL`/`APP_USER_PASSWORD`), authenticated via an httpOnly cookie that JavaScript can never read.

## Deployment

The frontend deploys to Cloudflare Workers as static assets plus a minimal Worker (`worker.js`) that serves them and handles one small server-side route (Pinterest `pin.it` link resolution):

```bash
cd frontend
npm run deploy    # vite build && wrangler deploy
```

The backend (Directus + Postgres) is expected to run wherever you're self-hosting it — this repo's `docker-compose.yml` works as-is on any Docker host; just point `VITE_DIRECTUS_URL` at its public address and make sure its CORS/cookie settings (`CORS_ORIGIN`, `REFRESH_TOKEN_COOKIE_*`) match your actual frontend origin.
