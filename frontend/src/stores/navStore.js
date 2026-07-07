import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/services/db'
import { syncAll, readNav } from '@/services/offlineData'
import { queueMutation, requestDrain, drainQueue } from '@/services/mutationQueue'

export const useNavStore = defineStore('nav', () => {
  const sections = ref([])
  const pages = ref([])
  const activePageId = ref(null)
  const loading = ref(false)

  const rootPages = computed(() =>
    pages.value.filter((p) => p.section_id === null)
  )

  const pagesBySection = computed(() => {
    return sections.value.map((s) => ({
      ...s,
      pages: pages.value.filter((p) => p.section_id === s.id),
    }))
  })

  const activePage = computed(() =>
    pages.value.find((p) => p.id === activePageId.value) ?? null
  )

  async function loadNav() {
    loading.value = true
    try {
      if (navigator.onLine) {
        // Push local changes before pulling — a full pull's clear()+bulkPut()
        // would otherwise wipe a locally-created-but-not-yet-synced record.
        const emptied = await drainQueue()
        if (emptied) {
          try {
            await syncAll()
          } catch (e) {
            console.error('Nav sync failed, falling back to cached data:', e)
          }
        }
      }
      ;[sections.value, pages.value] = await readNav()
    } finally {
      loading.value = false
    }
  }

  async function addSection(name, emoji = null) {
    const item = { id: crypto.randomUUID(), name, emoji, sort_order: sections.value.length }
    sections.value.push(item)
    await db.sections.put(item)
    await queueMutation('create', 'sections', item.id, item)
    requestDrain()
    return item
  }

  async function renameSection(id, name, emoji) {
    const idx = sections.value.findIndex((s) => s.id === id)
    if (idx !== -1) Object.assign(sections.value[idx], { name, emoji })
    await db.sections.update(id, { name, emoji })
    await queueMutation('update', 'sections', id, { name, emoji })
    requestDrain()
  }

  async function removeSection(id) {
    sections.value = sections.value.filter((s) => s.id !== id)
    // DB uses SET NULL on pages.section_id — mirror that in local state
    pages.value.forEach((p) => { if (p.section_id === id) p.section_id = null })
    const deletedAt = new Date().toISOString()
    await db.sections.update(id, { deleted_at: deletedAt })
    await db.pages.where('section_id').equals(id).modify({ section_id: null })
    await queueMutation('delete', 'sections', id, null)
    requestDrain()
  }

  async function addPage(name, sectionId = null, emoji = null) {
    const item = { id: crypto.randomUUID(), name, emoji, section_id: sectionId, sort_order: pages.value.length }
    pages.value.push(item)
    await db.pages.put(item)
    await queueMutation('create', 'pages', item.id, item)
    requestDrain()
    return item
  }

  async function renamePage(id, name, emoji) {
    const idx = pages.value.findIndex((p) => p.id === id)
    if (idx !== -1) Object.assign(pages.value[idx], { name, emoji })
    await db.pages.update(id, { name, emoji })
    await queueMutation('update', 'pages', id, { name, emoji })
    requestDrain()
  }

  async function removePage(id) {
    pages.value = pages.value.filter((p) => p.id !== id)
    if (activePageId.value === id) activePageId.value = null
    // DB uses CASCADE on notes.page_id (and note_files.note_id in turn) —
    // mirror that locally as tombstones, not hard deletes, and without
    // queuing separate mutations for the cascaded children — the server's
    // own ON DELETE CASCADE handles them once the page's delete syncs.
    const deletedAt = new Date().toISOString()
    const noteIds = await db.notes.where('page_id').equals(id).primaryKeys()
    if (noteIds.length) {
      await db.note_files.where('note_id').anyOf(noteIds).modify({ deleted_at: deletedAt })
      await db.notes.where('page_id').equals(id).modify({ deleted_at: deletedAt })
    }
    await db.pages.update(id, { deleted_at: deletedAt })
    await queueMutation('delete', 'pages', id, null)
    requestDrain()
  }

  function setActivePage(id) {
    activePageId.value = id
  }

  return {
    sections,
    pages,
    activePageId,
    loading,
    rootPages,
    pagesBySection,
    activePage,
    loadNav,
    addSection,
    renameSection,
    removeSection,
    addPage,
    renamePage,
    removePage,
    setActivePage,
  }
})
