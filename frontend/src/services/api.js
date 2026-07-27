import {
  createDirectus,
  rest,
  authentication,
  realtime,
  readItems,
  readMe,
  readUsers,
  createItem,
  updateItem,
  deleteItem,
  uploadFiles,
} from '@directus/sdk'

const client = createDirectus(import.meta.env.VITE_DIRECTUS_URL)
  .with(authentication('cookie', { credentials: 'include' }))
  // Default reconnect budget is 10 retries at 1s apart (~10s) before the SDK
  // gives up for good — bumped up as cheap insurance for longer blips; the
  // 'online' listener below covers outages that outlast even this (laptop
  // sleep, mobile backgrounding).
  .with(realtime({ reconnect: { delay: 1000, retries: 20 } }))
  .with(rest())

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  return client.login({ email, password })
}

export async function logout() {
  return client.logout()
}

export async function refreshSession() {
  return client.refresh()
}

export async function getCurrentUser() {
  return client.request(readMe())
}

// ── Sections ──────────────────────────────────────────────────────────────────

export async function getSections() {
  return client.request(readItems('sections', { sort: ['sort_order'] }))
}

export async function createSection(data) {
  return client.request(createItem('sections', data))
}

export async function updateSection(id, data) {
  return client.request(updateItem('sections', id, data))
}

export async function deleteSection(id) {
  return client.request(deleteItem('sections', id))
}

// ── Pages ─────────────────────────────────────────────────────────────────────

export async function getPages() {
  return client.request(readItems('pages', { sort: ['sort_order'] }))
}

export async function createPage(data) {
  return client.request(createItem('pages', data))
}

export async function updatePage(id, data) {
  return client.request(updateItem('pages', id, data))
}

export async function deletePage(id) {
  return client.request(deleteItem('pages', id))
}

// ── Notes ─────────────────────────────────────────────────────────────────────

// Used to populate the offline Dexie mirror — only the most recent `limit`
// notes per page are cached for offline access (see offlineData.js), not
// the entire history, so this stays cheap regardless of how large a page's
// note history grows.
export async function getRecentNotes(pageId, limit) {
  return client.request(
    readItems('notes', {
      filter: { page_id: { _eq: pageId } },
      sort: ['-date_created'],
      fields: ['*', 'files.*', 'files.file_id.*'],
      limit,
    })
  )
}

// Used by "Load earlier notes" once the local cache is exhausted — fetches
// further back directly from Directus (online only; there's no offline
// fallback for notes older than what's cached).
export async function getOlderNotes(pageId, beforeDate, limit) {
  return client.request(
    readItems('notes', {
      filter: { page_id: { _eq: pageId }, date_created: { _lt: beforeDate } },
      sort: ['-date_created'],
      fields: ['*', 'files.*', 'files.file_id.*'],
      limit,
    })
  )
}

// ── Sharing ───────────────────────────────────────────────────────────────────

// Every grant the caller can see: rows they're the grantee of, plus every
// grant given out on sections they own (see setup-schema.js's
// section_access:read permission) — expanded with just enough of the
// grantee's profile to render "shared with jane@example.com" without a
// second round trip.
export async function listSectionAccess() {
  return client.request(
    readItems('section_access', {
      limit: -1,
      fields: ['*', 'user_id.id', 'user_id.first_name', 'user_id.last_name', 'user_id.email'],
    })
  )
}

export async function createSectionAccess(data) {
  return client.request(createItem('section_access', data))
}

export async function deleteSectionAccess(id) {
  return client.request(deleteItem('section_access', id))
}

// Share modal's user picker — email is the only reliable identifier here
// (no username field), scoped server-side to safe fields only (see
// directus_users:read in setup-schema.js).
export async function searchUsers(query) {
  const q = query.trim()
  if (!q) return []
  // directus_users is a system collection — the SDK requires the dedicated
  // readUsers() composable, not readItems('directus_users', ...).
  return client.request(
    readUsers({
      filter: { email: { _icontains: q } },
      fields: ['id', 'first_name', 'last_name', 'email'],
      limit: 10,
    })
  )
}

// ── Search ────────────────────────────────────────────────────────────────

