import Dexie from 'dexie'

export const db = new Dexie('notecord')

db.version(1).stores({
  sections: 'id, sort_order',
  pages: 'id, section_id, sort_order',
  notes: 'id, page_id, date_created',
  note_files: 'id, note_id, sort_order',
})

// v2: adds the offline mutation queue. Existing tables are untouched — Dexie
// only needs a version bump + re-declaration when the *schema* (indexed
// fields) changes, not for the deleted_at/_pendingFile/_previewUrl fields
// used elsewhere, since those are stored but never indexed.
db.version(2).stores({
  sections: 'id, sort_order',
  pages: 'id, section_id, sort_order',
  notes: 'id, page_id, date_created',
  note_files: 'id, note_id, sort_order',
  pending_mutations: '++localId, timestamp, collection, record_id',
})
