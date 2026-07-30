import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useNavStore } from './navStore'
import { useJumpStore } from './jumpStore'
import { searchNotes as searchNotesApi } from '@/services/api'
import { searchNotesOffline } from '@/services/searchOffline'
import { dayBoundsToIso } from '@/utils/dateUtils'

const RESULTS_PAGE_SIZE = 30

export const useSearchStore = defineStore('search', () => {
  const navStore = useNavStore()
  const jumpStore = useJumpStore()

  // ── Filters ──
  const keyword = ref('')
  const attachmentKeyword = ref('')
  const dateMode = ref('none') // 'none' | 'single' | 'range'
  const singleDate = ref('') // <input type=date> value
  const rangeFrom = ref('')
  const rangeTo = ref('')
  const scope = ref('page') // 'page' | 'all'

  // ── Session/UI state ──
  const active = ref(false) // gates the right sidebar's rendering
  const viewMode = ref('results') // 'results' | 'attachments'
  const loading = ref(false)
  const loadingMore = ref(false)
  const results = ref([])
  const offset = ref(0)
  const hasMore = ref(false)
  const offlineRestricted = ref(false)

  function buildDateBounds() {
    if (dateMode.value === 'single' && singleDate.value) {
      const { startIso, endIso } = dayBoundsToIso(singleDate.value)
      return { dateFrom: startIso, dateTo: endIso }
    }
    if (dateMode.value === 'range' && (rangeFrom.value || rangeTo.value)) {
      return {
        dateFrom: rangeFrom.value ? dayBoundsToIso(rangeFrom.value).startIso : undefined,
        dateTo: rangeTo.value ? dayBoundsToIso(rangeTo.value).endIso : undefined,
      }
    }
    return {}
  }

  function resetResults() {
    results.value = []
    offset.value = 0
    hasMore.value = false
  }

  // isOnline is supplied by the calling component — useOnlineStatus() relies
  // on onMounted/onUnmounted and only works inside a component's own setup,
  // never inside a Pinia store.
  async function runSearch(isOnline, { append = false } = {}) {
    if (!append) resetResults()
    loading.value = !append
    loadingMore.value = append
    offlineRestricted.value = !isOnline
    try {
      const { dateFrom, dateTo } = buildDateBounds()
      const pageId = scope.value === 'page' ? navStore.activePageId : undefined
      if (isOnline) {
        const rows = await searchNotesApi({
          pageId,
          keyword: keyword.value.trim() || undefined,
          attachmentKeyword: attachmentKeyword.value.trim() || undefined,
          dateFrom,
          dateTo,
          limit: RESULTS_PAGE_SIZE,
          offset: offset.value,
        })
        results.value = append ? [...results.value, ...rows] : rows
        hasMore.value = rows.length === RESULTS_PAGE_SIZE
        offset.value += rows.length
      } else {
        const rows = await searchNotesOffline({
          pageId,
          keyword: keyword.value.trim(),
          attachmentKeyword: attachmentKeyword.value.trim(),
          dateFrom,
          dateTo,
        })
        results.value = rows // no server pagination offline — cache is already bounded
        hasMore.value = false
      }
    } finally {
      loading.value = false
      loadingMore.value = false
    }
  }

  async function loadMoreResults(isOnline) {
    if (!hasMore.value || loadingMore.value) return
    await runSearch(isOnline, { append: true })
  }

  function openSearch() {
    active.value = true
  }

  function closeSearch() {
    active.value = false
    resetResults()
    keyword.value = ''
    attachmentKeyword.value = ''
    dateMode.value = 'none'
    singleDate.value = ''
    rangeFrom.value = ''
    rangeTo.value = ''
    jumpStore.jumpError = ''
  }

  // Thin wrapper over the shared jump mechanic (see jumpStore.js) — kept
  // here so SearchResultItem/SearchAttachmentsView's existing `@jump`
  // handlers don't need to know about jumpStore directly.
  async function jumpToResult(result, router, isOnline) {
    await jumpStore.jumpToNote({ pageId: result.page_id, noteId: result.id, dateCreated: result.date_created }, router, isOnline)
  }

  return {
    keyword,
    attachmentKeyword,
    dateMode,
    singleDate,
    rangeFrom,
    rangeTo,
    scope,
    active,
    viewMode,
    loading,
    loadingMore,
    results,
    hasMore,
    offlineRestricted,
    runSearch,
    loadMoreResults,
    openSearch,
    closeSearch,
    jumpToResult,
  }
})
