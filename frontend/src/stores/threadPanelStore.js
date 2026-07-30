import { defineStore } from 'pinia'
import { ref } from 'vue'

// Tracks which thread page (if any) is open in the right-hand ThreadPanel —
// null means closed. A single ref rather than a boolean+id pair since a
// thread panel is always "for a specific page" the moment it's open.
export const useThreadPanelStore = defineStore('threadPanel', () => {
  const openThreadPageId = ref(null)

  // Mutually exclusive with search/pinned — only one right-hand panel shown
  // at a time (see AppShell.vue). Callers import search/pinned stores
  // themselves to close this one rather than the reverse, to avoid a
  // circular store dependency (pinnedStore already imports this one).
  function open(pageId) {
    openThreadPageId.value = pageId
  }

  function close() {
    openThreadPageId.value = null
  }

  return { openThreadPageId, open, close }
})
