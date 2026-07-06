import Dexie from 'dexie'

export const db = new Dexie('notecord')

db.version(1).stores({
  sections: 'id, sort_order',
  pages: 'id, section_id, sort_order',
  notes: 'id, page_id, date_created',
  note_files: 'id, note_id, sort_order',
})
