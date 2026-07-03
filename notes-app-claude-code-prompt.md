# Project Brief: "NoteCord" — Discord-Style Personal Notes App

## Prompt for Claude Code

Paste everything below this line as your instructions to Claude Code.

---

## Overview

Build a single-user, self-hosted notes application with a Discord-like interface. The structure mirrors Discord's Server → Category → Channel hierarchy, but repurposed for note organization:

- **Server** = the root container (implicit — there's only ever one, so it doesn't need to be a literal object in the data model, just the top-level view).
- **Sections** = folders that group pages. Optional — pages can also live directly at the root.
- **Pages** = individual note spaces. Each page holds a stream of "notes" (entries), rendered as discrete, timestamped blocks — like a Discord channel's message log.

This is a **single-user app** — no login/auth system is needed for the app itself. Directus's own admin panel will have its standard auth, but the end-user-facing Vue app should load straight in.

## Tech Stack

- **Frontend:** Vite + Vue 3 (Composition API), Pinia for state management, Vue Router if needed for deep-linking to pages.
- **Backend:** Directus (headless CMS) backed by PostgreSQL. Use Directus purely as the data layer + file storage + REST/GraphQL API — the actual UI is the custom Vue frontend, not the Directus admin panel (though the admin panel is great for inspecting data directly during development).
- **Rich text editor:** Tiptap (ProseMirror-based) — supports tables, embeds, and extensible marks/nodes, plays nicely with Vue 3.
- **Date/time handling:** Luxon — use it for all timestamp formatting and relative-time display (e.g., "Today at 3:45 PM" style, Discord-esque grouping of notes by day).
- **Utilities:** Lodash — use for general-purpose helpers (debounce on autosave/composer input, throttling scroll handlers, groupBy for grouping notes by date, etc.) instead of hand-rolling these.
- **Color picker (for theming, nice-to-have):** `vue3-colorpicker` or similar.
- **Voice notes:** Browser `MediaRecorder` API to capture audio client-side, upload the resulting blob to Directus as a file asset.
- **Deployment target:** monorepo with `frontend/` and `backend/` folders (Directus can run as its own service, or be containerized alongside the frontend later). Don't over-engineer deployment yet — focus on local dev first.

## Architecture Philosophy (Systems Thinking)

Treat this as a set of composable, loosely-coupled subsystems rather than one big app:

