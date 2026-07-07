<template>
  <div
    :id="`note-${note.id}`"
    class="note-block"
    :class="{ highlighted }"
    @mouseenter="highlighted = true"
    @mouseleave="highlighted = false"
  >
    <!-- Hover action toolbar (always in the DOM so touch devices, which never
         fire mouseenter, can still reach it — see @media (hover: none) below) -->
    <div v-if="!editing" class="note-actions" :class="{ visible: highlighted }">
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
        <div class="edit-wrap" @keydown.escape="cancelEdit">
          <RichTextEditor
            ref="editEditorRef"
            v-model="editContent"
            compact
            autofocus
            placeholder="Edit note…"
            @update:empty="(v) => (editEmpty = v)"
            @submit="submitEdit"
          />
        </div>
        <div class="edit-actions">
          <span class="edit-hint">Shift+Enter for newline · Esc to cancel</span>
          <button class="edit-btn edit-ghost" @click="cancelEdit">Cancel</button>
          <button class="edit-btn edit-primary" :disabled="saving" @click="submitEdit">Save</button>
        </div>
      </template>

      <!-- Normal display -->
      <template v-else>
        <div v-if="note.content" ref="contentEl" class="note-content" v-html="renderedContent" />
        <!-- Images share a wrapping flex grid so multiple photos line up together -->
        <div v-if="imageFiles.length" class="note-images">
          <AttachmentRenderer
            v-for="noteFile in imageFiles"
            :key="noteFile.id"
            :note-file="noteFile"
          />
        </div>
        <!-- Files/voice/embeds each get their own row -->
        <div v-if="otherFiles.length" class="note-files">
          <AttachmentRenderer
            v-for="noteFile in otherFiles"
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
import { ref, computed, nextTick, watch } from 'vue'
import { formatNoteTimestamp } from '@/utils/dateUtils'
import { useNotesStore } from '@/stores/notesStore'
import { buildPinterestEmbeds, resolvePinterestEmbedHref } from '@/utils/pinterestWidget'
import AttachmentRenderer from '@/components/attachments/AttachmentRenderer.vue'
import RichTextEditor from '@/components/composer/RichTextEditor.vue'

const props = defineProps({
  note: { type: Object, required: true },
})

const notesStore = useNotesStore()

const highlighted = ref(false)
const editing = ref(false)
const editContent = ref('')
const editEmpty = ref(true)
const editEditorRef = ref(null)
const saving = ref(false)
const showDeleteConfirm = ref(false)
const deleting = ref(false)

const imageFiles = computed(() => (props.note.files ?? []).filter((f) => f.attachment_type === 'image'))
const otherFiles = computed(() => (props.note.files ?? []).filter((f) => f.attachment_type !== 'image'))

// note.content is HTML produced by Tiptap/ProseMirror — its parser only ever
// serializes nodes/marks defined in the editor schema, so this can't carry
// arbitrary script tags even though it came in via v-html.
// Checkboxes are disabled here because this is a static v-html render with no
// editor attached to persist a toggle — ticking one would silently revert on reload.
const renderedContent = computed(() =>
  (props.note.content ?? '').replace(/<input type="checkbox"/g, '<input disabled type="checkbox"')
)

// Pinterest has no direct iframe-embed endpoint like YouTube/TikTok — the
// only way to render a pin is to load Pinterest's own widget script, which
// scans the DOM for `data-pin-do` anchors and replaces them with an iframe.
// That's only safe to run against this static v-html render, never against
// the live ProseMirror-managed editor DOM, so link-embed cards produced by
// the editor are plain cards for Pinterest and get upgraded here instead.
const contentEl = ref(null)

async function enhancePinterestEmbeds() {
  // Pinterest's widget script and the pin embed itself both require network
  // to actually render — skip the attempt entirely offline rather than
  // throwing from inside Pinterest's own script when it fails to load.
  if (!navigator.onLine) return
  const container = contentEl.value
  if (!container) return
  const anchors = Array.from(container.querySelectorAll('a[data-link-embed]:not([data-pin-do])'))
  if (!anchors.length) return

  const resolved = await Promise.all(
    anchors.map(async (a) => [a, await resolvePinterestEmbedHref(a.getAttribute('href') || '')])
  )
  let found = false
  for (const [a, embedHref] of resolved) {
    if (!embedHref) continue
    a.setAttribute('href', embedHref)
    a.setAttribute('data-pin-do', 'embedPin')
    a.setAttribute('data-width', '400')
    found = true
  }
  if (found) buildPinterestEmbeds()
}

