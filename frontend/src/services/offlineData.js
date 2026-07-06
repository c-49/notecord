import groupBy from 'lodash/groupBy'
import { db } from './db'
import { getSections, getPages, getAllNotes } from './api'

// Pulls the entire dataset from Directus and replaces the local mirror.
// Wrapped in one transaction so a network blip mid-sync can't leave the
// cache half-cleared — Dexie rolls the whole thing back on any failure.
export async function syncAll() {
  const [sections, pages, notes] = await Promise.all([getSections(), getPages(), getAllNotes()])
  const noteRows = notes.map(({ files, ...note }) => note)
  const fileRows = notes.flatMap((n) => n.files ?? [])

  await db.transaction('rw', db.sections, db.pages, db.notes, db.note_files, async () => {
    await Promise.all([db.sections.clear(), db.pages.clear(), db.notes.clear(), db.note_files.clear()])
    await Promise.all([
      db.sections.bulkPut(sections),
      db.pages.bulkPut(pages),
      db.notes.bulkPut(noteRows),
      db.note_files.bulkPut(fileRows),
    ])
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
  return Promise.all([
    db.sections.orderBy('sort_order').toArray(),
    db.pages.orderBy('sort_order').toArray(),
  ])
}

export async function readNotes(pageId) {
  const noteRows = await db.notes.where('page_id').equals(pageId).sortBy('date_created')
  const ids = noteRows.map((n) => n.id)
  const fileRows = ids.length ? await db.note_files.where('note_id').anyOf(ids).toArray() : []
  const filesByNote = groupBy(fileRows, 'note_id')
  return noteRows.map((n) => ({
    ...n,
    files: (filesByNote[n.id] ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }))
}
