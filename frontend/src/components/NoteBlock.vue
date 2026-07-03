<template>
  <div
    class="note-block"
    :class="{ highlighted }"
    @mouseenter="highlighted = true"
    @mouseleave="highlighted = false"
  >
    <!-- Hover action toolbar -->
    <div v-if="highlighted && !editing" class="note-actions">
      <button class="action-btn" title="Edit" @click.stop="startEdit">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="action-btn action-danger" title="Delete" @click.stop="showDeleteConfirm = true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>

    <div class="note-meta">
      <span class="note-timestamp">{{ formatNoteTimestamp(note.date_created) }}</span>
    </div>

    <div class="note-body">
      <!-- Inline edit mode -->
      <template v-if="editing">
        <textarea
          ref="editEl"
          v-model="editContent"
          class="edit-textarea"
          @keydown.enter.exact.prevent="submitEdit"
          @keydown.escape="cancelEdit"
          @input="autoResize"
        />
        <div class="edit-actions">
          <span class="edit-hint">Shift+Enter for newline · Esc to cancel</span>
          <button class="edit-btn edit-ghost" @click="cancelEdit">Cancel</button>
          <button class="edit-btn edit-primary" :disabled="saving" @click="submitEdit">Save</button>
        </div>
      </template>

      <!-- Normal display -->
      <template v-else>
        <div v-if="note.content" class="note-content" v-html="renderedContent" />
        <div v-if="note.files && note.files.length" class="note-files">
          <AttachmentRenderer
            v-for="noteFile in note.files"
            :key="noteFile.id"
            :note-file="noteFile"
          />
        </div>
      </template>
    </div>

    <!-- Delete confirmation -->
    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="modal-backdrop" @click.self="showDeleteConfirm = false">
        <div class="modal">
          <h3>Delete this note?</h3>
          <p class="confirm-hint">This cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
            <button class="btn btn-danger" :disabled="deleting" @click="confirmDelete">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { formatNoteTimestamp } from '@/utils/dateUtils'
import { useNotesStore } from '@/stores/notesStore'
import AttachmentRenderer from '@/components/attachments/AttachmentRenderer.vue'

const props = defineProps({
  note: { type: Object, required: true },
})

const notesStore = useNotesStore()

const highlighted = ref(false)
const editing = ref(false)
const editContent = ref('')
const editEl = ref(null)
const saving = ref(false)
const showDeleteConfirm = ref(false)
const deleting = ref(false)

// Safe rendering: escape HTML then convert newlines to <br> for plain text Phase 4.
// Phase 7 will switch this to Tiptap JSON rendering.
const renderedContent = computed(() => {
  if (!props.note.content) return ''
  return props.note.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
})

function startEdit() {
  editContent.value = props.note.content ?? ''
  editing.value = true
  nextTick(() => {
    editEl.value?.focus()
    autoResize()
  })
}

function autoResize() {
  if (!editEl.value) return
  editEl.value.style.height = 'auto'
  editEl.value.style.height = `${editEl.value.scrollHeight}px`
}

function cancelEdit() {
  editing.value = false
}

async function submitEdit() {
  const content = editContent.value.trim()
  // Prevent saving an empty text-only note
  if (!content && props.note.attachment_type === 'none') {
    cancelEdit()
    return
  }
  saving.value = true
  editing.value = false
  try {
    if (content !== props.note.content) {
      await notesStore.editNote(props.note.id, content || null)
    }
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  deleting.value = true
  try {
    await notesStore.removeNote(props.note.id)
    showDeleteConfirm.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.note-block {
  position: relative;
  padding: var(--sp-1) var(--sp-4);
  border-radius: var(--r-sm);
  transition: background var(--t-fast);
  cursor: default;
}

.note-block.highlighted {
  background: var(--bg-note-hover);
}

/* ── Hover toolbar ── */
.note-actions {
  position: absolute;
  top: -14px;
  right: var(--sp-4);
  display: flex;
  gap: 2px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  padding: 2px;
  box-shadow: var(--shadow-md);
  z-index: 2;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  transition: color var(--t-fast), background var(--t-fast);
}

.action-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.action-danger:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
}

/* ── Meta & content ── */
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

.note-files {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.note-content {
  font-size: var(--text-base);
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
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

/* ── Inline edit ── */
.edit-textarea {
  width: 100%;
  min-height: 40px;
  resize: none;
  overflow: hidden;
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-primary);
  font-size: var(--text-base);
  line-height: 1.5;
  font-family: inherit;
  outline: none;
}

.edit-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.edit-hint {
  flex: 1;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.edit-btn {
  padding: 3px var(--sp-3);
  border-radius: var(--r-md);
  font-size: var(--text-xs);
  font-weight: 500;
  transition: background var(--t-base), color var(--t-base);
}

.edit-ghost {
  color: var(--text-secondary);
}

.edit-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.edit-primary {
  background: var(--accent);
  color: #fff;
}

.edit-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.edit-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Delete modal ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  padding: var(--sp-6);
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
}

.modal h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.confirm-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>