watch(renderedContent, () => nextTick(enhancePinterestEmbeds), { immediate: true })

function startEdit() {
  editContent.value = props.note.content ?? ''
  editEmpty.value = !editContent.value
  editing.value = true
  nextTick(() => editEditorRef.value?.focus())
}

function cancelEdit() {
  editing.value = false
}

async function submitEdit() {
  // Prevent saving an empty text-only note
  if (editEmpty.value && !props.note.files?.length) {
    cancelEdit()
    return
  }
  saving.value = true
  editing.value = false
  try {
    const nextContent = editEmpty.value ? null : editContent.value
    if (nextContent !== props.note.content) {
      await notesStore.editNote(props.note.id, nextContent)
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

.note-block.jump-highlight {
  background: var(--bg-note-hover);
  transition: background var(--t-slow);
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
  /* Default (and touch devices, which never set .visible via hover): always shown */
  opacity: 1;
}

@media (hover: hover) {
  .note-actions {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--t-fast);
  }

  .note-actions.visible {
    opacity: 1;
    pointer-events: auto;
  }
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

@media (hover: none) {
  .action-btn {
    width: 36px;
    height: 36px;
  }
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

/* Images use a wrapping flex grid, kept distinct from file/voice/embed
   attachments below, which stack in a single column instead. */
.note-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.note-files {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.note-content {
  font-size: var(--text-base);
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
  max-width: 100%;
  overflow-x: auto;
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

.note-content :deep(pre code) {
  background: none;
  padding: 0;
}

.note-content :deep(ul),
.note-content :deep(ol) {
  padding-left: 1.4em;
}

.note-content :deep(blockquote) {
  border-left: 3px solid var(--border-strong);
  padding-left: var(--sp-3);
  color: var(--text-secondary);
}

.note-content :deep(table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  /* Lets a multi-column table overflow into the .note-content scroll area
     instead of squishing every cell down to unreadable widths. !important
     because Tiptap bakes its own inline min-width (from column-resize
     metadata, e.g. "min-width: 75px") directly onto the <table> element. */
  min-width: 360px !important;
  margin: var(--sp-1) 0;
}

.note-content :deep(td),
.note-content :deep(th) {
  border: 1px solid var(--border-strong);
  padding: var(--sp-1) var(--sp-2);
  vertical-align: top;
}

.note-content :deep(th) {
  background: var(--bg-hover);
  font-weight: 600;
  text-align: left;
}

.note-content :deep(ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
}

.note-content :deep(ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
}

.note-content :deep(ul[data-type="taskList"] li > label) {
  flex-shrink: 0;
  margin-top: 3px;
  user-select: none;
}

.note-content :deep(ul[data-type="taskList"] li > div) {
  flex: 1;
}

.note-content :deep(.link-embed-card) {
  display: flex;
  max-width: min(432px, 100%);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  text-decoration: none;
  margin: var(--sp-1) 0;
}

.note-content :deep(.link-embed-card:hover) {
  border-color: var(--border-strong);
  text-decoration: none;
}

.note-content :deep(.link-embed-accent) {
  width: 4px;
  background: var(--accent);
  flex-shrink: 0;
}

.note-content :deep(.link-embed-body) {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  overflow: hidden;
}

.note-content :deep(.link-embed-host) {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.note-content :deep(.link-embed-url) {
  font-size: var(--text-sm);
  color: var(--text-link);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-content :deep(.link-embed-video) {
  display: block;
  max-width: min(480px, 100%);
  margin: var(--sp-1) 0;
}

.note-content :deep(.link-embed-video-frame) {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--bg-input);
}

.note-content :deep(.link-embed-video-frame iframe) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}

/* TikTok clips are portrait, unlike YouTube's 16:9 */
.note-content :deep(.link-embed-video--tiktok) {
  max-width: min(325px, 100%);
}

.note-content :deep(.link-embed-video--tiktok .link-embed-video-frame) {
  aspect-ratio: 9 / 16;
}

/* ── Inline edit ── */
.edit-wrap {
  background: var(--bg-input);
  border: 1px solid var(--accent);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
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
  width: min(360px, calc(100vw - 2rem));
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
