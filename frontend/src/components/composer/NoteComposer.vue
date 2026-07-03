<template>
  <div class="composer">
    <!-- Attachment chips strip -->
    <div v-if="attachments.length" class="attachment-strip">
      <span class="att-count">{{ attachments.length }}/{{ MAX_ATTACHMENTS }}</span>
      <div v-for="(att, i) in attachments" :key="i" class="att-chip">
        <span class="att-icon">{{ attIcon(att) }}</span>
        <span class="att-label">{{ attLabel(att) }}</span>
        <button class="att-remove" @click="removeAttachment(i)" aria-label="Remove attachment">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div
      class="composer-row"
      :class="{ 'drag-over': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <!-- File upload button -->
      <FileUploadButton :disabled="attachments.length >= MAX_ATTACHMENTS" @file-selected="onFileSelected" />

      <!-- Text input -->
      <div
        class="composer-input"
        contenteditable="true"
        :data-placeholder="placeholder"
        ref="inputEl"
        @keydown.enter.exact.prevent="submit"
        @input="onInput"
        @paste="onPaste"
      />

      <!-- Voice record button -->
      <VoiceRecorderButton @recording-complete="onVoiceRecording" />

      <!-- Send button -->
      <button
        class="send-btn"
        :disabled="!canSubmit"
        @click="submit"
        aria-label="Send note"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useNotesStore } from '@/stores/notesStore'
import FileUploadButton from './FileUploadButton.vue'
import VoiceRecorderButton from './VoiceRecorderButton.vue'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
})

const MAX_ATTACHMENTS = 4

const notesStore = useNotesStore()
const inputEl = ref(null)
const textContent = ref('')
// Each entry: { type: 'image'|'file'|'voice'|'embed', file?: File, url?: string }
const attachments = ref([])
const submitting = ref(false)
const dragging = ref(false)

const placeholder = computed(() => 'Write a note… (Enter to send, Shift+Enter for new line)')
const canSubmit = computed(() => !submitting.value && (textContent.value.trim() || attachments.value.length > 0))

function attIcon(att) {
  if (att.type === 'image') return '🖼'
  if (att.type === 'voice') return '🎤'
  if (att.type === 'embed') return '🔗'
  return '📎'
}

function attLabel(att) {
  if (att.type === 'embed') {
    try { return new URL(att.url).hostname } catch { return att.url }
  }
  if (att.type === 'voice') return `Voice (${formatVoiceSize(att.file?.size)})`
  return att.file?.name ?? 'Attachment'
}

function formatVoiceSize(bytes) {
  if (!bytes) return ''
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function onInput() {
  textContent.value = inputEl.value?.innerText ?? ''

  // Auto-detect pasted URLs → embed (only when that's the entire content)
  const text = textContent.value.trim()
  if (text && isUrl(text) && !attachments.value.some(a => a.type === 'embed' && a.url === text)) {
    addAttachment({ type: 'embed', url: text })
  }
}

function isUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function addAttachment(att) {
  if (attachments.value.length >= MAX_ATTACHMENTS) return
  attachments.value.push(att)
}

function onFileSelected(file) {
  addAttachment({ type: file.type.startsWith('image/') ? 'image' : 'file', file })
}

function onVoiceRecording(blob) {
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type })
  addAttachment({ type: 'voice', file })
}

function onDrop(e) {
  dragging.value = false
  for (const file of e.dataTransfer?.files ?? []) {
    onFileSelected(file)
  }
}

function onPaste(e) {
  const items = Array.from(e.clipboardData?.items ?? [])
  const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  if (imageItem) {
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (file) onFileSelected(file)
    return
  }
  // Plain text paste — sync after browser inserts content
  requestAnimationFrame(() => {
    textContent.value = inputEl.value?.innerText ?? ''
  })
}

function removeAttachment(idx) {
  attachments.value.splice(idx, 1)
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const content = textContent.value.trim() || null
    await notesStore.addNote(props.pageId, content, attachments.value)

    if (inputEl.value) inputEl.value.innerText = ''
    textContent.value = ''
    attachments.value = []
  } finally {
    submitting.value = false
    inputEl.value?.focus()
  }
}
</script>

<style scoped>
.composer {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-tertiary);
  padding: var(--sp-2) var(--sp-4) var(--sp-4);
}

/* ── Attachment chips ── */
.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  padding: var(--sp-2) 0 var(--sp-2);
}

.att-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 3px var(--sp-2) 3px var(--sp-2);
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-full);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  max-width: 200px;
}

.att-icon {
  flex-shrink: 0;
  font-size: 11px;
}

.att-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.att-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--r-full);
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color var(--t-fast), background var(--t-fast);
}

.att-remove:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
}

.att-count {
  font-size: var(--text-xs);
  color: var(--text-muted);
  align-self: center;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Composer row ── */
.composer-row {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
  transition: border-color var(--t-base);
}

.composer-row:focus-within {
  border-color: var(--accent);
}

.composer-row.drag-over {
  border-color: var(--accent);
  background: rgba(88, 101, 242, 0.08);
}

.composer-input {
  flex: 1;
  min-height: 22px;
  max-height: 200px;
  overflow-y: auto;
  outline: none;
  font-size: var(--text-base);
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.composer-input:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
}

.send-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--r-full);
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--t-base), opacity var(--t-base);
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
