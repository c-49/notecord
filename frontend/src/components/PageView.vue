<template>
  <div class="page-view">
    <header class="page-header">
      <span class="page-icon">{{ page?.emoji ?? '#' }}</span>
      <h1 class="page-title">{{ page?.name ?? 'Select a page' }}</h1>
      <button class="header-icon-btn" aria-label="Pinned notes" title="Pinned notes" @click="openPinned">📌</button>
      <button class="header-icon-btn" aria-label="Search" title="Search notes" @click="openSearch">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>
    </header>

    <NoteFeed v-if="page" :page-id="pageId" />

    <div v-else class="empty-state">
      <p>Select a page from the sidebar to start taking notes.</p>
    </div>

    <NoteComposer v-if="page" :page-id="pageId" />
  </div>
</template>

<script setup>
import { computed, watch, provide } from 'vue'
import { useRoute } from 'vue-router'
import { useNavStore } from '@/stores/navStore'
import { useSearchStore } from '@/stores/searchStore'
import { usePinnedStore } from '@/stores/pinnedStore'
import { useThreadPanelStore } from '@/stores/threadPanelStore'
import { useNotesStore, notesStoreKey } from '@/stores/notesStore'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { storeToRefs } from 'pinia'
import NoteFeed from '@/components/NoteFeed.vue'
import NoteComposer from '@/components/composer/NoteComposer.vue'

const route = useRoute()
const navStore = useNavStore()
const searchStore = useSearchStore()
const pinnedStore = usePinnedStore()
const threadPanelStore = useThreadPanelStore()
const { isOnline } = useOnlineStatus()
// The default (unparameterized) notesStore instance — explicit here so
// NoteFeed/NoteComposer/NoteBlock/NoteReactions below (and ThreadPanel.vue,
// mounted as a sibling further out) unambiguously share this one, never a
// thread panel's separate instance.
provide(notesStoreKey, useNotesStore())
const { pages } = storeToRefs(navStore)

const pageId = computed(() => route.params.pageId)
const page = computed(() => pages.value.find((p) => String(p.id) === String(pageId.value)) ?? null)

watch(pageId, (id) => {
  if (id) navStore.setActivePage(id)
}, { immediate: true })

// Only one right-hand panel is shown at a time — see AppShell.vue's
// Transition v-if/v-else-if chain.
function openSearch() {
  pinnedStore.closePanel()
  threadPanelStore.close()
  searchStore.openSearch()
}

function openPinned() {
  searchStore.closeSearch()
  threadPanelStore.close()
  pinnedStore.openPanel(isOnline.value)
}
</script>

<style scoped>
.page-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--header-h);
  padding: 0 var(--sp-4);
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.page-icon {
  font-size: var(--text-lg);
}

.page-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-primary);
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: var(--text-base);
  border-radius: var(--r-md);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.header-icon-btn:first-of-type {
  margin-left: auto;
}

.header-icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

@media (max-width: 768px) {
  .page-header {
    display: none;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
