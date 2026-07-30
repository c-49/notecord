<template>
  <aside class="thread-panel">
    <header class="thread-header">
      <span class="thread-icon">🧵</span>
      <h2 class="thread-title">{{ page?.name ?? 'Thread' }}</h2>
      <button
        v-if="canDelete"
        class="header-btn header-btn-danger"
        aria-label="Delete thread"
        title="Delete thread"
        @click="showDeleteConfirm = true"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
      <button class="header-btn" aria-label="Close thread" title="Close" @click="threadPanelStore.close()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </header>

    <template v-if="page">
      <NoteFeed :page-id="pageId" />
      <NoteComposer :page-id="pageId" />
    </template>
    <div v-else class="empty-state">
      <p>This thread is no longer available.</p>
    </div>

    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="modal-backdrop" @click.self="showDeleteConfirm = false">
        <div class="modal">
          <h3>Delete this thread?</h3>
          <p class="confirm-hint">This deletes the thread and every reply in it. This cannot be undone.</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
            <button class="btn btn-danger" :disabled="deleting" @click="confirmDelete">Delete</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup>
import { computed, provide, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useNavStore } from '@/stores/navStore'
import { useThreadPanelStore } from '@/stores/threadPanelStore'
import { useSharingStore } from '@/stores/sharingStore'
import { useNotesStore, notesStoreKey } from '@/stores/notesStore'
import NoteFeed from '@/components/NoteFeed.vue'
import NoteComposer from '@/components/composer/NoteComposer.vue'

const props = defineProps({
  pageId: { type: [String, Number], required: true },
})

const navStore = useNavStore()
const threadPanelStore = useThreadPanelStore()
const sharingStore = useSharingStore()
const { pages } = storeToRefs(navStore)

// A SEPARATE notesStore instance from the main feed's (see notesStore.js's
// notesStoreKey comment) — this panel and the main PageView can both be
// showing notes at once, and without this they'd fight over the same
// currentPageId/allNotes state. Fixed id 'thread' is fine since only one
// thread panel is ever open at a time.
provide(notesStoreKey, useNotesStore('thread'))

const page = computed(() => pages.value.find((p) => String(p.id) === String(props.pageId)) ?? null)

// Deleting a whole thread (every reply, gone) is owner-only — deliberately
// narrower than the usual owner-or-editor management bar, matching
// PageListItem.vue's own canDeleteThread for the sidebar's equivalent
// button. Role is resolved against the PARENT page's own owner (a thread
// has no owner/section context of its own worth checking — see
// setup-schema.js's pages:read inheritance-via-parent_page_id comment).
const canDelete = computed(() => {
  const parent = navStore.pages.find((p) => p.id === page.value?.parent_page_id)
  if (!parent) return false
  return sharingStore.roleFor({ ownerId: parent.owner_id, sectionId: parent.section_id, pageId: parent.id }) === 'owner'
})

const showDeleteConfirm = ref(false)
const deleting = ref(false)

async function confirmDelete() {
  deleting.value = true
  try {
    await navStore.removePage(props.pageId)
    showDeleteConfirm.value = false
  } finally {
    deleting.value = false
  }
}

// Auto-close whenever this thread's page stops existing — whether from the
// delete button above, an empty thread auto-deleting itself (see
// notesStore.js's removeNote), or another client/tab deleting it.
watch(page, (p) => {
  if (!p) threadPanelStore.close()
})
</script>

<style scoped>
.thread-panel {
  width: 380px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-tertiary);
  border-left: 1px solid var(--border);
  overflow: hidden;
}

.thread-header {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--header-h);
  padding: 0 var(--sp-3) 0 var(--sp-4);
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.thread-icon {
  font-size: var(--text-lg);
}

.thread-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--r-md);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.header-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.header-btn-danger:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

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
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}

@media (max-width: 768px) {
  .thread-panel {
    position: fixed;
    inset: 0;
    z-index: 20;
    width: 100%;
  }
}
</style>