1. **Data layer** (Directus collections + API) — owns persistence and file storage, agnostic to how it's displayed.
2. **State layer** (Pinia stores) — owns client-side app state (current page, current section tree, theme settings), talks to the data layer via a thin API service module (don't scatter fetch calls through components).
3. **Navigation/shell layer** (Sidebar, Section tree, Page list) — purely structural, no note-content logic.
4. **Content layer** (Page view, Note composer, Note block renderers) — renders and creates notes, doesn't know or care about sidebar state.
5. **Cross-cutting concerns** (theming, responsive layout, date formatting) — implemented as providers/composables that any component can tap into, not hardcoded into individual components.

Componentize aggressively — small, single-responsibility components that compose into the full UI. Suggested component breakdown below.

## Note Model — Important Detail

Notes are **versatile, not single-type**. Every note is fundamentally a piece of text, with the *option* to attach one additional item to it — an image, a file, a link embed, or a voice recording. It is not "pick one of five types" — it's "text, optionally plus one attachment."

Examples of valid notes:
- Just text, no attachment.
- Text with an attached image (e.g., a caption plus a screenshot).
- Text with an attached file.
- Text with an attached link embed.
- Text with an attached voice recording.
- (Edge case) Just an attachment, empty text — should be allowed too, similar to sending an image with no caption in Discord.

**Rendering:** Each note renders as its own distinct block in the page feed, Discord-message-style:
- The text (if any) renders first, followed by the attachment (if any) rendered appropriately for its type below/alongside the text.
- Each block shows a timestamp (via Luxon — format similar to Discord's "Today at 3:45 PM" / "Jan 4, 2026").
- Each block is independently interactive: hovering or selecting a note highlights *only that block*, not the whole feed or adjacent notes. Treat each note as a self-contained, individually-addressable chunk in the DOM — this matters for both the highlight behavior and for future features like per-note editing/deleting.

## Directus Data Model

Set up these collections:

**`sections`**
- `id` (auto)
- `name` (string)
- `emoji` (string, nullable)
- `sort_order` (integer)

**`pages`**
- `id` (auto)
- `name` (string)
- `emoji` (string, nullable)
- `section_id` (M2O relation to `sections`, **nullable** — null means it lives at root)
- `sort_order` (integer)

**`notes`**
- `id` (auto)
- `page_id` (M2O relation to `pages`, required)
- `content` (rich text / JSON — the Tiptap document; nullable if the note is attachment-only)
- `attachment_type` (enum: `none`, `image`, `file`, `embed`, `voice` — default `none`)
- `attachment_file` (M2O relation to Directus `directus_files`, nullable — used for image/file/voice types)
- `embed_url` (string, nullable — used only when `attachment_type` is `embed`)
- `created_at` (datetime, auto)
- `updated_at` (datetime, auto)

This keeps "type" describing the *attachment*, not the note itself — the note is always fundamentally text-shaped, with an optional bolt-on.

## Frontend Component Breakdown

```
App.vue
├── AppShell.vue                 (responsive layout: sidebar + main panel)
│   ├── ServerSidebar.vue        (root container — houses section/page nav)
│   │   ├── SectionGroup.vue     (collapsible folder, renders its pages)
│   │   │   └── PageListItem.vue
│   │   └── PageListItem.vue     (root-level pages, no section)
│   ├── PageView.vue             (main content panel for the active page)
│   │   ├── NoteFeed.vue         (scrollable list of notes in the page)
│   │   │   └── NoteBlock.vue    (renders one note: text + optional attachment + timestamp; owns its own highlight/selection state)
│   │   │       └── AttachmentRenderer.vue  (dispatches by attachment_type)
│   │   │           ├── ImageAttachment.vue
│   │   │           ├── FileAttachment.vue
│   │   │           ├── EmbedAttachment.vue
│   │   │           └── VoiceAttachment.vue (audio player)
│   │   └── NoteComposer.vue     (input bar: rich text + one optional attachment slot + voice record button)
│   │       ├── RichTextEditor.vue   (Tiptap wrapper)
│   │       ├── FileUploadButton.vue
│   │       └── VoiceRecorderButton.vue
│   └── ThemeCustomizer.vue      (nice-to-have: color pickers for theme vars)
```

State: a `useAppStore` (or split into `useNavStore` + `useNotesStore`) in Pinia holds the section/page tree and the active page's notes. An `api.js` service module wraps all Directus SDK calls — components never call `fetch`/the SDK directly. A small `dateUtils.js` composable/helper wraps Luxon formatting so timestamp logic lives in one place.

## UI/UX Requirements

- **Visual style:** Discord-inspired — dark theme by default, generously rounded corners (buttons, cards, input fields, avatars/icons), soft shadows, clear visual hierarchy between sidebar and main content.
- **Layout:** Left sidebar (sections/pages) + main panel (active page's notes + composer at the bottom), same general shape as Discord.
- **Mobile-friendly:** On narrow viewports, the sidebar should collapse into a slide-out drawer (hamburger toggle), and the page view takes the full screen — same pattern Discord uses on mobile web.
- **Interactions:** creating/renaming/deleting sections and pages should feel lightweight (inline editing or a small modal), emoji picker or plain emoji-in-text-field support for naming.
- **Note blocks:** each note is visually its own chunk (padding/margin separation, subtle hover background). Selecting/highlighting one note should never bleed into neighboring notes — treat highlight state as local to `NoteBlock.vue`, not a shared/global selection index unless you need multi-select later.
- **Note composer:** should support typing rich text, attaching one file/image, pasting a link to auto-generate an embed, and a mic button to record a voice note — all from one persistent input bar at the bottom of the page view. Text is **not required** to submit a note — an attachment alone (image, file, embed, or voice recording) is a valid, submittable note on its own, same as Discord. The only invalid state is submitting completely empty (no text *and* no attachment).

## Build Order (Suggested Phases)

1. **Scaffold:** Vite + Vue 3 project, Pinia, basic routing, connect to a local Directus instance (Docker or local install) with Postgres. Install Luxon and Lodash as core dependencies from the start.
2. **Data layer:** Create the `sections`, `pages`, and `notes` collections above, set up the API service module, verify CRUD works against Directus's REST API.
3. **Navigation shell:** Sidebar with sections/pages, create/rename/delete/reorder functionality, root vs. sectioned pages.
4. **Core note feed:** Text-only notes first — composer + feed + `NoteBlock.vue` rendering with Luxon timestamps and per-block highlight behavior. Get this loop fully solid before adding attachments.
5. **Attachments:** Add the optional attachment slot to the composer and `AttachmentRenderer.vue` — image upload, file upload, link embeds (start simple: store the URL, render a basic card).
6. **Voice notes:** MediaRecorder capture → upload → playback in `VoiceAttachment.vue`.
7. **Rich text editor:** Swap the plain text composer for Tiptap with table support.
8. **Mobile responsiveness pass:** Sidebar drawer behavior, touch-friendly targets, test at narrow viewports.
9. **Theming (nice-to-have):** CSS custom properties for colors, a `ThemeCustomizer` panel with color pickers wired to those variables, persisted to localStorage or a Directus settings record.

## Notes for Claude Code

- Favor small, focused commits/edits per phase above rather than generating the whole app in one shot — validate each layer works before building on top of it.
- Use CSS variables for all colors/spacing from the start, even before the theming feature is built — it makes the later theming nice-to-have trivial to wire up.
- Keep the Directus schema and the Vue app loosely coupled through the API service layer, so either side can evolve independently.
- Use Luxon for every date/time computation and display string — avoid native Date formatting or ad-hoc string math for "time ago" style displays.
- Reach for Lodash utilities (debounce, throttle, groupBy, etc.) instead of writing bespoke versions of these — keeps the codebase consistent and saves time.
