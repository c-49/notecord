import { defineStore } from 'pinia'
import { ref } from 'vue'
import groupBy from 'lodash/groupBy'
import { createNote, createNoteFile, updateNote, deleteNote, uploadFile } from '@/services/api'
import { db } from '@/services/db'
import { readNotes } from '@/services/offlineData'
import { getDayKey } from '@/utils/dateUtils'

// Thrown by addNote when the note itself was created successfully but one or
// more of its attachments failed to upload — callers can catch this
// specifically to tell "partially sent" apart from "nothing was sent".
export class AttachmentUploadError extends Error {
  constructor(failedCount, totalCount) {
    super(`${failedCount} of ${totalCount} attachment(s) failed to upload`)
    this.name = 'AttachmentUploadError'
    this.failedCount = failedCount
    this.totalCount = totalCount
  }
}

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([])
  const loading = ref(false)
  const currentPageId = ref(null)

  async function loadNotes(pageId) {
    loading.value = true
    currentPageId.value = pageId
    notes.value = []
    try {
      // Reads from the local Dexie mirror only — navStore.loadNav() already
      // pulled the full dataset (including every page's notes) on app boot,
      // so this never needs the network itself, online or offline.
      notes.value = await readNotes(pageId)
    } finally {
      loading.value = false
    }
  }

  function notesByDay() {
    return groupBy(notes.value, (n) => getDayKey(n.date_created))
  }

  // attachments: array of { type: 'image'|'file'|'voice'|'embed', file?: File, url?: string }
  async function addNote(pageId, content, attachments = []) {
    const note = await createNote({ id: crypto.randomUUID(), page_id: pageId, content })
    await db.notes.put(note)
    note.files = []

    // Uploads are independent, so run them in parallel — but use allSettled
    // (not all) so one failure can't cancel/hide the others that succeed.
    const results = await Promise.allSettled(
      attachments.map(async (att, i) => {
        let fileId = null
        if (att.type !== 'embed' && att.file) {
          const uploaded = await uploadFile(att.file)
          fileId = uploaded.id
        }
        return createNoteFile({
          id: crypto.randomUUID(),
          note_id: note.id,
          file_id: fileId,
          attachment_type: att.type,
          embed_url: att.url ?? null,
          sort_order: i,
        })
      })
    )

    let failedCount = 0
    for (const result of results) {
      if (result.status === 'fulfilled') {
        note.files.push(result.value)
        await db.note_files.put(result.value)
      } else {
        failedCount++
        console.error('Attachment upload failed:', result.reason)
      }
    }

    notes.value.push(note)

    if (failedCount > 0) {
      throw new AttachmentUploadError(failedCount, attachments.length)
    }

    return note
  }

  async function editNote(id, content) {
    await updateNote(id, { content })
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) notes.value[idx].content = content
    await db.notes.update(id, { content })
  }

  async function removeNote(id) {
    await deleteNote(id)
    notes.value = notes.value.filter((n) => n.id !== id)
    await db.note_files.where('note_id').equals(id).delete()
    await db.notes.delete(id)
  }

  function clearNotes() {
    notes.value = []
    currentPageId.value = null
  }

  return {
    notes,
    loading,
    currentPageId,
    notesByDay,
    loadNotes,
    addNote,
    editNote,
    removeNote,
    clearNotes,
  }
})
