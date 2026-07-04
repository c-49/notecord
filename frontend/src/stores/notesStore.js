import { defineStore } from 'pinia'
import { ref } from 'vue'
import groupBy from 'lodash/groupBy'
import { getNotes, createNote, createNoteFile, updateNote, deleteNote, uploadFile } from '@/services/api'
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
      notes.value = await getNotes(pageId)
    } finally {
      loading.value = false
    }
  }

  function notesByDay() {
    return groupBy(notes.value, (n) => getDayKey(n.date_created))
  }

  // attachments: array of { type: 'image'|'file'|'voice'|'embed', file?: File, url?: string }
  async function addNote(pageId, content, attachments = []) {
    const note = await createNote({ page_id: pageId, content })
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
  }

  async function removeNote(id) {
    await deleteNote(id)
    notes.value = notes.value.filter((n) => n.id !== id)
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
