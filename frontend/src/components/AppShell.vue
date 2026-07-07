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
      </header>

      <RouterView />
    </main>

    <SearchSidebar v-if="searchStore.active" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterView, useRouter, useRoute } from 'vue-router'
import ServerSidebar from '@/components/ServerSidebar.vue'
import SearchSidebar from '@/components/search/SearchSidebar.vue'
import { useNavStore } from '@/stores/navStore'
import { useSearchStore } from '@/stores/searchStore'
import { storeToRefs } from 'pinia'

const navStore = useNavStore()
const searchStore = useSearchStore()
const { activePage } = storeToRefs(navStore)
const sidebarOpen = ref(false)
const router = useRouter()
const route = useRoute()

onMounted(async () => {
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
