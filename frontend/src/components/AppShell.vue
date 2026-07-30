<template>
  <div class="shell">
    <!-- Mobile sidebar overlay -->
    <div
      v-if="sidebarOpen"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    />

    <ServerSidebar :class="{ 'sidebar-open': sidebarOpen }" @close="sidebarOpen = false" />

    <main class="main-panel">
      <header class="mobile-header">
        <button class="hamburger" aria-label="Open sidebar" @click="sidebarOpen = true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="5" width="18" height="2" rx="1" />
            <rect x="3" y="11" width="18" height="2" rx="1" />
            <rect x="3" y="17" width="18" height="2" rx="1" />
          </svg>
        </button>
        <span class="mobile-page-title">{{ activePage?.name ?? 'NoteCord' }}</span>
        <button class="mobile-search-btn" aria-label="Search" title="Search notes" @click="openSearch">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <button class="mobile-search-btn" aria-label="Pinned notes" title="Pinned notes" @click="openPinned">
          📌
        </button>
      </header>

      <RouterView />
    </main>

    <Transition name="search-slide">
      <SearchSidebar v-if="searchStore.active" />
      <PinnedPanel v-else-if="pinnedStore.active" />
      <ThreadPanel v-else-if="threadPanelStore.openThreadPageId" :page-id="threadPanelStore.openThreadPageId" />
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import ServerSidebar from '@/components/ServerSidebar.vue'
import SearchSidebar from '@/components/search/SearchSidebar.vue'
import PinnedPanel from '@/components/PinnedPanel.vue'
import ThreadPanel from '@/components/ThreadPanel.vue'
import { useNavStore } from '@/stores/navStore'
import { useSearchStore } from '@/stores/searchStore'
import { usePinnedStore } from '@/stores/pinnedStore'
import { useThreadPanelStore } from '@/stores/threadPanelStore'
import { useSharingStore } from '@/stores/sharingStore'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { storeToRefs } from 'pinia'

const navStore = useNavStore()
const searchStore = useSearchStore()
const pinnedStore = usePinnedStore()
const threadPanelStore = useThreadPanelStore()
const sharingStore = useSharingStore()
const { activePage } = storeToRefs(navStore)
const { isOnline } = useOnlineStatus()
const sidebarOpen = ref(false)
const router = useRouter()
const route = useRoute()

// Only one right-hand panel is shown at a time — each "open" closes the
// other two first (see the Transition's v-if/v-else-if chain above).
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

onMounted(async () => {
  // Sharing grants aren't part of the offline Dexie mirror (online-only,
  // see sharingStore.js) — load in parallel with nav rather than blocking
  // it, since a failure here shouldn't stop the app from opening.
  sharingStore.loadGrants().catch((e) => console.error('Failed to load sharing grants:', e))
  await navStore.loadNav()
  // After loading, auto-navigate to the first page if sitting on the home view
  if (route.name === 'home' && navStore.pages.length > 0) {
    router.replace(`/page/${navStore.pages[0].id}`)
  }
})
</script>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-tertiary);
}

/* Mobile header — hidden on desktop */
.mobile-header {
  display: none;
  align-items: center;
  gap: var(--sp-3);
  height: var(--header-h);
  padding: 0 var(--sp-4);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.hamburger {
  color: var(--text-secondary);
  padding: var(--sp-1);
  border-radius: var(--r-sm);
  transition: color var(--t-base), background var(--t-base);
}

.hamburger:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.mobile-page-title {
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  border-radius: var(--r-md);
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: color var(--t-base), background var(--t-base);
}

.mobile-search-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 10;
}

@media (max-width: 768px) {
  .mobile-header {
    display: flex;
  }

  .sidebar-overlay {
    display: block;
  }
}
</style>
