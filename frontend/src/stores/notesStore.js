import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import groupBy from 'lodash/groupBy'
import { db } from '@/services/db'
import { readNotes, NOTES_CACHE_LIMIT_PER_PAGE } from '@/services/offlineData'
import { getOlderNotes, getNotesInRange } from '@/services/api'
import { queueMutation, requestDrain, lastSyncedAt } from '@/services/mutationQueue'
import { getDayKey } from '@/utils/dateUtils'
import { useAuthStore } from '@/stores/authStore'
import { useNavStore } from '@/stores/navStore'

const PAGE_SIZE = 30
const REVEAL_FETCH_LIMIT = 500
const MAX_REVEAL_ITERATIONS = 10

// Injection key so ThreadPanel.vue's NoteFeed/NoteBlock/NoteComposer/
// NoteReactions can share a SEPARATE notes-store instance from the main
// PageView's — both can be mounted at once (main feed + thread panel), and
// without this they'd fight over the same currentPageId/allNotes state.
// PageView.vue/ThreadPanel.vue each create their own instance (via the
// `instanceId` param below) and provide() it; components that consume it
// inject() with a fallback to the default instance so standalone usage
// (e.g. tests) still works.
export const notesStoreKey = Symbol('notesStore')

// `instanceId` creates a genuinely separate Pinia store (a distinct entry
// in the store registry) rather than the app-wide singleton — Pinia keys
// stores by id, so calling defineStore with a different id every time
// yields independent state. Every existing call site uses no argument
// (the default 'notes' id), so this is a no-op for them.
export function useNotesStore(instanceId = 'notes') {
  return defineStore(instanceId, () => {
  const authStore = useAuthStore()
  const navStore = useNavStore()

  // Keeps navStore.threadNoteCounts current for whichever page this
  // instance has loaded — a no-op unless that page is actually a thread
  // (see NoteBlock.vue's "🧵 N replies" affordance, which reads the count
  // rather than just "does a thread page exist", since a freshly-created
  // thread starts with zero notes).
  function syncThreadNoteCount() {
    const page = navStore.pages.find((p) => p.id === currentPageId.value)
    if (page?.parent_page_id) navStore.setThreadNoteCount(page.id, allNotes.value.length)
  }
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
      // The initial sync fetches up to NOTES_CACHE_LIMIT_PER_PAGE of the
      // most recent notes — if fewer than that came back, the server never
      // had more to give in the first place, so we already know the full
      // history is cached locally without needing to probe loadMore().
      if (allNotes.value.length < NOTES_CACHE_LIMIT_PER_PAGE) {
        exhaustedServerHistory.value = true
      }
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

    allNotes.value.push({ ...localRow, files: fileRows, reactions: [] })
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
    syncThreadNoteCount()
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
    await db.note_reactions.where('note_id').equals(id).modify({ deleted_at: deletedAt })
    await db.note_pins.where('note_id').equals(id).modify({ deleted_at: deletedAt })
    await db.notes.update(id, { deleted_at: deletedAt })
    // DB CASCADEs pages.origin_note_id too (deleting a note takes its own
    // thread page — and that thread's notes in turn — with it, see
    // setup-schema.js) — mirror that locally the same way navStore's
    // removePage() mirrors a direct page-delete's cascade.
    const threadIds = navStore.pages.filter((p) => p.origin_note_id === id).map((p) => p.id)
    if (threadIds.length) {
      navStore.pages = navStore.pages.filter((p) => !threadIds.includes(p.id))
      const threadNoteIds = await db.notes.where('page_id').anyOf(threadIds).primaryKeys()
      if (threadNoteIds.length) {
        await db.note_files.where('note_id').anyOf(threadNoteIds).modify({ deleted_at: deletedAt })
        await db.note_reactions.where('note_id').anyOf(threadNoteIds).modify({ deleted_at: deletedAt })
        await db.note_pins.where('note_id').anyOf(threadNoteIds).modify({ deleted_at: deletedAt })
        await db.notes.where('page_id').anyOf(threadIds).modify({ deleted_at: deletedAt })
      }
      await db.pages.where('id').anyOf(threadIds).modify({ deleted_at: deletedAt })
    }
    await queueMutation('delete', 'notes', id, null)
    requestDrain()
    syncThreadNoteCount()

    // An empty thread is pointless (nothing left to reply to) — auto-delete
    // it once its last note is gone. Only ever applies to thread pages
    // (parent_page_id set); a normal page emptied of its notes is left
    // exactly as-is, deliberately not generalized to "any page with 0
    // notes". This only fires as a consequence of an explicit note
    // deletion — never on thread creation itself (which starts with zero
    // notes before the user posts a first reply) or merely opening/closing
    // the panel, since removeNote is never called in either of those paths.
    const currentPage = navStore.pages.find((p) => p.id === currentPageId.value)
    if (currentPage?.parent_page_id && allNotes.value.length === 0) {
      await navStore.removePage(currentPage.id)
    }
  }

  // Adds or removes the current user's own reaction of this emoji on this
  // note — a single click toggles, same as Discord. Finds the caller's own
  // (non-tombstoned) row for this exact note+emoji combo to decide which
  // branch to take, since a user can only ever have one such row (enforced
  // server-side by note_reactions' unique index).
  async function toggleReaction(noteId, emoji) {
    const idx = allNotes.value.findIndex((n) => n.id === noteId)
    if (idx === -1) return
    const note = allNotes.value[idx]
    const mine = (note.reactions ?? []).find(
      (r) => r.emoji === emoji && r.user_id?.id === authStore.user?.id && !r.deleted_at
    )

    if (mine) {
      allNotes.value[idx] = { ...note, reactions: note.reactions.filter((r) => r.id !== mine.id) }
      const deletedAt = new Date().toISOString()
      await db.note_reactions.update(mine.id, { deleted_at: deletedAt })
      await queueMutation('delete', 'note_reactions', mine.id, null)
    } else {
      const id = crypto.randomUUID()
      // user_id is stored fully expanded (not just the bare id) to match the
      // shape every reaction arrives in from the server (see api.js's
      // reactions.user_id.* fields) — same convention note_files already
      // uses for file_id (see mutationQueue.js's upload handler).
      const row = {
        id,
        note_id: noteId,
        user_id: {
          id: authStore.user.id,
          first_name: authStore.user.first_name,
          last_name: authStore.user.last_name,
          email: authStore.user.email,
        },
        emoji,
        date_created: new Date().toISOString(),
      }
      allNotes.value[idx] = { ...note, reactions: [...(note.reactions ?? []), row] }
      await db.note_reactions.put(row)
      // Only id/note_id/emoji are ever sent to the server — user_id is
      // stamped server-side via the create preset, not client-writable.
      await queueMutation('create', 'note_reactions', id, { id, note_id: noteId, emoji })
    }
    requestDrain()
  }

  // Toggles whether a note is pinned — unlike reactions (many per note, one
  // per user+emoji), a pin is a single shared existence flag (see
  // setup-schema.js's note_pins collection comment): if ANY active pin row
  // exists, this note counts as pinned to every viewer, and toggling
  // removes THAT row regardless of who created it. Whether the removal
  // actually succeeds is up to the server's hybrid delete permission
  // (pinning user, or the note/page/section owner — see setup-schema.js) —
  // a collaborator who isn't allowed will have the request rejected
  // server-side (and, per mutationQueue.js's existing 403-is-stale
  // assumption, silently dropped from the local queue on drain; an
  // accepted rare-edge-case, same category as this app's other
  // multi-device tolerances).
  async function togglePin(noteId) {
    const idx = allNotes.value.findIndex((n) => n.id === noteId)
    if (idx === -1) return
    const note = allNotes.value[idx]
    const existing = (note.pins ?? []).find((p) => !p.deleted_at)

    if (existing) {
      allNotes.value[idx] = { ...note, pins: note.pins.filter((p) => p.id !== existing.id) }
      const deletedAt = new Date().toISOString()
      await db.note_pins.update(existing.id, { deleted_at: deletedAt })
      await queueMutation('delete', 'note_pins', existing.id, null)
    } else {
      const id = crypto.randomUUID()
      const row = { id, note_id: noteId, pinned_by: authStore.user?.id, pinned_at: new Date().toISOString() }
      allNotes.value[idx] = { ...note, pins: [...(note.pins ?? []), row] }
      await db.note_pins.put(row)
      // Only id/note_id are ever sent to the server — pinned_by is stamped
      // server-side via the create preset, not client-writable.
      await queueMutation('create', 'note_pins', id, { id, note_id: noteId })
    }
    requestDrain()
  }

  // ── Realtime (see services/api.js's subscribeToNotes) ──────────────────────
  // All three handlers below write through to Dexie (db.notes/db.note_files)
  // in addition to the Pinia array — allNotes is populated from the Dexie
  // mirror (readNotes()) and the lastSyncedAt watcher above re-reads from it
  // after every mutation-queue drain, so a handler that only touched
  // allNotes would have its update silently dropped the next time that
  // watcher fires. They only touch allNotes/visibleCount for the
  // currently-open page — the subscription is already server-filtered to
  // one page, but a fast page switch can still land a stale in-flight event
  // just after currentPageId has moved on.

  // create echoes are matched by id, not appended blindly: addNote()
  // generates the note's id client-side before it's ever sent to the
  // server, so a create event for a note *we* just posted arrives with the
  // exact same id already in allNotes (the optimistic insert). Patching it
  // in place (rather than no-op'ing) picks up server-assigned fields like
  // the authoritative date_created, keeping ordering consistent with what
  // other clients see. A genuinely new note (from someone else, or another
  // tab) gets pushed and — same as addNote() — bumps visibleCount so it
  // doesn't silently push a previously-visible older note out of the
  // window.
  async function applyRemoteCreate(items) {
    for (const item of items) {
      const { files, ...noteRow } = item
      await db.notes.put(noteRow)
      if (files?.length) await db.note_files.bulkPut(files)

      if (noteRow.page_id !== currentPageId.value) continue
      const idx = allNotes.value.findIndex((n) => n.id === noteRow.id)
      if (idx !== -1) {
        allNotes.value[idx] = { ...allNotes.value[idx], ...noteRow, files: files ?? allNotes.value[idx].files }
      } else {
        allNotes.value.push({ ...noteRow, files: files ?? [] })
        visibleCount.value += 1
      }
    }
    syncThreadNoteCount()
  }

  async function applyRemoteUpdate(items) {
    for (const item of items) {
      const { files, ...noteRow } = item
      await db.notes.update(noteRow.id, noteRow)
      if (files?.length) await db.note_files.bulkPut(files)

      if (noteRow.page_id !== currentPageId.value) continue
      const idx = allNotes.value.findIndex((n) => n.id === noteRow.id)
      if (idx !== -1) {
        allNotes.value[idx] = { ...allNotes.value[idx], ...noteRow, files: files ?? allNotes.value[idx].files }
      }
    }
  }

  // ids only (not full items) — Directus sends bare primary keys for delete
  // subscription events. Soft-deletes in Dexie (deleted_at), matching
  // removeNote()'s tombstone convention rather than a hard delete, so a
  // stale queued mutation elsewhere can't resurrect the row.
  async function applyRemoteDelete(ids) {
    const deletedAt = new Date().toISOString()
    for (const id of ids) {
      await db.note_files.where('note_id').equals(id).modify({ deleted_at: deletedAt })
      await db.note_reactions.where('note_id').equals(id).modify({ deleted_at: deletedAt })
      await db.note_pins.where('note_id').equals(id).modify({ deleted_at: deletedAt })
      await db.notes.update(id, { deleted_at: deletedAt })
    }
    allNotes.value = allNotes.value.filter((n) => !ids.includes(n.id))
    syncThreadNoteCount()
  }

  // A note's own create event routinely arrives before its attachments do
  // (separate queued mutations server-side — see subscribeToNotes's comment
  // in services/api.js) — this fills them in as they land instead of
  // leaving the note attachment-less until the viewer's next reload.
  async function applyRemoteFileCreate(fileItems) {
    for (const file of fileItems) {
      await db.note_files.put(file)

      const idx = allNotes.value.findIndex((n) => n.id === file.note_id)
      if (idx === -1) continue // note not (yet) loaded on the currently-open page
      const note = allNotes.value[idx]
      if (note.files.some((f) => f.id === file.id)) continue // already picked up via the note's own create/update event
      allNotes.value[idx] = { ...note, files: [...note.files, file].sort((a, b) => a.sort_order - b.sort_order) }
    }
  }

  // Someone (possibly this same user, from another tab/device) added a
  // reaction. Matched by id against the current reactions list so this
  // client's own optimistic insert in toggleReaction() isn't duplicated when
  // its own echo arrives back — and, importantly, so it isn't *downgraded*
  // either: a realtime create event isn't guaranteed to carry the same
  // nested user_id expansion (id/first_name/last_name/email) that a normal
  // fetch or our own optimistic write already has (same class of gap as
  // note_files' "arrives before files exist" case elsewhere in this file).
  // If we already know this reaction, skip touching Dexie entirely rather
  // than risk overwriting a complete row with a sparser one — the
  // mutationQueue's lastSyncedAt watcher would otherwise pick up that
  // sparser Dexie row on its next full re-read and clobber good state with it.
  async function applyRemoteReactionCreate(items) {
    for (const item of items) {
      const idx = allNotes.value.findIndex((n) => n.id === item.note_id)
      if (idx !== -1 && allNotes.value[idx].reactions?.some((r) => r.id === item.id)) continue

      await db.note_reactions.put(item)
      if (idx === -1) continue // note not (yet) loaded on the currently-open page
      allNotes.value[idx] = { ...allNotes.value[idx], reactions: [...(allNotes.value[idx].reactions ?? []), item] }
    }
  }

  // ids only, same shape as applyRemoteDelete above. Soft-deleted in Dexie
  // for the same stale-mutation-resurrection reason as everything else here.
  async function applyRemoteReactionDelete(ids) {
    const deletedAt = new Date().toISOString()
    for (const id of ids) {
      await db.note_reactions.update(id, { deleted_at: deletedAt })
    }
    allNotes.value = allNotes.value.map((note) =>
      note.reactions?.some((r) => ids.includes(r.id))
        ? { ...note, reactions: note.reactions.filter((r) => !ids.includes(r.id)) }
        : note
    )
  }

  // Same shape as applyRemoteReactionCreate above — matched by id so this
  // client's own optimistic insert in togglePin() isn't duplicated when its
  // own echo arrives back.
  async function applyRemotePinCreate(items) {
    for (const item of items) {
      const idx = allNotes.value.findIndex((n) => n.id === item.note_id)
      if (idx !== -1 && allNotes.value[idx].pins?.some((p) => p.id === item.id)) continue

      await db.note_pins.put(item)
      if (idx === -1) continue
      allNotes.value[idx] = { ...allNotes.value[idx], pins: [...(allNotes.value[idx].pins ?? []), item] }
    }
  }

  // ids only, same shape as applyRemoteReactionDelete above.
  async function applyRemotePinDelete(ids) {
    const deletedAt = new Date().toISOString()
    for (const id of ids) {
      await db.note_pins.update(id, { deleted_at: deletedAt })
    }
    allNotes.value = allNotes.value.map((note) =>
      note.pins?.some((p) => ids.includes(p.id))
        ? { ...note, pins: note.pins.filter((p) => !ids.includes(p.id)) }
        : note
    )
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
    toggleReaction,
    togglePin,
    applyRemoteCreate,
    applyRemoteUpdate,
    applyRemoteDelete,
    applyRemoteFileCreate,
    applyRemoteReactionCreate,
    applyRemoteReactionDelete,
    applyRemotePinCreate,
    applyRemotePinDelete,
    ensureNoteCached,
    widenToInclude,
    clearNotes,
  }
  })()
}
