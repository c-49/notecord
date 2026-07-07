import groupBy from 'lodash/groupBy'
import { db } from './db'
import { getSections, getPages, getRecentNotes } from './api'

// Offline access only guarantees the most recent notes per page — reaching
// further back is an online-only action (see notesStore.js's loadMore()).
// Keeps the sync payload and local storage bounded regardless of how large
// a page's full note history grows.
export const NOTES_CACHE_LIMIT_PER_PAGE = 200

// Pulls sections/pages and each page's recent notes, replacing the local
// mirror. Wrapped in one transaction so a network blip mid-sync can't leave
// the cache half-cleared — Dexie rolls the whole thing back on any failure.
export async function syncAll() {
  const [sections, pages] = await Promise.all([getSections(), getPages()])
  const perPageNotes = await Promise.all(pages.map((p) => getRecentNotes(p.id, NOTES_CACHE_LIMIT_PER_PAGE)))
  const notes = perPageNotes.flat()
  const noteRows = notes.map(({ files, ...note }) => note)
  const fileRows = notes.flatMap((n) => n.files ?? [])

  await db.transaction('rw', db.sections, db.pages, db.notes, db.note_files, async () => {
    await Promise.all([db.sections.clear(), db.pages.clear()])
    await Promise.all([db.sections.bulkPut(sections), db.pages.bulkPut(pages)])
    // Upsert only — notes/note_files are never cleared wholesale anymore,
    // since older notes fetched on demand (loadMore() extending past the
    // cache limit while online) must survive a resync. Trade-off: a note
    // deleted by another device while this one was offline may not
    // disappear from the cache until this device otherwise touches it —
    // an accepted, rare edge case for a single-user app, same category as
    // the roadmap's already-noted multi-device conflict tolerance.
    await db.notes.bulkPut(noteRows)
    if (fileRows.length) await db.note_files.bulkPut(fileRows)
  })
}

// Wipes the local mirror — called on logout so cached notes aren't readable
// via IndexedDB after the user signs out (e.g. on a shared device).
export async function clearAll() {
  await db.transaction('rw', db.sections, db.pages, db.notes, db.note_files, async () => {
    await Promise.all([db.sections.clear(), db.pages.clear(), db.notes.clear(), db.note_files.clear()])
  })
}

export async function readNav() {
  const [sections, pages] = await Promise.all([
    db.sections.orderBy('sort_order').toArray(),
    db.pages.orderBy('sort_order').toArray(),
  ])
  // Deletes are soft (tombstoned with deleted_at) rather than hard, so a
  // stale queued mutation can't resurrect an already-deleted record — see
  // mutationQueue.js. Tombstoned rows are simply hidden from every read.
  return [sections.filter((s) => !s.deleted_at), pages.filter((p) => !p.deleted_at)]
}

export async function readNotes(pageId) {
  const noteRows = (await db.notes.where('page_id').equals(pageId).sortBy('date_created'))
    .filter((n) => !n.deleted_at)
  const ids = noteRows.map((n) => n.id)
  const fileRows = ids.length ? await db.note_files.where('note_id').anyOf(ids).toArray() : []
  const filesByNote = groupBy(fileRows.filter((f) => !f.deleted_at), 'note_id')
  return noteRows.map((n) => ({
    ...n,
    files: (filesByNote[n.id] ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }))
}
