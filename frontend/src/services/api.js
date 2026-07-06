import {
  createDirectus,
  rest,
  authentication,
  readItems,
  readMe,
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

export async function getNotes(pageId) {
  return client.request(
    readItems('notes', {
      filter: { page_id: { _eq: pageId } },
      sort: ['date_created'],
      fields: ['*', 'files.*', 'files.file_id.*'],
    })
  )
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getFileUrl(fileId) {
  // Scoped read-only token (not the admin token) — this value ends up in every
  // <img>/<a> src in the DOM, browser history, and disk cache.
  return `${import.meta.env.VITE_DIRECTUS_URL}/assets/${fileId}?access_token=${import.meta.env.VITE_DIRECTUS_ASSET_TOKEN}`
}
