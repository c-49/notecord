<template>
  <div class="note-block" :class="{ highlighted }" @mouseenter="highlighted = true" @mouseleave="highlighted = false">
    <div class="note-meta">
      <span class="note-timestamp">{{ formatNoteTimestamp(note.date_created) }}</span>
    </div>
    <div class="note-body">
      <!-- Rich text content -->
      <div v-if="note.content" class="note-content" v-html="renderedContent" />
      <!-- Attachment -->
      <AttachmentRenderer v-if="note.attachment_type !== 'none'" :note="note" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatNoteTimestamp } from '@/utils/dateUtils'
import AttachmentRenderer from '@/components/attachments/AttachmentRenderer.vue'

const props = defineProps({
  note: { type: Object, required: true },
})

const highlighted = ref(false)

const renderedContent = computed(() => {
  if (!props.note.content) return ''
  // For Phase 4, content is plain text. Phase 7 will switch to Tiptap JSON rendering.
  if (typeof props.note.content === 'string') return props.note.content
  return ''
})
</script>

<style scoped>
.note-block {
  padding: var(--sp-1) var(--sp-4);
  border-radius: var(--r-sm);
  transition: background var(--t-fast);
  cursor: default;
}

.note-block.highlighted {
  background: var(--bg-note-hover);
}

.note-meta {
  margin-bottom: var(--sp-1);
}

.note-timestamp {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.note-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.note-content {
  font-size: var(--text-base);
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
}

.note-content :deep(p) {
  margin: 0;
}

.note-content :deep(code) {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--bg-input);
  padding: 1px 4px;
  border-radius: var(--r-sm);
}

.note-content :deep(pre) {
  background: var(--bg-input);
  padding: var(--sp-3);
  border-radius: var(--r-md);
  overflow-x: auto;
}
</style>
