<template>
  <div class="page-view">
    <header class="page-header">
      <span class="page-icon">{{ page?.emoji ?? '#' }}</span>
      <h1 class="page-title">{{ page?.name ?? 'Select a page' }}</h1>
      <button class="search-btn" aria-label="Search" title="Search notes" @click="searchStore.openSearch()">
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
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useNavStore } from '@/stores/navStore'
import { useSearchStore } from '@/stores/searchStore'
import { storeToRefs } from 'pinia'
import NoteFeed from '@/components/NoteFeed.vue'
import NoteComposer from '@/components/composer/NoteComposer.vue'

const route = useRoute()
const navStore = useNavStore()
const searchStore = useSearchStore()
const { pages } = storeToRefs(navStore)

const pageId = computed(() => route.params.pageId)
const page = computed(() => pages.value.find((p) => String(p.id) === String(pageId.value)) ?? null)

watch(pageId, (id) => {
  if (id) navStore.setActivePage(id)
}, { immediate: true })
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

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  border-radius: var(--r-md);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.search-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
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
