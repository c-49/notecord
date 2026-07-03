<template>
  <div class="composer">
    <!-- Attachment preview strip -->
    <div v-if="attachment" class="attachment-preview">
      <div class="preview-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
        <span>{{ attachmentLabel }}</span>
      </div>
      <button class="remove-attachment" @click="clearAttachment" aria-label="Remove attachment">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      </button>
    </div>

    <div class="composer-row">
      <!-- File upload button -->
      <FileUploadButton @file-selected="onFileSelected" />

      <!-- Text input -->
      <div
        class="composer-input"
        contenteditable="true"
        :data-placeholder="placeholder"
        ref="inputEl"
        @keydown.enter.exact.prevent="submit"
        @input="onInput"
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
import { uploadFile } from '@/services/api'
import FileUploadButton from './FileUploadButton.vue'
import VoiceRecorderButton from './VoiceRecorderButton.vue'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
})

const notesStore = useNotesStore()
const inputEl = ref(null)
const textContent = ref('')
const attachment = ref(null) // { type, file?, url? }
const submitting = ref(false)

const placeholder = computed(() => 'Write a note… (Enter to send, Shift+Enter for new line)')

const attachmentLabel = computed(() => {
  if (!attachment.value) return ''
  if (attachment.value.type === 'embed') return attachment.value.url
  return attachment.value.file?.name ?? 'Attachment'
})

const canSubmit = computed(() => !submitting.value && (textContent.value.trim() || attachment.value))

function onInput() {
  textContent.value = inputEl.value?.innerText ?? ''

  // Auto-detect pasted URLs to create embeds
  const text = textContent.value.trim()
  if (!attachment.value && isUrl(text)) {
    attachment.value = { type: 'embed', url: text }
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

function onFileSelected(file) {
  const isImage = file.type.startsWith('image/')
  attachment.value = { type: isImage ? 'image' : 'file', file }
}

function onVoiceRecording(blob) {
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type })
  attachment.value = { type: 'voice', file }
}

function clearAttachment() {
  attachment.value = null
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true

  try {
    const content = textContent.value.trim() || null
    let attachmentType = 'none'
    let attachmentFileId = null
    let embedUrl = null

    if (attachment.value) {
      if (attachment.value.type === 'embed') {
        attachmentType = 'embed'
        embedUrl = attachment.value.url
      } else {
        const uploaded = await uploadFile(attachment.value.file)
        attachmentFileId = uploaded.id
        attachmentType = attachment.value.type
      }
    }

    await notesStore.addNote(props.pageId, content, attachmentType, attachmentFileId, embedUrl)

    // Reset
    if (inputEl.value) inputEl.value.innerText = ''
    textContent.value = ''
    attachment.value = null
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

.attachment-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-2) var(--sp-3);
  margin-bottom: var(--sp-2);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.preview-info {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  overflow: hidden;
}

.preview-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-attachment {
  color: var(--text-muted);
  flex-shrink: 0;
  padding: var(--sp-1);
  border-radius: var(--r-sm);
  transition: color var(--t-base);
}

.remove-attachment:hover {
  color: var(--accent-danger);
}

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
