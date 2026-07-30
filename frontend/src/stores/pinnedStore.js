import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useNavStore } from './navStore'
import { getPagePins } from '@/services/api'
import { db } from '@/services/db'

// Right-hand "Pinned" panel — lists every pinned note on the current page,
// newest-first. Online-only full list (same "full search is online-only"
// pattern search already established, see searchStore.js) — a page's pins
// can reference notes far outside the ~200-note Dexie cache window, so this
// always hits the server directly rather than trying to derive it from the
// local mirror. Offline, falls back to whatever pinned notes are already
// cached (their note_id happens to be in the local notes mirror).
export const usePinnedStore = defineStore('pinned', () => {
  const navStore = useNavStore()

  const active = ref(false)
  const loading = ref(false)
  const pins = ref([])

  async function loadPins(isOnline) {
    const pageId = navStore.activePageId
    if (!pageId) {
      pins.value = []
      return
    }
    loading.value = true
    try {
      if (isOnline) {
        pins.value = await getPagePins(pageId)
      } else {
        // Same "this page AND its threads" scope as the online query above
        // (see api.js's getPagePins) — thread page ids come from
        // navStore.pagesByParent, already fully loaded client-side.
        const threadIds = (navStore.pagesByParent[pageId] ?? []).map((p) => p.id)
        const pageIds = [pageId, ...threadIds]
        const noteRows = (await db.notes.where('page_id').anyOf(pageIds).toArray()).filter((n) => !n.deleted_at)
        const noteIds = noteRows.map((n) => n.id)
        const pinRows = noteIds.length
          ? (await db.note_pins.where('note_id').anyOf(noteIds).toArray()).filter((p) => !p.deleted_at)
          : []
        const notesById = Object.fromEntries(noteRows.map((n) => [n.id, n]))
        pins.value = pinRows
          .map((p) => ({ ...p, note_id: notesById[p.note_id] }))
          .filter((p) => p.note_id)
          .sort((a, b) => (b.pinned_at ?? '').localeCompare(a.pinned_at ?? ''))
      }
    } finally {
      loading.value = false
    }
  }

  // Mutual exclusion with search/thread (only one right-hand panel shown at
  // a time, see AppShell.vue) is handled by the caller — see PageView.vue's
  // openPinnedPanel(), which also closes the other two before calling this.
  function openPanel(isOnline) {
    active.value = true
    loadPins(isOnline)
  }

  function closePanel() {
    active.value = false
    pins.value = []
  }

  return { active, loading, pins, loadPins, openPanel, closePanel }
})
