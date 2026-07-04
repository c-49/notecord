# NoteCord

A self-hosted personal notes app with a Discord-inspired UI. Single-user, no accounts, no cloud — just a clean dark interface for capturing text, images, files, links, and voice notes organized into sections and pages.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3 (Composition API, `<script setup>`) + Vite 6 |
| State | Pinia |
| Routing | Vue Router 4 |
| Backend / API | Directus 11 (headless CMS) |
| Database | PostgreSQL 16 |
| Infrastructure | Docker Compose |

## Features

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

## Project structure

```
notecord/
├── backend/
│   ├── docker-compose.yml     # Directus + PostgreSQL
│   ├── .env                   # DB creds + admin token (gitignored)
│   ├── .env.example
│   └── setup-schema.js        # Idempotent schema + permissions bootstrap
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── attachments/   # ImageAttachment, FileAttachment, EmbedAttachment, VoiceAttachment
    │   │   ├── composer/      # NoteComposer, RichTextEditor (Tiptap), FileUploadButton, VoiceRecorderButton
    │   │   ├── AppShell.vue
    │   │   ├── EmojiInput.vue
    │   │   ├── NoteBlock.vue
    │   │   ├── PageListItem.vue
    │   │   ├── SectionGroup.vue
    │   │   ├── ServerSidebar.vue
    │   │   └── ThemeCustomizer.vue
    │   ├── router/
    │   ├── services/api.js    # Directus SDK wrapper
    │   ├── stores/            # navStore, notesStore, themeStore (Pinia)
    │   └── utils/
    ├── .env                   # Directus URL + token (gitignored)
    └── .env.example
```

## Setup

### 1. Start the backend

```bash
cd backend
cp .env.example .env          # fill in your values
docker compose up -d
node setup-schema.js          # creates collections, relations, permissions, and a scoped read-only asset-reader token
```

### 2. Start the frontend

```bash
cd frontend
cp .env.example .env          # set VITE_DIRECTUS_URL and VITE_DIRECTUS_TOKEN
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

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
ADMIN_TOKEN=your_static_token
ASSET_TOKEN=your_asset_token   # scoped read-only token; setup-schema.js provisions the user it belongs to
```

**`frontend/.env`**
```
VITE_DIRECTUS_URL=http://localhost:8055
VITE_DIRECTUS_TOKEN=your_static_token         # must match ADMIN_TOKEN above
VITE_DIRECTUS_ASSET_TOKEN=your_asset_token    # must match ASSET_TOKEN above — used only for file/image URLs
```

> **Note:** Both tokens are embedded in the built JS — this app is designed for local/self-hosted use only, do not expose it publicly. `VITE_DIRECTUS_TOKEN` (admin) is required for CRUD from the frontend and can't avoid that exposure, but `VITE_DIRECTUS_ASSET_TOKEN` is scoped to read-only access on `directus_files`, so the token that actually ends up in every `<img>`/`<a>` `src` in the DOM, browser history, and disk cache is the low-privilege one, not the admin token.
