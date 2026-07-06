import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSections, getPages, createSection, updateSection, deleteSection, createPage, updatePage, deletePage } from '@/services/api'

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
      ;[sections.value, pages.value] = await Promise.all([getSections(), getPages()])
    } finally {
      loading.value = false
    }
  }

  async function addSection(name, emoji = null) {
    const item = await createSection({ id: crypto.randomUUID(), name, emoji, sort_order: sections.value.length })
    sections.value.push(item)
    return item
  }

  async function renameSection(id, name, emoji) {
    await updateSection(id, { name, emoji })
    const idx = sections.value.findIndex((s) => s.id === id)
    if (idx !== -1) Object.assign(sections.value[idx], { name, emoji })
  }

  async function removeSection(id) {
    await deleteSection(id)
    sections.value = sections.value.filter((s) => s.id !== id)
    // DB uses SET NULL on pages.section_id — mirror that in local state
    pages.value.forEach((p) => { if (p.section_id === id) p.section_id = null })
  }

  async function addPage(name, sectionId = null, emoji = null) {
    const item = await createPage({ id: crypto.randomUUID(), name, emoji, section_id: sectionId, sort_order: pages.value.length })
    pages.value.push(item)
    return item
  }

  async function renamePage(id, name, emoji) {
    await updatePage(id, { name, emoji })
    const idx = pages.value.findIndex((p) => p.id === id)
    if (idx !== -1) Object.assign(pages.value[idx], { name, emoji })
  }

  async function removePage(id) {
    await deletePage(id)
    pages.value = pages.value.filter((p) => p.id !== id)
    if (activePageId.value === id) activePageId.value = null
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
