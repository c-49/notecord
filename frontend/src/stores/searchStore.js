import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import { useNavStore } from './navStore'
import { useNotesStore } from './notesStore'
import { searchNotes as searchNotesApi } from '@/services/api'
import { searchNotesOffline } from '@/services/searchOffline'
import { dayBoundsToIso } from '@/utils/dateUtils'

const RESULTS_PAGE_SIZE = 30

export const useSearchStore = defineStore('search', () => {
  const navStore = useNavStore()
  const notesStore = useNotesStore()

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
  const jumpTargetNoteId = ref(null)
  const jumpError = ref('')
  // Read by NoteFeed.vue to suppress its normal scroll-to-bottom while a
  // cross-page jump is navigating it — the jump watcher does its own scroll.
  const suppressAutoScroll = ref(false)

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
    jumpError.value = ''
  }

  // End-to-end "jump to this result": ensure the note is cached (online
  // gap-fill if needed), pre-load + widen the target page's window BEFORE
  // navigating (so the route-triggered remount's own loadNotes() call is a
  // guarded no-op, see notesStore.loadNotes), then navigate and let
  // NoteFeed.vue's jumpTargetNoteId watcher do the actual scroll.
  async function jumpToResult(result, router, isOnline) {
    jumpError.value = ''
    const cacheRes = await notesStore.ensureNoteCached(result.page_id, result.id, result.date_created, isOnline)
    if (!cacheRes.found) {
      jumpError.value = cacheRes.reason === 'offline-uncached'
        ? "This note is older than what's cached offline — go online to jump to it."
        : "Couldn't locate that note."
      return
    }
    const alreadyOnPage = navStore.activePageId === result.page_id
    if (!alreadyOnPage) {
      suppressAutoScroll.value = true
      await notesStore.loadNotes(result.page_id)
    }
    notesStore.widenToInclude(result.id)
    if (!alreadyOnPage) {
      await router.push({ name: 'page', params: { pageId: result.page_id } })
      await nextTick()
    }
    jumpTargetNoteId.value = result.id
    if (!alreadyOnPage) suppressAutoScroll.value = false
  }

  function clearJumpTarget() {
    jumpTargetNoteId.value = null
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
    jumpTargetNoteId,
    jumpError,
    suppressAutoScroll,
    runSearch,
    loadMoreResults,
    openSearch,
    closeSearch,
    jumpToResult,
    clearJumpTarget,
  }
})
