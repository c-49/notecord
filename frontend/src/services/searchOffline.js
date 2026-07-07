import groupBy from 'lodash/groupBy'
import { db } from './db'

// Tiptap/ProseMirror content is always well-formed HTML from the editor's
// own schema, so a regex strip is safe here and avoids pulling in a DOM
// parser dependency just for keyword matching.
export function stripHtml(html) {
  return (html ?? '').replace(/<[^>]*>/g, ' ')
}

function matchesKeyword(note, keywordLower) {
  if (!keywordLower) return true
  return stripHtml(note.content).toLowerCase().includes(keywordLower)
}

// Epoch-millis comparison, not string comparison — note.date_created and
// the resolved dateFrom/dateTo bounds aren't guaranteed to share the exact
// same ISO string format, and only Date.parse() reliably orders them as
// instants.
function matchesDateRange(note, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  const created = Date.parse(note.date_created)
  if (dateFrom && created < Date.parse(dateFrom)) return false
  if (dateTo && created >= Date.parse(dateTo)) return false
  return true
}

// Offline search — restricted to whatever's cached locally (the ~200
// most-recent notes per page from offlineData.js's syncAll(), plus anything
// loadMore()/ensureNoteCached() has pulled in since). Same AND semantics as
// api.searchNotes for consistent behavior across a connectivity flip
// mid-session.
export async function searchNotesOffline({ pageId, keyword, attachmentKeyword, dateFrom, dateTo } = {}) {
  const base = pageId ? db.notes.where('page_id').equals(pageId) : db.notes.toCollection()
  const allNotes = (await base.toArray()).filter((n) => !n.deleted_at)

  const keywordLower = keyword?.trim().toLowerCase() ?? ''
  const attKeywordLower = attachmentKeyword?.trim().toLowerCase() ?? ''

  let candidates = allNotes.filter(
    (n) => matchesKeyword(n, keywordLower) && matchesDateRange(n, dateFrom, dateTo)
  )

  if (attKeywordLower) {
    const noteIds = candidates.map((n) => n.id)
    const fileRows = noteIds.length ? await db.note_files.where('note_id').anyOf(noteIds).toArray() : []
    const matchingNoteIds = new Set(
      fileRows
        .filter((f) => !f.deleted_at && f.file_id?.filename_download?.toLowerCase().includes(attKeywordLower))
        .map((f) => f.note_id)
    )
    candidates = candidates.filter((n) => matchingNoteIds.has(n.id))
  }

  candidates.sort((a, b) => Date.parse(b.date_created) - Date.parse(a.date_created))

  // Attach files, same shape NoteBlock/AttachmentRenderer already expect.
  const ids = candidates.map((n) => n.id)
  const fileRows = ids.length ? await db.note_files.where('note_id').anyOf(ids).toArray() : []
  const filesByNote = groupBy(fileRows.filter((f) => !f.deleted_at), 'note_id')
  return candidates.map((n) => ({
    ...n,
    files: (filesByNote[n.id] ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
  }))
}
