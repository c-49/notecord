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

// v3: adds note_reactions (same shape as note_files — indexed by note_id).
db.version(3).stores({
  sections: 'id, sort_order',
  pages: 'id, section_id, sort_order',
  notes: 'id, page_id, date_created',
  note_files: 'id, note_id, sort_order',
  pending_mutations: '++localId, timestamp, collection, record_id',
  note_reactions: 'id, note_id',
})

// v4: adds note_pins (same shape as note_files/note_reactions — indexed by
// note_id). pages/parent_page_id and origin_note_id don't need a new index
// — thread lookups (pagesByParent/threadsByOriginNote in navStore.js) scan
// the already-fully-loaded in-memory pages array, same as rootPages/
// pagesBySection already do, not a Dexie query.
db.version(4).stores({
  sections: 'id, sort_order',
  pages: 'id, section_id, sort_order',
  notes: 'id, page_id, date_created',
  note_files: 'id, note_id, sort_order',
  pending_mutations: '++localId, timestamp, collection, record_id',
  note_reactions: 'id, note_id',
  note_pins: 'id, note_id',
})
