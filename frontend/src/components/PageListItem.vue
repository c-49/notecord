<template>
  <div
    class="page-row"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- Navigation link -->
    <RouterLink
      :to="`/page/${page.id}`"
      class="page-item"
      :class="{ active: isActive }"
    >
      <span class="page-icon">{{ page.emoji ?? '#' }}</span>
      <span class="page-name">{{ page.name }}</span>
    </RouterLink>

    <!-- Hover actions (sibling to the link, not inside it) -->
    <div v-show="hovered || isActive" class="page-actions">
      <button class="action-btn" title="Rename" @click.stop="startRename">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="action-btn action-danger" title="Delete" @click.stop="showDeleteConfirm = true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>

    <!-- Modals -->
    <Teleport to="body">
      <!-- Rename -->
      <div v-if="showRenameModal" class="modal-backdrop" @click.self="showRenameModal = false">
        <div class="modal">
          <h3>Rename Page</h3>
          <div class="name-row">
            <EmojiInput v-model="editEmoji" default-char="📄" />
            <input
              ref="renameModalInput"
              v-model="editName"
              class="name-input"
              placeholder="Page name"
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

      <!-- Delete confirmation -->
      <div v-if="showDeleteConfirm" class="modal-backdrop" @click.self="showDeleteConfirm = false">
        <div class="modal">
          <h3>Delete "{{ page.name }}"?</h3>
          <p class="confirm-hint">All notes in this page will be permanently deleted.</p>
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
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useNavStore } from '@/stores/navStore'
import EmojiInput from '@/components/EmojiInput.vue'

const props = defineProps({
  page: { type: Object, required: true },
})

const navStore = useNavStore()
const route = useRoute()
const router = useRouter()

const hovered = ref(false)
const showRenameModal = ref(false)
const editName = ref('')
const editEmoji = ref('')
const renameModalInput = ref(null)
const showDeleteConfirm = ref(false)
const deleting = ref(false)

const isActive = computed(() => route.params.pageId === String(props.page.id))

function startRename() {
  editName.value = props.page.name
  editEmoji.value = props.page.emoji ?? ''
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
  await navStore.renamePage(props.page.id, name, editEmoji.value || null)
}

async function confirmDelete() {
  deleting.value = true
  try {
    const wasActive = isActive.value
    await navStore.removePage(props.page.id)
    showDeleteConfirm.value = false
    if (wasActive) {
      const first = navStore.pages[0]
      first ? router.push(`/page/${first.id}`) : router.push('/')
    }
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.page-row {
  display: flex;
  align-items: center;
  margin: 1px var(--sp-2);
}

.page-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-decoration: none;
  transition: color var(--t-base), background var(--t-base);
  overflow: hidden;
  min-width: 0;
}

.page-item:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
  text-decoration: none;
}

.page-item.active {
  color: var(--text-primary);
  background: var(--bg-active);
}

.page-icon {
  font-size: var(--text-sm);
  flex-shrink: 0;
}

.page-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
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

/* Hover action buttons (outside the link) */
.page-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding-right: var(--sp-1);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  transition: color var(--t-fast), background var(--t-fast);
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
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}
</style>
