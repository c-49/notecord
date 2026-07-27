import {
  createDirectus,
  rest,
  authentication,
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
