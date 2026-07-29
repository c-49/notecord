import { ref } from 'vue'
import { db } from './db'
import {
  createSection, updateSection, deleteSection,
  createPage, updatePage, deletePage,
  createNote, updateNote, deleteNote,
  createNoteFile, deleteNoteFile,
  createReaction, deleteReaction,
  uploadFile,
} from './api'

export const pendingCount = ref(0)
// Bumped whenever a drain pass finishes something — stores watch this to
// know when to re-read from Dexie (e.g. after a deferred attachment upload
// resolves, which this module doesn't own the reactive UI state for).
export const lastSyncedAt = ref(0)

const COLLECTION_ORDER = ['sections', 'pages', 'notes', 'note_files', 'note_reactions']
const BASE_BACKOFF_MS = 5000
const MAX_BACKOFF_MS = 60000

let backoffMs = BASE_BACKOFF_MS
let backoffTimer = null
let draining = false

async function refreshPendingCount() {
  pendingCount.value = await db.pending_mutations.count()
}

// Directus returns 403 FORBIDDEN — not a distinct 404 — for a mutation
// against a record that doesn't exist, when using this app's scoped
// (non-admin) "NoteCord User" role. That's deliberate on Directus's part (it
// avoids leaking record existence to unauthorized callers). That role's
// permissions are static full-CRUD on every collection here and never
// change at runtime, so in practice a 403 during this queue's drain only
// ever means "the record's already gone" (e.g. deleted from another
// device) — safe to treat as stale and drop rather than a real failure.
function isStaleRecordError(e) {
  return Array.isArray(e?.errors) && e.errors.some((err) => err?.extensions?.code === 'FORBIDDEN')
}

// note_reactions' unique index (note_id, user_id, emoji) rejects a genuine
// duplicate with this code. In normal operation toggleReaction() never
// attempts to create one (it checks for an existing "mine" row first), but
// if local state and the server ever disagree about that (e.g. a stale
// Dexie mirror from before some future fix, or another client's own
// resurrection of the pattern this queue can't foresee), this is the same
// "already effectively true, safe to drop rather than retry forever" shape
// as isStaleRecordError above — a permanent conflict would otherwise retry
// with exponential backoff forever, leaving a phantom reaction the user can
// never remove (an actual bug hit once already — see notesStore.js's
// applyRemoteReactionCreate comment for the id-expansion root cause).
function isDuplicateReactionError(e) {
  return Array.isArray(e?.errors) && e.errors.some((err) => err?.extensions?.code === 'RECORD_NOT_UNIQUE')
}

export async function queueMutation(type, collection, recordId, payload) {
  if (type === 'delete') {
    const existing = await db.pending_mutations.where({ collection, record_id: recordId }).toArray()
    // Record never left this device — nothing to tell the server at all.
    const hadCreate = existing.some((m) => m.type === 'create' || m.type === 'upload')
    if (hadCreate) {
      await db.pending_mutations.where({ collection, record_id: recordId }).delete()
      await refreshPendingCount()
      return { cancelled: true }
    }
    // A queued update is moot once a delete follows it.
    const staleUpdateIds = existing.filter((m) => m.type === 'update').map((m) => m.localId)
    if (staleUpdateIds.length) await db.pending_mutations.bulkDelete(staleUpdateIds)
  }
  await db.pending_mutations.add({ type, collection, record_id: recordId, payload, timestamp: Date.now() })
  await refreshPendingCount()
  return { cancelled: false }
}

const API = {
  sections: { create: createSection, update: updateSection, delete: deleteSection },
  pages: { create: createPage, update: updatePage, delete: deletePage },
  notes: { create: createNote, update: updateNote, delete: deleteNote },
  note_files: { create: createNoteFile, delete: deleteNoteFile },
  note_reactions: { create: createReaction, delete: deleteReaction },
}

async function applyMutation(m) {
  if (m.type === 'upload') {
    const uploaded = await uploadFile(m.payload.file)
    const created = await createNoteFile({
      id: m.record_id,
      note_id: m.payload.note_id,
      file_id: uploaded.id,
      attachment_type: m.payload.attachment_type,
      embed_url: null,
      sort_order: m.payload.sort_order,
    })
    const existing = await db.note_files.get(m.record_id)
    if (existing?._previewUrl) URL.revokeObjectURL(existing._previewUrl)
    await db.note_files.update(m.record_id, {
      file_id: created.file_id,
      _pendingFile: undefined,
      _previewUrl: undefined,
    })
    return
  }

  const handler = API[m.collection]?.[m.type]
  if (!handler) throw new Error(`No API handler for ${m.collection}.${m.type}`)
  if (m.type === 'delete') await handler(m.record_id)
  else if (m.type === 'update') await handler(m.record_id, m.payload)
  else await handler(m.payload)
}

function scheduleRetry() {
  clearTimeout(backoffTimer)
  backoffTimer = setTimeout(async () => {
    const emptied = await drainQueue()
    if (!emptied) {
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      scheduleRetry()
    }
  }, backoffMs)
}

// Returns true once the queue is fully drained, false if it stopped early
// (offline, or a real failure) and still needs a retry.
export async function drainQueue() {
  if (draining) return true // an in-flight call already owns retry scheduling
  if (!navigator.onLine) return false
  draining = true
  try {
    for (const collection of COLLECTION_ORDER) {
      // Re-list each time — earlier mutations in this pass may have
      // cancelled/superseded later ones already queued for this collection.
      const mutations = await db.pending_mutations.where('collection').equals(collection).sortBy('timestamp')
      for (const m of mutations) {
        const stillQueued = await db.pending_mutations.get(m.localId)
        if (!stillQueued) continue
        try {
          await applyMutation(m)
          await db.pending_mutations.delete(m.localId)
          await refreshPendingCount()
        } catch (e) {
          if (isStaleRecordError(e)) {
            await db.pending_mutations.delete(m.localId)
            await refreshPendingCount()
            continue
          }
          if (m.collection === 'note_reactions' && m.type === 'create' && isDuplicateReactionError(e)) {
            // This exact reaction already exists server-side under some
            // other id — this optimistic row never will. Drop both the
            // mutation and the orphaned local row; the lastSyncedAt watcher
            // re-reading from Dexie below will remove it from the UI too.
            await db.pending_mutations.delete(m.localId)
            await db.note_reactions.delete(m.record_id)
            await refreshPendingCount()
            continue
          }
          return false
        }
      }
    }
    backoffMs = BASE_BACKOFF_MS
    lastSyncedAt.value = Date.now()
    return true
  } finally {
    draining = false
  }
}

// Fire-and-forget: call after queueing anything new so it attempts right
// away instead of waiting for the next backoff tick; reschedules if it
// can't finish (still offline, or a real failure).
export function requestDrain() {
  drainQueue().then((emptied) => {
    if (!emptied) scheduleRetry()
  })
}

export function initMutationQueue() {
  refreshPendingCount()
  window.addEventListener('online', () => {
    backoffMs = BASE_BACKOFF_MS
    requestDrain()
  })
}
