<template>
  <button class="result-item" @click="emit('jump', result)">
    <div v-if="page" class="result-page">
      <span class="page-emoji">{{ page.emoji ?? '#' }}</span>
      <span class="page-name">{{ page.name }}</span>
    </div>
    <div class="result-meta">
      <span class="result-date">{{ formatNoteTimestamp(result.date_created) }}</span>
      <span v-if="result.files?.length" class="attachment-badge">
        📎 {{ result.files.length }}
      </span>
    </div>
    <p class="result-snippet">{{ snippet }}</p>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useNavStore } from '@/stores/navStore'
import { formatNoteTimestamp } from '@/utils/dateUtils'
import { stripHtml } from '@/services/searchOffline'

const props = defineProps({
  result: { type: Object, required: true },
  showPage: { type: Boolean, default: false },
})
const emit = defineEmits(['jump'])

const navStore = useNavStore()

const page = computed(() => {
  if (!props.showPage) return null
  return navStore.pages.find((p) => p.id === props.result.page_id) ?? null
})

const SNIPPET_LENGTH = 140
const snippet = computed(() => {
  const text = stripHtml(props.result.content).replace(/\s+/g, ' ').trim()
  if (!text) return '(no text content)'
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH)}…` : text
})
</script>

<style scoped>
.result-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--sp-3);
  border-radius: var(--r-md);
  background: var(--bg-input);
  border: 1px solid var(--border);
  transition: background var(--t-base), border-color var(--t-base);
}

.result-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.result-item + .result-item {
  margin-top: var(--sp-2);
}

.result-page {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--sp-1);
}

.result-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-1);
}

.result-date {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.attachment-badge {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.result-snippet {
  font-size: var(--text-sm);
  color: var(--text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
</style>