// Online full search — one query across a single page or all pages.
// Keyword and attachment-filename are ANDed together (both narrow the same
// result set, not independent searches) rather than OR'd. dateFrom/dateTo
// are resolved, half-open ISO instants (dateFrom inclusive, dateTo
// exclusive) — see dateUtils.dayBoundsToIso.
export async function searchNotes({
  pageId, keyword, attachmentKeyword, dateFrom, dateTo, limit = 30, offset = 0,
} = {}) {
  const clauses = []
  if (pageId) clauses.push({ page_id: { _eq: pageId } })
  if (dateFrom) clauses.push({ date_created: { _gte: dateFrom } })
  if (dateTo) clauses.push({ date_created: { _lt: dateTo } })
  if (keyword) clauses.push({ content: { _icontains: keyword } })
  if (attachmentKeyword) {
    clauses.push({ files: { file_id: { filename_download: { _icontains: attachmentKeyword } } } })
  }
  return client.request(
    readItems('notes', {
      filter: clauses.length ? { _and: clauses } : {},
      sort: ['-date_created'],
      fields: ['*', 'files.*', 'files.file_id.*'],
      limit,
      offset,
    })
  )
}

// Fetches notes in [fromDate, toDate) for one page, newest first — used by
// notesStore.ensureNoteCached() to backfill the gap between a search
// result's date and what's currently cached, in as few round trips as
// possible.
export async function getNotesInRange(pageId, fromDate, toDate, limit = 500) {
  return client.request(
    readItems('notes', {
      filter: { page_id: { _eq: pageId }, date_created: { _gte: fromDate, _lt: toDate } },
      sort: ['-date_created'],
      fields: ['*', 'files.*', 'files.file_id.*'],
      limit,
    })
  )
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function createNote(data) {
  return client.request(createItem('notes', data))
}

export async function updateNote(id, data) {
  return client.request(updateItem('notes', id, data))
}

export async function deleteNote(id) {
  return client.request(deleteItem('notes', id))
}

// ── Realtime ──────────────────────────────────────────────────────────────────

// One shared socket for the whole app — connected lazily on the first
// subscribeToNotes() call (not at module load, so we're never opening a
// socket before the user is actually authenticated). Per-page subscriptions
// are cheap filters layered on top of it, not one socket per page.
let connectPromise = null
function ensureConnected() {
  if (!connectPromise) {
    connectPromise = client.connect().catch((e) => {
      connectPromise = null
      throw e
    })
  }
  return connectPromise
}

// Tracks every currently-active subscription (keyed by pageId) so a dropped
// connection can resubscribe everything once reconnected — see the 'online'
// handler below. Each entry's `unsubscribe` is reassigned in place on every
// (re)subscribe so a caller's dispose() always tears down the *current*
// underlying subscription, not a stale one from before a reconnect.
const activeSubscriptions = new Map()

async function runSubscription(pageId, entry) {
  // A note and its attachments are two separate collections/writes
  // (queueMutation() sends the note's 'create' first, then a distinct
  // 'note_files' create per attachment) — the note's own create event
  // routinely arrives before its note_files rows exist server-side, so
  // `files` on that event is often still empty. A second subscription on
  // note_files (permission-checked via the same note_id → page_id →
  // section_id → section_access chain as note_files:read — see
  // setup-schema.js) fills the attachment in moments later instead of
  // leaving it missing until the viewer's next reload.
  const [notes, files] = await Promise.all([
    client.subscribe('notes', {
      filter: { page_id: { _eq: pageId } },
      query: { fields: ['*', 'files.*', 'files.file_id.*'] },
    }),
    client.subscribe('note_files', {
      event: 'create',
      filter: { note_id: { page_id: { _eq: pageId } } },
      query: { fields: ['*', 'file_id.*'] },
    }),
  ])
  entry.unsubscribe = () => {
    notes.unsubscribe()
    files.unsubscribe()
  }
  ;(async () => {
    try {
      for await (const msg of notes.subscription) {
        if (msg.event === 'create') entry.callbacks.onCreate?.(msg.data)
        else if (msg.event === 'update') entry.callbacks.onUpdate?.(msg.data)
        // event === 'delete': data is bare ids (string[]/number[]), not items.
        else if (msg.event === 'delete') entry.callbacks.onDelete?.(msg.data)
      }
    } catch {
      // The generator ends when unsubscribe() is called or the socket
      // drops out from under it — nothing to do here either way; a dropped
      // connection is handled by the 'online' listener below.
    }
  })()
  ;(async () => {
    try {
      for await (const msg of files.subscription) {
        if (msg.event === 'create') entry.callbacks.onFileCreate?.(msg.data)
      }
    } catch {
      // Same as above.
    }
  })()
}

// Subscribes to create/update/delete events for one page's notes (plus
// attachment arrivals — see runSubscription's note_files comment above).
// Returns a { dispose } handle — call it on unmount/page change to avoid
// leaking subscriptions when switching channels. Never throws: a realtime
// failure degrades to "no live updates" rather than breaking the page (REST
// + the Dexie mirror still work regardless).
export async function subscribeToNotes(pageId, { onCreate, onUpdate, onDelete, onFileCreate } = {}) {
  const entry = { callbacks: { onCreate, onUpdate, onDelete, onFileCreate }, unsubscribe: null }
  try {
    await ensureConnected()
    activeSubscriptions.set(pageId, entry)
    await runSubscription(pageId, entry)
  } catch (e) {
    console.error('Realtime: failed to subscribe to notes for page', pageId, e)
    activeSubscriptions.delete(pageId)
  }
  return {
    dispose() {
      activeSubscriptions.delete(pageId)
      entry.unsubscribe?.()
    },
  }
}

// Covers what the SDK's own bounded reconnect (see the realtime() config
// above) doesn't: laptop sleep or mobile backgrounding routinely outlasts
// even a generous retry budget, after which the SDK gives up for good and
// does nothing further on its own. Re-issue every still-active page
// subscription fresh once the browser reports connectivity again.
window.addEventListener('online', async () => {
  try {
    if (await client.isConnected()) return
    connectPromise = null
    await ensureConnected()
    for (const [pageId, entry] of activeSubscriptions) {
      await runSubscription(pageId, entry)
    }
  } catch (e) {
    console.error('Realtime: resubscribe after reconnect failed', e)
  }
})

// ── Note files (attachments) ──────────────────────────────────────────────────

export async function createNoteFile(data) {
  return client.request(createItem('note_files', data, { fields: ['*', 'file_id.*'] }))
}

export async function deleteNoteFile(id) {
  return client.request(deleteItem('note_files', id))
}

// ── File uploads ──────────────────────────────────────────────────────────────

export async function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  return client.request(uploadFiles(formData))
}

