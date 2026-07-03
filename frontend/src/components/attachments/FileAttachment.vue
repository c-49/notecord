<template>
  <a class="file-attachment" :href="fileUrl" target="_blank" rel="noopener" :download="fileName">
    <div class="file-icon-wrap">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    </div>
    <div class="file-info">
      <span class="file-name">{{ fileName }}</span>
      <span v-if="fileSize" class="file-size">{{ fileSize }}</span>
    </div>
    <svg class="download-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  </a>
</template>

<script setup>
import { computed } from 'vue'
import { getFileUrl } from '@/services/api'

const props = defineProps({
  noteFile: { type: Object, required: true },
})

// file_id may be a UUID string (right after create) or a full object (after fetch)
const fileObj = computed(() => {
  const f = props.noteFile.file_id
  return typeof f === 'object' ? f : null
})

const fileId = computed(() => {
  const f = props.noteFile.file_id
  return typeof f === 'string' ? f : f?.id
})

const fileUrl = computed(() => getFileUrl(fileId.value))

const fileName = computed(() => fileObj.value?.filename_download ?? 'Download file')

const fileSize = computed(() => {
  const bytes = fileObj.value?.filesize
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})
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
  cursor: pointer;
}

.file-attachment:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
  text-decoration: none;
}

.file-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: var(--r-md);
  background: rgba(88, 101, 242, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--accent);
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  flex: 1;
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

.download-icon {
  color: var(--text-muted);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--t-fast);
}

.file-attachment:hover .download-icon {
  opacity: 1;
}
</style>
