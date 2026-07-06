import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createSection, updateSection, deleteSection, createPage, updatePage, deletePage } from '@/services/api'
import { db } from '@/services/db'
import { syncAll, readNav } from '@/services/offlineData'

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
        try {
          await syncAll()
        } catch (e) {
          console.error('Nav sync failed, falling back to cached data:', e)
        }
      }
      ;[sections.value, pages.value] = await readNav()
    } finally {
      loading.value = false
    }
  }

  async function addSection(name, emoji = null) {
    const item = await createSection({ id: crypto.randomUUID(), name, emoji, sort_order: sections.value.length })
    sections.value.push(item)
    await db.sections.put(item)
    return item
  }

  async function renameSection(id, name, emoji) {
    await updateSection(id, { name, emoji })
    const idx = sections.value.findIndex((s) => s.id === id)
    if (idx !== -1) Object.assign(sections.value[idx], { name, emoji })
    await db.sections.update(id, { name, emoji })
  }

  async function removeSection(id) {
    await deleteSection(id)
    sections.value = sections.value.filter((s) => s.id !== id)
    // DB uses SET NULL on pages.section_id — mirror that in local state
    pages.value.forEach((p) => { if (p.section_id === id) p.section_id = null })
    await db.sections.delete(id)
    await db.pages.where('section_id').equals(id).modify({ section_id: null })
  }

  async function addPage(name, sectionId = null, emoji = null) {
    const item = await createPage({ id: crypto.randomUUID(), name, emoji, section_id: sectionId, sort_order: pages.value.length })
    pages.value.push(item)
    await db.pages.put(item)
    return item
  }

  async function renamePage(id, name, emoji) {
    await updatePage(id, { name, emoji })
    const idx = pages.value.findIndex((p) => p.id === id)
    if (idx !== -1) Object.assign(pages.value[idx], { name, emoji })
    await db.pages.update(id, { name, emoji })
  }

  async function removePage(id) {
    await deletePage(id)
    pages.value = pages.value.filter((p) => p.id !== id)
    if (activePageId.value === id) activePageId.value = null
    // DB uses CASCADE on notes.page_id (and note_files.note_id in turn) — mirror that locally
    const noteIds = (await db.notes.where('page_id').equals(id).primaryKeys())
    await db.note_files.where('note_id').anyOf(noteIds.length ? noteIds : ['']).delete()
    await db.notes.where('page_id').equals(id).delete()
    await db.pages.delete(id)
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
