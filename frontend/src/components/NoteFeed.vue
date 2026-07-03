<template>
  <div class="note-feed" ref="feedEl">
    <div v-if="notesStore.loading" class="feed-state">
      <span>Loading notes…</span>
    </div>

    <div v-else-if="!notesStore.notes.length" class="feed-state feed-empty">
      <p>No notes yet. Start writing below!</p>
    </div>

    <template v-else>
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
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useNotesStore } from '@/stores/notesStore'
import { formatDayDivider } from '@/utils/dateUtils'
import NoteBlock from '@/components/NoteBlock.vue'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
})

const notesStore = useNotesStore()
const feedEl = ref(null)

const groupedNotes = computed(() => notesStore.notesByDay())

watch(() => props.pageId, async (id) => {
  await notesStore.loadNotes(id)
  await nextTick()
  scrollToBottom()
}, { immediate: true })

watch(() => notesStore.notes.length, async () => {
  await nextTick()
  scrollToBottom()
})

function scrollToBottom() {
  if (feedEl.value) {
    feedEl.value.scrollTop = feedEl.value.scrollHeight
  }
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
