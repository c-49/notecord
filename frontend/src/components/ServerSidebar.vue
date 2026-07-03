<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="app-name">NoteCord</span>
      <button class="close-btn" aria-label="Close sidebar" @click="emit('close')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="sidebar-scroll">
      <!-- Root-level pages (no section) -->
      <nav class="section-group" v-if="navStore.rootPages.length">
        <PageListItem
          v-for="page in navStore.rootPages"
          :key="page.id"
          :page="page"
        />
      </nav>

      <!-- Sections with their pages -->
      <SectionGroup
        v-for="section in navStore.pagesBySection"
        :key="section.id"
        :section="section"
      />

      <!-- Add controls -->
      <div class="add-controls">
        <button class="add-btn" @click="showAddSection = true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
          Add Section
        </button>
        <button class="add-btn" @click="showAddPage = true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
          Add Page
        </button>
      </div>
    </div>

    <!-- Inline modals (add section / add page) -->
    <Teleport to="body">
      <div v-if="showAddSection" class="modal-backdrop" @click.self="showAddSection = false">
        <div class="modal">
          <h3>New Section</h3>
          <input v-model="newSectionName" placeholder="Section name" @keyup.enter="submitSection" autofocus />
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showAddSection = false">Cancel</button>
            <button class="btn btn-primary" :disabled="!newSectionName.trim()" @click="submitSection">Create</button>
          </div>
        </div>
      </div>

      <div v-if="showAddPage" class="modal-backdrop" @click.self="showAddPage = false">
        <div class="modal">
          <h3>New Page</h3>
          <input v-model="newPageName" placeholder="Page name" @keyup.enter="submitPage" autofocus />
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showAddPage = false">Cancel</button>
            <button class="btn btn-primary" :disabled="!newPageName.trim()" @click="submitPage">Create</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { useNavStore } from '@/stores/navStore'
import SectionGroup from '@/components/SectionGroup.vue'
import PageListItem from '@/components/PageListItem.vue'

const emit = defineEmits(['close'])
const navStore = useNavStore()

const showAddSection = ref(false)
const newSectionName = ref('')
const showAddPage = ref(false)
const newPageName = ref('')

async function submitSection() {
  if (!newSectionName.value.trim()) return
  await navStore.addSection(newSectionName.value.trim())
  newSectionName.value = ''
  showAddSection.value = false
}

async function submitPage() {
  if (!newPageName.value.trim()) return
  await navStore.addPage(newPageName.value.trim())
  newPageName.value = ''
  showAddPage.value = false
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-h);
  padding: 0 var(--sp-4);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.app-name {
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.close-btn {
  display: none;
  color: var(--text-muted);
  padding: var(--sp-1);
  border-radius: var(--r-sm);
  transition: color var(--t-base);
}

.close-btn:hover {
  color: var(--text-primary);
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-2) 0 var(--sp-4);
}

.section-group {
  margin-bottom: var(--sp-2);
}

.add-controls {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-2);
  margin-top: var(--sp-4);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-md);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color var(--t-base), background var(--t-base);
}

.add-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
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
  box-shadow: var(--shadow-xl);
}

.modal h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.modal input {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-primary);
  font-size: var(--text-base);
  outline: none;
  transition: border-color var(--t-base);
}

.modal input:focus {
  border-color: var(--accent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 20;
    transform: translateX(-100%);
    transition: transform var(--t-slow);
  }

  .sidebar.sidebar-open {
    transform: translateX(0);
  }

  .close-btn {
    display: block;
  }
}
</style>
