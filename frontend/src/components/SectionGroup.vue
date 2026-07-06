<template>
  <div class="section-group">
    <div
      class="section-row"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <!-- Normal collapse button -->
      <button class="section-header" @click="collapsed = !collapsed">
        <svg class="chevron" :class="{ collapsed }" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="section-name">{{ section.emoji ? `${section.emoji} ` : '' }}{{ section.name }}</span>
      </button>

      <!-- Hover actions (always in the DOM — visibility is CSS-driven so touch
           devices, which never fire mouseenter, can still reach these) -->
      <div class="section-actions">
        <button class="action-btn" title="Add page" @click.stop="openAddPage">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="action-btn" title="Rename" @click.stop="startRename">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="action-btn action-danger" title="Delete" @click.stop="showDeleteConfirm = true">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
    </div>

    <nav v-show="!collapsed">
      <PageListItem
        v-for="page in section.pages"
        :key="page.id"
        :page="page"
      />
    </nav>

    <!-- Modals -->
    <Teleport to="body">
      <!-- Add page to this section -->
      <div v-if="showAddPage" class="modal-backdrop" @click.self="showAddPage = false">
        <div class="modal">
          <h3>New Page in "{{ section.name }}"</h3>
          <div class="name-row">
            <EmojiInput v-model="newPageEmoji" default-char="📄" />
            <input
              ref="addPageInput"
              v-model="newPageName"
              class="name-input"
              placeholder="Page name"
              @keyup.enter="submitAddPage"
              @keyup.escape="showAddPage = false"
            />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showAddPage = false">Cancel</button>
            <button class="btn btn-primary" :disabled="!newPageName.trim()" @click="submitAddPage">Create</button>
          </div>
        </div>
      </div>

      <!-- Rename section -->
      <div v-if="showRenameModal" class="modal-backdrop" @click.self="showRenameModal = false">
        <div class="modal">
          <h3>Rename Section</h3>
          <div class="name-row">
            <EmojiInput v-model="editEmoji" default-char="📁" />
            <input
              ref="renameModalInput"
              v-model="editName"
              class="name-input"
              placeholder="Section name"
              @keyup.enter="submitRenameModal"
              @keyup.escape="showRenameModal = false"
            />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showRenameModal = false">Cancel</button>
            <button class="btn btn-primary" :disabled="!editName.trim()" @click="submitRenameModal">Save</button>
          </div>
        </div>
      </div>

      <!-- Delete section confirm -->
      <div v-if="showDeleteConfirm" class="modal-backdrop" @click.self="showDeleteConfirm = false">
        <div class="modal">
          <h3>Delete "{{ section.name }}"?</h3>
          <p class="confirm-hint">Pages inside will move to the root. This cannot be undone.</p>
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
import { ref, nextTick } from 'vue'
import { useNavStore } from '@/stores/navStore'
import { useRouter } from 'vue-router'
import PageListItem from '@/components/PageListItem.vue'
import EmojiInput from '@/components/EmojiInput.vue'

const props = defineProps({
  section: { type: Object, required: true },
})

const navStore = useNavStore()
const router = useRouter()

const collapsed = ref(false)
const hovered = ref(false)

// Rename (modal)
const showRenameModal = ref(false)
const editName = ref('')
const editEmoji = ref('')
const renameModalInput = ref(null)

// Add page
const showAddPage = ref(false)
const newPageName = ref('')
const newPageEmoji = ref('')
const addPageInput = ref(null)

// Delete
const showDeleteConfirm = ref(false)
const deleting = ref(false)

function startRename() {
  editName.value = props.section.name
  editEmoji.value = props.section.emoji ?? ''
  showRenameModal.value = true
  nextTick(() => {
    renameModalInput.value?.focus()
    renameModalInput.value?.select()
  })
}

async function submitRenameModal() {
  const name = editName.value.trim()
  if (!name) return
  showRenameModal.value = false
  await navStore.renameSection(props.section.id, name, editEmoji.value || null)
}

function openAddPage() {
  newPageName.value = ''
  newPageEmoji.value = ''
  showAddPage.value = true
  collapsed.value = false
  nextTick(() => addPageInput.value?.focus())
}

async function submitAddPage() {
  const name = newPageName.value.trim()
  if (!name) return
  const page = await navStore.addPage(name, props.section.id, newPageEmoji.value || null)
  newPageName.value = ''
  newPageEmoji.value = ''
  showAddPage.value = false
  router.push(`/page/${page.id}`)
}

async function confirmDelete() {
  deleting.value = true
  try {
    await navStore.removeSection(props.section.id)
    showDeleteConfirm.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.section-group {
  margin-bottom: var(--sp-1);
}

/* Row wraps both the header/editing-state and the hover actions */
.section-row {
  position: relative;
  display: flex;
  align-items: center;
  margin: 0 var(--sp-2);
}

.section-header {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-sm);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
  overflow: hidden;
  min-width: 0;
}

.section-header:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}


.chevron {
  transition: transform var(--t-base);
  flex-shrink: 0;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.section-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* Hover action buttons */
.section-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
  padding-right: var(--sp-1);
}

@media (hover: hover) {
  .section-actions {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--t-fast);
  }

  .section-row:hover .section-actions {
    opacity: 1;
    pointer-events: auto;
  }
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  transition: color var(--t-fast), background var(--t-fast);
}

@media (hover: none) {
  .action-btn {
    width: 32px;
    height: 32px;
  }
}

.action-btn:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.08);
}

.action-danger:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
}

/* Modal */
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

.name-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.name-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-primary);
  font-size: var(--text-base);
  outline: none;
  transition: border-color var(--t-base);
}

.name-input:focus {
  border-color: var(--accent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>
