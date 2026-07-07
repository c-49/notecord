import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import groupBy from 'lodash/groupBy'
import { db } from '@/services/db'
import { readNotes } from '@/services/offlineData'
import { getOlderNotes, getNotesInRange } from '@/services/api'
import { queueMutation, requestDrain, lastSyncedAt } from '@/services/mutationQueue'
import { getDayKey } from '@/utils/dateUtils'

const PAGE_SIZE = 30
const REVEAL_FETCH_LIMIT = 500
const MAX_REVEAL_ITERATIONS = 10

export const useNotesStore = defineStore('notes', () => {
  // Full, ascending-by-date_created list for the current page — cached
  // locally for offline access (capped to the most recent ~200, see
  // offlineData.js), extended further back on demand by loadMore() while
  // online. Every mutation below operates on this, never on the `notes`
  // computed exposed to components.
  const allNotes = ref([])
  const visibleCount = ref(PAGE_SIZE)
  const loading = ref(false)
  const loadingMore = ref(false)
  const currentPageId = ref(null)
  // True once loadMore() has confirmed there's genuinely nothing older left
  // on the server for this page — reset whenever the page changes.
  const exhaustedServerHistory = ref(false)

  // The visible window — most recent `visibleCount` notes, oldest first
  // (matches the chat-style feed's top-to-bottom order).
  const notes = computed(() => allNotes.value.slice(-visibleCount.value))
  const hasMore = computed(() => visibleCount.value < allNotes.value.length)

  async function loadNotes(pageId) {
    // Already loaded for this exact page — a genuine page switch always
    // changes currentPageId first, so this only ever skips a truly
    // redundant back-to-back call (e.g. search's jumpToResult() pre-loading
    // + widening the window right before navigation, followed moments
    // later by this same component's own route-watcher firing on mount).
    // Re-reading here would reset visibleCount and undo that widening.
    if (currentPageId.value === pageId && allNotes.value.length) return
    loading.value = true
    currentPageId.value = pageId
    visibleCount.value = PAGE_SIZE
    exhaustedServerHistory.value = false
    allNotes.value = []
    try {
      // Reads from the local Dexie mirror only — navStore.loadNav() already
      // pulled each page's recent notes on app boot, so this never needs
      // the network itself, online or offline.
      allNotes.value = await readNotes(pageId)
    } finally {
      loading.value = false
    }
  }

  // Reveals more of what's already cached locally (instant); once that's
  // exhausted, tries extending the cache further back from Directus — only
  // possible while online, since offline access is capped to what's already
  // synced ("right here, right now", not deep history).
  async function loadMore() {
    if (hasMore.value) {
      visibleCount.value = Math.min(visibleCount.value + PAGE_SIZE, allNotes.value.length)
      return
    }
    if (exhaustedServerHistory.value || !navigator.onLine) return
    loadingMore.value = true
    try {
      const oldest = allNotes.value[0]
      const older = await getOlderNotes(currentPageId.value, oldest?.date_created, PAGE_SIZE)
      if (!older.length) {
        exhaustedServerHistory.value = true
        return
      }
      const ascending = [...older].reverse()
      const noteRows = ascending.map(({ files, ...n }) => n)
      const fileRows = ascending.flatMap((n) => n.files ?? [])
      await db.transaction('rw', db.notes, db.note_files, async () => {
        await db.notes.bulkPut(noteRows)
        if (fileRows.length) await db.note_files.bulkPut(fileRows)
      })
      allNotes.value = [...ascending, ...allNotes.value]
      visibleCount.value += ascending.length
    } finally {
      loadingMore.value = false
    }
  }

  // Lightweight re-read used after the mutation queue drains something (e.g.
  // a deferred attachment upload resolving to a real file_id) — unlike
  // loadNotes(), doesn't reset to an empty list first, so it doesn't flash
  // the empty state on every background sync.
  watch(lastSyncedAt, async () => {
    if (currentPageId.value) allNotes.value = await readNotes(currentPageId.value)
  })

  function notesByDay() {
    return groupBy(notes.value, (n) => getDayKey(n.date_created))
  }

  // attachments: array of { type: 'image'|'file'|'voice'|'embed', file?: File, url?: string }
  async function addNote(pageId, content, attachments = []) {
    const id = crypto.randomUUID()
    const localRow = { id, page_id: pageId, content, date_created: new Date().toISOString(), date_updated: null }

    // Build every attachment row up front and push ONE fully-formed note —
    // pushing an empty `files: []` first and mutating it afterward is a Vue
    // reactivity trap: pushing a plain object into a reactive array wraps it
    // in a new proxy, but a variable captured before the push still points
    // at the raw (unwrapped) object, so later mutations through it are
    // invisible to the renderer. Only surfaced when offline, since the
    // online path happened to mask it with a fast full re-read afterward.
    const fileRows = attachments.map((att, i) => {
      const noteFileId = crypto.randomUUID()
      if (att.type === 'embed') {
        return { id: noteFileId, note_id: id, file_id: null, attachment_type: 'embed', embed_url: att.url ?? null, sort_order: i }
      }
      // Needs an actual upload before the note_files row can exist
      // server-side — queued as a distinct 'upload' mutation type (see
      // mutationQueue.js) that uploads the blob, then creates the record.
      // Shown instantly via a local blob preview in the meantime.
      return {
        id: noteFileId,
        note_id: id,
        file_id: null,
        attachment_type: att.type,
        embed_url: null,
        sort_order: i,
        _pendingFile: att.file,
        _previewUrl: URL.createObjectURL(att.file),
      }
    })

    allNotes.value.push({ ...localRow, files: fileRows })
    // A new note is always the most recent — keep it inside the visible
    // window even if the page was scrolled back to view older notes.
    visibleCount.value += 1
    // Capture the actual reactive proxy Vue just wrapped the pushed object
    // in — re-deriving "last element" after the awaits below would be wrong
    // if something else (e.g. the lastSyncedAt watcher) reassigns allNotes
    // in the meantime.
    const pushedNote = allNotes.value[allNotes.value.length - 1]

    await db.notes.put(localRow)
    // date_created/date_updated are server-assigned (readonly special
    // fields) — only send what the server actually accepts, same as before.
    await queueMutation('create', 'notes', id, { id, page_id: pageId, content })

    if (fileRows.length) await db.note_files.bulkPut(fileRows)
    for (const [i, att] of attachments.entries()) {
      const row = fileRows[i]
      if (att.type === 'embed') {
        await queueMutation('create', 'note_files', row.id, row)
      } else {
        await queueMutation('upload', 'note_files', row.id, {
          note_id: id,
          attachment_type: att.type,
          sort_order: i,
          file: att.file,
        })
      }
    }

    requestDrain()
    return pushedNote
  }

  async function editNote(id, content) {
    const idx = allNotes.value.findIndex((n) => n.id === id)
    if (idx !== -1) allNotes.value[idx].content = content
    await db.notes.update(id, { content })
    await queueMutation('update', 'notes', id, { content })
    requestDrain()
  }

  async function removeNote(id) {
    allNotes.value = allNotes.value.filter((n) => n.id !== id)
    const deletedAt = new Date().toISOString()
    await db.note_files.where('note_id').equals(id).modify({ deleted_at: deletedAt })
    await db.notes.update(id, { deleted_at: deletedAt })
    await queueMutation('delete', 'notes', id, null)
    requestDrain()
  }

  // Used by search's jump-to-result flow. Purely a Dexie/API side effect —
  // doesn't touch allNotes/visibleCount/currentPageId, so it's safe to call
  // before deciding whether/how to navigate. Returns { found: true } if the
  // note is (now) cached locally, or { found: false, reason } if it isn't
  // and can't be fetched (offline and not already cached).
  async function ensureNoteCached(pageId, noteId, noteDateCreated, isOnline) {
    const existing = await db.notes.get(noteId)
    if (existing && !existing.deleted_at) return { found: true }
    if (!isOnline) return { found: false, reason: 'offline-uncached' }

    let upperBound = new Date().toISOString()
    for (let i = 0; i < MAX_REVEAL_ITERATIONS; i++) {
      const rows = await getNotesInRange(pageId, noteDateCreated, upperBound, REVEAL_FETCH_LIMIT)
      if (!rows.length) break
      const noteRows = rows.map(({ files, ...n }) => n)
      const fileRows = rows.flatMap((n) => n.files ?? [])
      await db.transaction('rw', db.notes, db.note_files, async () => {
        await db.notes.bulkPut(noteRows)
        if (fileRows.length) await db.note_files.bulkPut(fileRows)
      })
      if (rows.some((n) => n.id === noteId)) return { found: true }
      if (rows.length < REVEAL_FETCH_LIMIT) break // hit the server's true history start
      upperBound = rows[rows.length - 1].date_created
    }
    return { found: false, reason: 'not-found' }
  }

  // Reveals an already-loaded-but-scrolled-out-of-window note by widening
  // the visible slice to include it. Returns false if the note isn't in
  // allNotes at all (caller should have ensureNoteCached()'d first).
  function widenToInclude(noteId) {
    const idx = allNotes.value.findIndex((n) => n.id === noteId)
    if (idx === -1) return false
    visibleCount.value = Math.max(visibleCount.value, allNotes.value.length - idx)
    return true
  }

  function clearNotes() {
    allNotes.value = []
    visibleCount.value = PAGE_SIZE
    exhaustedServerHistory.value = false
    currentPageId.value = null
  }

  return {
    notes,
    hasMore,
    loading,
    loadingMore,
    exhaustedServerHistory,
    currentPageId,
    notesByDay,
    loadNotes,
    loadMore,
    addNote,
    editNote,
    removeNote,
    ensureNoteCached,
    widenToInclude,
    clearNotes,
  }
})
