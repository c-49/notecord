<template>
  <div class="attachments-view">
    <p v-if="!categories.length" class="empty-hint">No attachments in the current results.</p>

    <section v-for="cat in categories" :key="cat.type" class="category">
      <h4 class="category-title">{{ cat.label }} <span class="category-count">{{ cat.entries.length }}</span></h4>
      <div class="category-grid">
        <div v-for="entry in cat.visible" :key="entry.id" class="attachment-cell">
          <AttachmentRenderer :note-file="entry" />
          <button class="jump-link" @click="emit('jump', entry.note)">
            {{ formatNoteTimestamp(entry.note.date_created) }} →
          </button>
        </div>
      </div>
      <button
        v-if="cat.visible.length < cat.entries.length"
        class="show-more-btn"
        @click="showMore(cat.type)"
      >
        Show more
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import groupBy from 'lodash/groupBy'
import AttachmentRenderer from '@/components/attachments/AttachmentRenderer.vue'
import { formatNoteTimestamp } from '@/utils/dateUtils'

const props = defineProps({
  results: { type: Array, required: true },
})
const emit = defineEmits(['jump'])

const CATEGORY_PAGE_SIZE = 20
const CATEGORY_LABELS = { image: 'Images', file: 'Files', voice: 'Voice notes', embed: 'Embeds' }
const CATEGORY_ORDER = ['image', 'file', 'voice', 'embed']

const visibleCounts = reactive({})

const flatEntries = computed(() =>
  props.results.flatMap((note) =>
    (note.files ?? [])
      .filter((f) => !f.deleted_at)
      .map((f) => ({ ...f, note }))
  )
)

const categories = computed(() => {
  const grouped = groupBy(flatEntries.value, 'attachment_type')
  return CATEGORY_ORDER
    .filter((type) => grouped[type]?.length)
    .map((type) => {
      const entries = grouped[type]
      const visibleCount = visibleCounts[type] ?? CATEGORY_PAGE_SIZE
      return {
        type,
        label: CATEGORY_LABELS[type],
        entries,
        visible: entries.slice(0, visibleCount),
      }
    })
})

function showMore(type) {
  visibleCounts[type] = (visibleCounts[type] ?? CATEGORY_PAGE_SIZE) + CATEGORY_PAGE_SIZE
}
</script>

<style scoped>
.attachments-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.empty-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.category-title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: var(--sp-2);
}

.category-count {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
}

.category-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.attachment-cell {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  align-items: flex-start;
}

.jump-link {
  font-size: var(--text-xs);
  color: var(--text-link);
}

.jump-link:hover {
  text-decoration: underline;
}

.show-more-btn {
  margin-top: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-full);
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  transition: background var(--t-base), border-color var(--t-base), color var(--t-base);
}

.show-more-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
</style>
