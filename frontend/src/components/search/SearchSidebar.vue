<template>
  <aside class="search-sidebar">
    <div class="sidebar-header">
      <span class="header-title">Search</span>
      <button class="header-btn" aria-label="Close search" title="Close search" @click="searchStore.closeSearch()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="filters">
      <div class="scope-toggle">
        <button
          class="scope-btn"
          :class="{ active: searchStore.scope === 'page' }"
          @click="searchStore.scope = 'page'"
        >
          This page
        </button>
        <button
          class="scope-btn"
          :class="{ active: searchStore.scope === 'all' }"
          @click="searchStore.scope = 'all'"
        >
          All pages
        </button>
      </div>

      <input
        v-model="searchStore.keyword"
        class="filter-input"
        type="text"
        placeholder="Keyword (emoji OK too)"
      />

      <input
        v-model="searchStore.attachmentKeyword"
        class="filter-input"
        type="text"
        placeholder="Attachment filename"
      />

      <div class="date-mode-toggle">
        <button
          v-for="mode in ['none', 'single', 'range']"
          :key="mode"
          class="date-mode-btn"
          :class="{ active: searchStore.dateMode === mode }"
          @click="searchStore.dateMode = mode"
        >
          {{ mode === 'none' ? 'Any date' : mode === 'single' ? 'On date' : 'Range' }}
        </button>
      </div>

      <input v-if="searchStore.dateMode === 'single'" v-model="searchStore.singleDate" class="filter-input" type="date" />

      <div v-if="searchStore.dateMode === 'range'" class="date-range-row">
        <input v-model="searchStore.rangeFrom" class="filter-input" type="date" />
        <span class="date-range-sep">to</span>
        <input v-model="searchStore.rangeTo" class="filter-input" type="date" />
      </div>

      <p v-if="searchStore.offlineRestricted" class="offline-banner">
        Offline — searching cached notes only (most recent ~200 per page).
      </p>
      <p v-if="searchStore.jumpError" class="jump-error-banner">{{ searchStore.jumpError }}</p>

      <div class="view-toggle">
        <button
          class="view-btn"
          :class="{ active: searchStore.viewMode === 'results' }"
          @click="searchStore.viewMode = 'results'"
        >
          Results
        </button>
        <button
          class="view-btn"
          :class="{ active: searchStore.viewMode === 'attachments' }"
          @click="searchStore.viewMode = 'attachments'"
        >
          Attachments
        </button>
      </div>
    </div>

    <div class="sidebar-scroll">
      <p v-if="searchStore.loading" class="state-msg">Searching…</p>

      <template v-else-if="searchStore.viewMode === 'results'">
        <p v-if="!searchStore.results.length" class="state-msg">No matching notes.</p>
        <SearchResultItem
          v-for="r in searchStore.results"
          :key="r.id"
          :result="r"
          :show-page="searchStore.scope === 'all'"
          @jump="handleJump"
        />
        <div v-if="searchStore.hasMore" class="load-more-wrap">
          <button
            class="load-more-btn"
            :disabled="searchStore.loadingMore"
            @click="searchStore.loadMoreResults(isOnline)"
          >
            {{ searchStore.loadingMore ? 'Loading…' : 'Load more results' }}
          </button>
        </div>
      </template>

      <SearchAttachmentsView v-else :results="searchStore.results" @jump="handleJump" />
    </div>
  </aside>
</template>

<script setup>
import { watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import debounce from 'lodash/debounce'
import { useSearchStore } from '@/stores/searchStore'
import { useNavStore } from '@/stores/navStore'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import SearchResultItem from './SearchResultItem.vue'
import SearchAttachmentsView from './SearchAttachmentsView.vue'

const searchStore = useSearchStore()
const navStore = useNavStore()
const router = useRouter()
const { isOnline } = useOnlineStatus()

function handleJump(result) {
  searchStore.jumpToResult(result, router, isOnline.value)
}

const debouncedSearch = debounce(() => searchStore.runSearch(isOnline.value), 350)

// Free-text inputs — debounced, avoid a query per keystroke.
watch(() => [searchStore.keyword, searchStore.attachmentKeyword], debouncedSearch)

// Discrete controls — search immediately, no debounce.
watch(
  () => [searchStore.scope, searchStore.dateMode, searchStore.singleDate, searchStore.rangeFrom, searchStore.rangeTo],
  () => {
    debouncedSearch.cancel()
    searchStore.runSearch(isOnline.value)
  }
)

// Keep "this page" scoped results tracking whichever page is actually open.
watch(() => navStore.activePageId, () => {
  if (searchStore.scope === 'page') {
    debouncedSearch.cancel()
    searchStore.runSearch(isOnline.value)
  }
})

onMounted(() => searchStore.runSearch(isOnline.value))
onUnmounted(() => debouncedSearch.cancel())
</script>

<style scoped>
.search-sidebar {
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

.filters {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.scope-toggle,
.date-mode-toggle,
.view-toggle {
  display: flex;
  gap: var(--sp-1);
  background: var(--bg-input);
  border-radius: var(--r-md);
  padding: 2px;
}

.scope-btn,
.date-mode-btn,
.view-btn {
  flex: 1;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-align: center;
  transition: background var(--t-base), color var(--t-base);
}

.scope-btn.active,
.date-mode-btn.active,
.view-btn.active {
  background: var(--bg-active);
  color: var(--text-primary);
}

.filter-input {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.filter-input:focus {
  outline: none;
  border-color: var(--accent);
}

.date-range-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.date-range-sep {
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.offline-banner,
.jump-error-banner {
  font-size: var(--text-xs);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--bg-input);
  color: var(--text-secondary);
}

.jump-error-banner {
  color: var(--accent-danger);
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-3) var(--sp-4);
}

.state-msg {
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--sp-4) 0;
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: var(--sp-3) 0;
}

.load-more-btn {
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-full);
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  transition: background var(--t-base), border-color var(--t-base), color var(--t-base);
}

.load-more-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (max-width: 768px) {
  .search-sidebar {
    position: fixed;
    inset: 0;
    z-index: 20;
    width: 100%;
  }
}
</style>