// ── Backup status ─────────────────────────────────────────────────────────────

// backup_status covers the whole instance (every user's data), so unlike
// every other collection here it is NOT readable by every "NoteCord User" —
// only the one account with the "Backup Admin" policy attached (see
// setup-schema.js). For every other user this rejects; callers must treat
// that as "no backup access" rather than an error to surface.
export async function getBackupStatus() {
  return client.request(readItems('backup_status'))
}

// Downloads a backup file through the caller's own authenticated session —
// deliberately NOT getFileUrl()'s static ASSET_TOKEN, which is a shared,
// unauthenticated credential fine for a note-attachment thumbnail but wrong
// for a whole-database dump. This goes through Directus's real permission
// check for whichever user is actually logged in, same as every other call
// in this file — only the "Backup Admin" policy holder can succeed.
export async function downloadBackupFile(fileId, filename) {
  const token = await client.getToken()
  const res = await fetch(`${import.meta.env.VITE_DIRECTUS_URL}/assets/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Personal export ───────────────────────────────────────────────────────────

// Every user can request an export of just their own notes (unlike
// backup_status above). The row starts as {status:'pending'} — nothing to
// send in the body, owner_id is stamped server-side via a preset.
export async function requestExport() {
  return client.request(createItem('export_requests', {}))
}

// Only the caller's own request rows are readable (owner_id scoping) —
// there's ever at most one per user (export-personal.js prunes older ones
// once a new one settles), so the latest is always the current state.
export async function getMyExportRequests() {
  return client.request(readItems('export_requests', { sort: ['-requested_at'], limit: 1 }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getFileUrl(fileId) {
  // Scoped read-only token (not the admin token) — this value ends up in every
  // <img>/<a> src in the DOM, browser history, and disk cache.
  return `${import.meta.env.VITE_DIRECTUS_URL}/assets/${fileId}?access_token=${import.meta.env.VITE_DIRECTUS_ASSET_TOKEN}`
}
