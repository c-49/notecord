<template>
  <aside class="pinned-panel">
    <div class="sidebar-header">
      <span class="header-title">📌 Pinned</span>
      <button class="header-btn" aria-label="Close pinned panel" title="Close" @click="pinnedStore.closePanel()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <p v-if="!isOnline" class="offline-banner">Offline — showing only pins on already-cached notes.</p>

    <div class="sidebar-scroll">
      <p v-if="pinnedStore.loading" class="state-msg">Loading…</p>
      <p v-else-if="!pinnedStore.pins.length" class="state-msg">No pinned notes on this page yet.</p>
      <button
        v-for="pin in pinnedStore.pins"
        :key="pin.id"
        class="pin-item"
        @click="handleJump(pin)"
      >
        <span v-if="threadLabel(pin)" class="pin-thread-label">🧵 {{ threadLabel(pin) }}</span>
        <span class="pin-snippet">{{ snippet(pin.note_id?.content) }}</span>
        <span class="pin-timestamp">{{ formatNoteTimestamp(pin.pinned_at) }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePinnedStore } from '@/stores/pinnedStore'
import { useJumpStore } from '@/stores/jumpStore'
import { useNavStore } from '@/stores/navStore'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { formatNoteTimestamp } from '@/utils/dateUtils'

const pinnedStore = usePinnedStore()
const jumpStore = useJumpStore()
const navStore = useNavStore()
const router = useRouter()
const { isOnline } = useOnlineStatus()

// Strips HTML for a plain-text preview snippet, same approach as
// searchOffline.js's stripHtml (note.content is Tiptap-generated HTML).
function snippet(html) {
  const text = (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return '(no text)'
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

// A pin whose note lives in one of this page's threads (see
// pinnedStore.js/api.js's getPagePins — this panel aggregates both) is
// labeled with which thread, resolved client-side since navStore.pages
// already holds every page (including threads) for the account.
function threadLabel(pin) {
  const notePageId = pin.note_id?.page_id
  if (!notePageId) return null
  const notePage = navStore.pages.find((p) => p.id === notePageId)
  if (!notePage?.parent_page_id) return null
  return notePage.name
}

async function handleJump(pin) {
  const note = pin.note_id
  if (!note) return
  pinnedStore.closePanel()
  await jumpStore.jumpToNote({ pageId: note.page_id, noteId: note.id, dateCreated: note.date_created }, router, isOnline.value)
}

// Keep the list in sync with whichever page is actually open.
watch(() => navStore.activePageId, () => {
  if (pinnedStore.active) pinnedStore.loadPins(isOnline.value)
})

onMounted(() => {
  if (pinnedStore.active) pinnedStore.loadPins(isOnline.value)
})
</script>

<style scoped>
.pinned-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-h);
  padding: 0 var(--sp-3) 0 var(--sp-4);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.header-title {
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--text-primary);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-md);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.header-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.offline-banner {
  font-size: var(--text-xs);
  padding: var(--sp-2) var(--sp-4);
  background: var(--bg-input);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-3) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.state-msg {
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--sp-4) 0;
}

.pin-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--bg-input);
  border: 1px solid var(--border);
  text-align: left;
  transition: background var(--t-base), border-color var(--t-base);
}

.pin-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.pin-thread-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-link);
}

.pin-snippet {
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.pin-timestamp {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .pinned-panel {
    position: fixed;
    inset: 0;
    z-index: 20;
    width: 100%;
  }
}
</style>
