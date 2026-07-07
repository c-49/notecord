<template>
  <div class="note-feed" ref="feedEl">
    <div v-if="notesStore.loading" class="feed-state">
      <span>Loading notes…</span>
    </div>

    <div v-else-if="!notesStore.notes.length" class="feed-state feed-empty">
      <p>No notes yet. Start writing below!</p>
    </div>

    <template v-else>
      <div v-if="!(notesStore.exhaustedServerHistory && !notesStore.hasMore)" class="load-more-wrap">
        <button
          v-if="notesStore.hasMore || isOnline"
          class="load-more-btn"
          :disabled="notesStore.loadingMore"
          @click="notesStore.loadMore()"
        >
          {{ notesStore.loadingMore ? 'Loading…' : 'Load earlier notes' }}
        </button>
        <span v-else class="load-more-offline-hint">Older notes aren't available offline</span>
      </div>

      <template v-for="(dayNotes, dayKey) in groupedNotes" :key="dayKey">
        <div class="day-divider">
          <span>{{ formatDayDivider(dayNotes[0].date_created) }}</span>
        </div>
        <NoteBlock
          v-for="note in dayNotes"
          :key="note.id"
          :note="note"
        />
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useNotesStore } from '@/stores/notesStore'
import { useSearchStore } from '@/stores/searchStore'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { formatDayDivider } from '@/utils/dateUtils'
import NoteBlock from '@/components/NoteBlock.vue'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
})

const notesStore = useNotesStore()
const searchStore = useSearchStore()
const { isOnline } = useOnlineStatus()
const feedEl = ref(null)

const groupedNotes = computed(() => notesStore.notesByDay())

watch(() => props.pageId, async (id) => {
  await notesStore.loadNotes(id)
  await nextTick()
  // Suppressed during a search jump's cross-page navigation — the
  // jumpTargetNoteId watcher below handles scrolling in that case instead.
  if (!searchStore.suppressAutoScroll) scrollToBottom()
}, { immediate: true })

// Performs the actual scroll for search's "jump to result" — fires once the
// target page has loaded and the note's DOM node exists. A short retry loop
// covers the case where this fires on the very first tick after a
// cross-page navigation, before NoteBlock has actually rendered yet.
watch(() => searchStore.jumpTargetNoteId, async (id) => {
  if (!id) return
  let el = null
  for (let i = 0; i < 5 && !el; i++) {
    await nextTick()
    el = feedEl.value?.querySelector(`#note-${CSS.escape(id)}`)
    if (!el) await new Promise((r) => setTimeout(r, 20))
  }
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el?.classList.add('jump-highlight')
  setTimeout(() => el?.classList.remove('jump-highlight'), 1500)
  searchStore.clearJumpTarget()
})

// Distinguish a genuinely new note (appended at the end — scroll to it) from
// "Load earlier notes" revealing older ones (prepended at the start — keep
// whatever the user was looking at in the same visual spot, don't yank them
// down to the bottom the moment they asked to see older content).
watch(() => notesStore.notes, (newNotes, oldNotes) => {
  const oldLastId = oldNotes?.[oldNotes.length - 1]?.id
  const newLastId = newNotes?.[newNotes.length - 1]?.id
  if (newLastId !== oldLastId) {
    nextTick(scrollToBottom)
  } else if (newNotes.length > (oldNotes?.length ?? 0)) {
    preserveScrollPosition()
  }
})

function scrollToBottom() {
  if (feedEl.value) {
    feedEl.value.scrollTop = feedEl.value.scrollHeight
  }
}

function preserveScrollPosition() {
  const el = feedEl.value
  if (!el) return
  const prevHeight = el.scrollHeight
  const prevScrollTop = el.scrollTop
  nextTick(() => {
    el.scrollTop = prevScrollTop + (el.scrollHeight - prevHeight)
  })
}
</script>

<style scoped>
.note-feed {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-4) 0;
  display: flex;
  flex-direction: column;
}

.feed-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.feed-empty p {
  text-align: center;
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: var(--sp-2) var(--sp-4) var(--sp-4);
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

.load-more-offline-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-style: italic;
}

.day-divider {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-4) var(--sp-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.day-divider::before,
.day-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
</style>
