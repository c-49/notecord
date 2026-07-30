import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db } from '@/services/db'
import { syncAll, readNav, getThreadNoteCounts } from '@/services/offlineData'
import { queueMutation, requestDrain, drainQueue } from '@/services/mutationQueue'
import { useAuthStore } from '@/stores/authStore'

export const useNavStore = defineStore('nav', () => {
  const authStore = useAuthStore()
  const sections = ref([])
  const pages = ref([])
  const activePageId = ref(null)
  const loading = ref(false)
  // Actual reply counts per thread page (pageId -> count), kept in sync by
  // notesStore.js's addNote/removeNote/applyRemoteCreate/applyRemoteDelete
  // whenever they touch a thread page — NOT derived from pagesByParent's
  // thread-page COUNT, which is always 0 or 1 regardless of how many (or
  // how few) notes are actually inside. Populated in bulk on loadNav()
  // below for pages this client already knows about; kept current after
  // that by the per-mutation updates.
  const threadNoteCounts = ref({})

  // Thread pages have section_id: null too (they have no section of their
  // own — see the thread prompt's schema section), so root-level pages must
  // also explicitly exclude anything with a parent_page_id or it'd double
  // up in the sidebar (once here, once nested under its parent below).
  const rootPages = computed(() =>
    pages.value.filter((p) => p.section_id === null && !p.parent_page_id)
  )

  const pagesBySection = computed(() => {
    return sections.value.map((s) => ({
      ...s,
      pages: pages.value.filter((p) => p.section_id === s.id),
    }))
  })

  // Thread pages, grouped by parent_page_id — every page in `pages` is
  // already loaded in full for the account (see loadNav/syncAll), so this
  // is a plain in-memory filter, same as rootPages/pagesBySection above, not
  // a separate Dexie query. Sorted by sort_order (assigned monotonically at
  // creation, same as every other page list here) as a stand-in for
  // creation order — pages have no date_created field of their own.
  const pagesByParent = computed(() => {
    const map = {}
    for (const p of pages.value) {
      if (!p.parent_page_id) continue
      ;(map[p.parent_page_id] ??= []).push(p)
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.sort_order - b.sort_order)
    return map
  })

  // Thread pages, grouped by origin_note_id — powers the "🧵 N replies"
  // affordance under a note (see NoteBlock.vue).
  const threadsByOriginNote = computed(() => {
    const map = {}
    for (const p of pages.value) {
      if (!p.origin_note_id) continue
      ;(map[p.origin_note_id] ??= []).push(p)
    }
    return map
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
      const threadIds = pages.value.filter((p) => p.parent_page_id).map((p) => p.id)
      threadNoteCounts.value = await getThreadNoteCounts(threadIds)
    } finally {
      loading.value = false
    }
  }

  // Called by notesStore.js whenever a mutation (local or realtime) changes
  // how many notes a thread page actually has.
  function setThreadNoteCount(pageId, count) {
    threadNoteCounts.value = { ...threadNoteCounts.value, [pageId]: count }
  }

  async function addSection(name, emoji = null) {
    // owner_id is stamped server-side via a preset on create (see
    // setup-schema.js) — it's never actually sent in the create request,
    // but the locally-pushed reactive item needs it set immediately so
    // owner-only UI (Share/rename/delete/add-page) doesn't flicker off
    // until the next resync pulls the real value back down.
    const item = {
      id: crypto.randomUUID(), name, emoji, sort_order: sections.value.length,
      owner_id: authStore.user?.id ?? null,
    }
    sections.value.push(item)
    await db.sections.put(item)
    const { owner_id, ...payload } = item
    await queueMutation('create', 'sections', item.id, payload)
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
    // See addSection() above — owner_id is preset server-side and never
    // sent, but is needed locally right away for owner-only UI.
    // parent_page_id/origin_note_id are ALWAYS sent explicitly as null (not
    // omitted) — the pages:create guard flow's thread-vs-normal branch
    // reads $trigger.payload.parent_page_id directly, and Directus throws a
    // validation error if that key is missing from the payload entirely
    // rather than gracefully treating it as null (confirmed empirically
    // while building that flow — see setup-schema.js).
    const item = {
      id: crypto.randomUUID(), name, emoji, section_id: sectionId, sort_order: pages.value.length,
      parent_page_id: null, origin_note_id: null,
      owner_id: authStore.user?.id ?? null,
    }
    pages.value.push(item)
    await db.pages.put(item)
    const { owner_id, ...payload } = item
    await queueMutation('create', 'pages', item.id, payload)
    requestDrain()
    return item
  }

  // Threads: a real pages row, one level deep only (client-side enforced —
  // see the "Create Thread" menu item's v-if in NoteContextMenu.vue — and
  // also enforced server-side in the thread-create guard flow). Always
  // section_id: null (a thread has no section of its own; access is
  // inherited from parent_page_id instead — see setup-schema.js's pages:read
  // permission). originNoteId is required, not optional, unlike addPage's
  // parent_page_id/origin_note_id (which are always null there) — a thread
  // with no valid origin note is rejected server-side (see check_thread's
  // "A thread page requires a valid origin_note_id..." guard).
  async function addThread(parentPageId, originNoteId, name = 'Thread', emoji = '🧵') {
    const item = {
      id: crypto.randomUUID(), name, emoji, section_id: null, sort_order: pages.value.length,
      parent_page_id: parentPageId, origin_note_id: originNoteId,
      owner_id: authStore.user?.id ?? null,
    }
    pages.value.push(item)
    await db.pages.put(item)
    const { owner_id, ...payload } = item
    await queueMutation('create', 'pages', item.id, payload)
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
    // DB CASCADEs pages.parent_page_id too (deleting a page takes its own
    // thread pages with it — see setup-schema.js) — mirror that locally,
    // one level deep only (threads can't have their own threads), before
    // tombstoning the page itself and its direct notes below.
    const threadIds = pages.value.filter((p) => p.parent_page_id === id).map((p) => p.id)
    const allIds = [id, ...threadIds]
    pages.value = pages.value.filter((p) => !allIds.includes(p.id))
    if (allIds.includes(activePageId.value)) activePageId.value = null

    // DB uses CASCADE on notes.page_id (and note_files.note_id in turn) —
    // mirror that locally as tombstones, not hard deletes, and without
    // queuing separate mutations for the cascaded children — the server's
    // own ON DELETE CASCADE handles them once the page's delete syncs.
    const deletedAt = new Date().toISOString()
    const noteIds = await db.notes.where('page_id').anyOf(allIds).primaryKeys()
    if (noteIds.length) {
      await db.note_files.where('note_id').anyOf(noteIds).modify({ deleted_at: deletedAt })
      await db.note_reactions.where('note_id').anyOf(noteIds).modify({ deleted_at: deletedAt })
      await db.note_pins.where('note_id').anyOf(noteIds).modify({ deleted_at: deletedAt })
      await db.notes.where('page_id').anyOf(allIds).modify({ deleted_at: deletedAt })
    }
    await db.pages.where('id').anyOf(allIds).modify({ deleted_at: deletedAt })
    // Only the page the user actually asked to delete gets a queued
    // mutation — its thread(s) are handled server-side by the FK CASCADE
    // once this delete syncs, exactly like a page's own notes already are.
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
    threadNoteCounts,
    rootPages,
    pagesBySection,
    pagesByParent,
    threadsByOriginNote,
    activePage,
    loadNav,
    setThreadNoteCount,
    addSection,
    renameSection,
    removeSection,
    addPage,
    addThread,
    renamePage,
    removePage,
    setActivePage,
  }
})
