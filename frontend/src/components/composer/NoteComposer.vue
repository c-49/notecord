<template>
  <div class="composer">
    <div v-if="submitError" class="submit-error">{{ submitError }}</div>

    <!-- Pending attachments -->
    <div v-if="attachments.length" class="attachments-preview">
      <span class="att-count">{{ attachments.length }}/{{ MAX_ATTACHMENTS }}</span>

      <!-- Images get an actual thumbnail grid instead of a text chip -->
      <div v-if="imageAttachments.length" class="image-preview-strip">
        <div v-for="att in imageAttachments" :key="att.i" class="image-preview">
          <img :src="att.previewUrl" alt="" />
          <button class="image-preview-remove" @click="removeAttachment(att.i)" aria-label="Remove image">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- File/voice/embed attachments keep the text-chip treatment -->
      <div v-if="otherAttachments.length" class="attachment-strip">
        <div v-for="att in otherAttachments" :key="att.i" class="att-chip">
          <span class="att-icon">{{ attIcon(att) }}</span>
          <span class="att-label">{{ attLabel(att) }}</span>
          <button class="att-remove" @click="removeAttachment(att.i)" aria-label="Remove attachment">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
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

      <!-- Rich text input -->
      <RichTextEditor
        ref="editorRef"
        v-model="htmlContent"
        class="composer-editor"
        :placeholder="placeholder"
        @update:text="onTextUpdate"
        @update:empty="(v) => (isEmpty = v)"
        @submit="submit"
        @image-paste="onFileSelected"
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
import { ref, computed, onBeforeUnmount } from 'vue'
import { useNotesStore, AttachmentUploadError } from '@/stores/notesStore'
import FileUploadButton from './FileUploadButton.vue'
import VoiceRecorderButton from './VoiceRecorderButton.vue'
import RichTextEditor from './RichTextEditor.vue'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
})

const MAX_ATTACHMENTS = 4

const notesStore = useNotesStore()
const editorRef = ref(null)
const htmlContent = ref('')
const plainText = ref('')
const isEmpty = ref(true)
// Each entry: { type: 'image'|'file'|'voice'|'embed', file?: File, url?: string, previewUrl?: string }
const attachments = ref([])
const submitting = ref(false)
const dragging = ref(false)
const submitError = ref('')

const placeholder = computed(() => 'Write a note… (Enter to send, Shift+Enter for new line)')
const canSubmit = computed(() => !submitting.value && (!isEmpty.value || attachments.value.length > 0))

// Keep each attachment's original index (needed by removeAttachment) alongside
// the split-by-type view used for rendering.
const imageAttachments = computed(() =>
  attachments.value.map((att, i) => ({ ...att, i })).filter((att) => att.type === 'image')
)
const otherAttachments = computed(() =>
  attachments.value.map((att, i) => ({ ...att, i })).filter((att) => att.type !== 'image')
)

function attIcon(att) {
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

function onTextUpdate(text) {
  plainText.value = text

  // Auto-detect pasted URLs → embed (only when that's the entire content)
  const trimmed = text.trim()
  if (trimmed && isUrl(trimmed) && !attachments.value.some(a => a.type === 'embed' && a.url === trimmed)) {
    addAttachment({ type: 'embed', url: trimmed })
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
  if (att.type === 'image' && att.file) {
    att.previewUrl = URL.createObjectURL(att.file)
  }
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

function removeAttachment(idx) {
  const [removed] = attachments.value.splice(idx, 1)
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
}

function clearAttachments() {
  for (const att of attachments.value) {
    if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
  }
  attachments.value = []
}

function flashError(message) {
  submitError.value = message
  setTimeout(() => {
    if (submitError.value === message) submitError.value = ''
  }, 5000)
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const content = htmlContent.value || null
    await notesStore.addNote(props.pageId, content, attachments.value)

    htmlContent.value = ''
    plainText.value = ''
    isEmpty.value = true
    clearAttachments()
  } catch (err) {
    if (err instanceof AttachmentUploadError) {
      // The note itself was sent — only some attachments failed — so clear
      // the composer same as a normal send, just surface what went wrong.
      htmlContent.value = ''
      plainText.value = ''
      isEmpty.value = true
      clearAttachments()
      flashError(err.message)
    } else {
      flashError('Failed to send note. Please try again.')
    }
  } finally {
    submitting.value = false
    editorRef.value?.focus()
  }
}

onBeforeUnmount(clearAttachments)
</script>

<style scoped>
.composer {
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  background: var(--bg-tertiary);
  padding: var(--sp-2) var(--sp-4) var(--sp-4);
}

.submit-error {
  padding: var(--sp-1) var(--sp-1) 0;
  font-size: var(--text-xs);
  color: var(--accent-danger);
}

/* ── Pending attachments ── */
.attachments-preview {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
}

.image-preview-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.image-preview {
  position: relative;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--r-md);
  overflow: hidden;
}

.image-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-preview-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-full);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  transition: background var(--t-fast);
}

.image-preview-remove:hover {
  background: rgba(218, 55, 60, 0.9);
}

@media (hover: none) {
  .image-preview-remove {
    width: 24px;
    height: 24px;
  }
}

.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
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
  align-self: flex-end;
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

@media (max-width: 480px) {
  .composer-row {
    flex-wrap: wrap;
  }
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

@media (hover: none) {
  .send-btn {
    width: 40px;
    height: 40px;
  }
}

.send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
