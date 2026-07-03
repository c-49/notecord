<template>
  <a class="file-attachment" :href="fileUrl" target="_blank" rel="noopener">
    <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <div class="file-info">
      <span class="file-name">{{ note.attachment_file?.filename_download ?? 'File' }}</span>
      <span class="file-size" v-if="note.attachment_file?.filesize">
        {{ formatSize(note.attachment_file.filesize) }}
      </span>
    </div>
  </a>
</template>

<script setup>
import { computed } from 'vue'
import { getFileUrl } from '@/services/api'

const props = defineProps({
  note: { type: Object, required: true },
})

const fileUrl = computed(() => getFileUrl(props.note.attachment_file?.id))

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.file-attachment {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  text-decoration: none;
  transition: border-color var(--t-base), background var(--t-base);
  max-width: 360px;
}

.file-attachment:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
  text-decoration: none;
}

.file-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.file-name {
  font-size: var(--text-sm);
  color: var(--text-link);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
