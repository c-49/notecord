import { defineStore } from 'pinia'
import { ref } from 'vue'
import groupBy from 'lodash/groupBy'
import { getNotes, createNote, updateNote, deleteNote } from '@/services/api'
import { getDayKey } from '@/utils/dateUtils'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref([])
  const loading = ref(false)
  const currentPageId = ref(null)

  async function loadNotes(pageId) {
    if (currentPageId.value === pageId && notes.value.length) return
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

  async function addNote(pageId, content, attachmentType = 'none', attachmentFileId = null, embedUrl = null) {
    const item = await createNote({
      page_id: pageId,
      content,
      attachment_type: attachmentType,
      attachment_file: attachmentFileId,
      embed_url: embedUrl,
    })
    notes.value.push(item)
    return item
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
