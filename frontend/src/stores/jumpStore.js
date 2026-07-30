import { defineStore } from 'pinia'
import { ref, nextTick } from 'vue'
import { useNavStore } from './navStore'
import { useNotesStore } from './notesStore'
import { useThreadPanelStore } from './threadPanelStore'

// Shared "jump to this note in the feed" mechanic — originally built for
// search's cross-page jump-to-result, now also used by PinnedPanel.vue.
// Lives in its own store (not inside searchStore) so NoteFeed.vue's watcher
// isn't semantically tied to search — pins have nothing to do with search,
// but need the exact same scroll-to + highlight behavior, not a second copy.
export const useJumpStore = defineStore('jump', () => {
  const navStore = useNavStore()
  const notesStore = useNotesStore()
  // The SAME 'thread' instance ThreadPanel.vue provides — a note living
  // inside a thread page is tracked by that instance's allNotes, never the
  // main one (see notesStore.js's notesStoreKey comment), so jumping to one
  // has to load/widen it there instead. Search results can point at a
  // thread's note too (search covers the whole 'notes' table, threads
  // included), so this isn't pins-only.
  const threadNotesStore = useNotesStore('thread')

  const jumpTargetNoteId = ref(null)
  const jumpError = ref('')
  // Read by NoteFeed.vue to suppress its normal scroll-to-bottom while a
  // cross-page jump is navigating it — jumpToNote's own watcher does the scroll.
  const suppressAutoScroll = ref(false)

  // End-to-end "jump to this note": ensure it's cached (online gap-fill if
  // needed), pre-load + widen the target page's window BEFORE navigating
  // (so the route-triggered remount's own loadNotes() call is a guarded
  // no-op, see notesStore.loadNotes), then navigate — opening the thread
  // panel first if the note lives in one — and let NoteFeed.vue's
  // jumpTargetNoteId watcher do the actual scroll.
  async function jumpToNote({ pageId, noteId, dateCreated }, router, isOnline) {
    jumpError.value = ''
    // pageId may be a thread page's own id (a thread is a normal `pages` row
    // — see navStore.pages, which holds threads too) — route navigation
    // always targets the PARENT page (threads render inside ThreadPanel,
    // never as their own standalone route), with the thread panel opened
    // on top of it.
    const targetPage = navStore.pages.find((p) => p.id === pageId)
    const isThread = !!targetPage?.parent_page_id
    const targetNotesStore = isThread ? threadNotesStore : notesStore
    const routePageId = isThread ? targetPage.parent_page_id : pageId

    const cacheRes = await targetNotesStore.ensureNoteCached(pageId, noteId, dateCreated, isOnline)
    if (!cacheRes.found) {
      jumpError.value = cacheRes.reason === 'offline-uncached'
        ? "This note is older than what's cached offline — go online to jump to it."
        : "Couldn't locate that note."
      return
    }

    const alreadyOnRoute = navStore.activePageId === routePageId
    if (!alreadyOnRoute) suppressAutoScroll.value = true
    // loadNotes() is a guarded no-op if this exact page is already loaded
    // (see notesStore.js), so calling it unconditionally here is safe and
    // covers every case: a normal cross-page jump (mirrors the pre-thread
    // behavior), a same-page jump (no-op), and the thread case (ThreadPanel
    // only loads whatever pageId it's given — this ensures it's loaded
    // before threadPanelStore.open() below even mounts it).
    await targetNotesStore.loadNotes(pageId)
    targetNotesStore.widenToInclude(noteId)

    if (!alreadyOnRoute) {
      await router.push({ name: 'page', params: { pageId: routePageId } })
      await nextTick()
    }
    if (isThread) {
      useThreadPanelStore().open(pageId)
      await nextTick()
    }
    jumpTargetNoteId.value = noteId
    if (!alreadyOnRoute) suppressAutoScroll.value = false
  }

  function clearJumpTarget() {
    jumpTargetNoteId.value = null
  }

  return {
    jumpTargetNoteId,
    jumpError,
    suppressAutoScroll,
    jumpToNote,
    clearJumpTarget,
  }
})
