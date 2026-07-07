<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="app-name-wrap">
        <span class="app-name">NoteCord</span>
        <span class="status-dot" :class="statusClass" :title="statusTitle" />
      </div>

      <div class="header-actions">
        <!-- Dropdown trigger -->
        <div class="dropdown-wrap" ref="dropdownWrap">
          <button
            class="header-btn"
            aria-label="Add section or page"
            :aria-expanded="dropdownOpen"
            @click="dropdownOpen = !dropdownOpen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>

          <Transition name="dropdown">
            <div v-if="dropdownOpen" class="dropdown-menu" role="menu">
              <button class="dropdown-item" role="menuitem" @click="openAddPage">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                New Page
              </button>
              <button class="dropdown-item" role="menuitem" @click="openAddSection">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                </svg>
                New Section
              </button>
            </div>
          </Transition>
        </div>

        <!-- Search -->
        <button class="header-btn" aria-label="Search" title="Search notes" @click="searchStore.openSearch()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>

        <!-- Theme customizer -->
        <button class="header-btn" aria-label="Settings" title="Customize theme" @click="showThemeCustomizer = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>

        <!-- Log out -->
        <button class="header-btn" aria-label="Log out" title="Log out" @click="handleLogout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>

        <!-- Mobile close -->
        <button class="header-btn close-btn" aria-label="Close sidebar" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="sidebar-scroll">
      <!-- Empty state -->
      <div v-if="isEmpty" class="empty-state">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
        <p>It's empty here</p>
        <span>Use the <strong>+</strong> button above to add a page or section.</span>
      </div>

      <template v-else>
        <!-- Root-level pages (no section) -->
        <nav v-if="navStore.rootPages.length">
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
      </template>
    </div>

    <!-- Modals -->
    <Teleport to="body">
      <div v-if="showAddSection" class="modal-backdrop" @click.self="showAddSection = false">
        <div class="modal">
          <h3>New Section</h3>
          <div class="name-row">
            <EmojiInput v-model="newSectionEmoji" default-char="📁" />
            <input ref="sectionNameInput" v-model="newSectionName" class="name-input" placeholder="Section name" @keyup.enter="submitSection" @keyup.escape="showAddSection = false" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showAddSection = false">Cancel</button>
            <button class="btn btn-primary" :disabled="!newSectionName.trim()" @click="submitSection">Create</button>
          </div>
        </div>
      </div>

      <div v-if="showAddPage" class="modal-backdrop" @click.self="showAddPage = false">
        <div class="modal">
          <h3>New Page</h3>
          <div class="name-row">
            <EmojiInput v-model="newPageEmoji" default-char="📄" />
            <input ref="pageNameInput" v-model="newPageName" class="name-input" placeholder="Page name" @keyup.enter="submitPage" @keyup.escape="showAddPage = false" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showAddPage = false">Cancel</button>
            <button class="btn btn-primary" :disabled="!newPageName.trim()" @click="submitPage">Create</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ThemeCustomizer v-if="showThemeCustomizer" @close="showThemeCustomizer = false" />
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useNavStore } from '@/stores/navStore'
import { useAuthStore } from '@/stores/authStore'
import { useSearchStore } from '@/stores/searchStore'
import { useRouter } from 'vue-router'
import SectionGroup from '@/components/SectionGroup.vue'
import PageListItem from '@/components/PageListItem.vue'
import EmojiInput from '@/components/EmojiInput.vue'
import ThemeCustomizer from '@/components/ThemeCustomizer.vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { pendingCount } from '@/services/mutationQueue'

const emit = defineEmits(['close'])
const navStore = useNavStore()
const authStore = useAuthStore()
const searchStore = useSearchStore()
const router = useRouter()
const { isOnline } = useOnlineStatus()

const statusClass = computed(() => {
  if (!isOnline.value) return 'offline'
  return pendingCount.value > 0 ? 'syncing' : 'online'
})

const statusTitle = computed(() => {
  if (!isOnline.value) return 'Offline — showing cached notes'
  return pendingCount.value > 0
    ? `Syncing… ${pendingCount.value} change${pendingCount.value === 1 ? '' : 's'} pending`
    : 'Online'
})

async function handleLogout() {
  await authStore.logout()
  router.push({ name: 'login' })
}

const showThemeCustomizer = ref(false)
const dropdownOpen = ref(false)
const dropdownWrap = ref(null)

const showAddSection = ref(false)
const newSectionName = ref('')
const newSectionEmoji = ref('')
const sectionNameInput = ref(null)

const showAddPage = ref(false)
const newPageName = ref('')
const newPageEmoji = ref('')
const pageNameInput = ref(null)

const isEmpty = computed(
  () => !navStore.loading && navStore.sections.length === 0 && navStore.pages.length === 0
)

function openAddPage() {
  dropdownOpen.value = false
  newPageName.value = ''
  newPageEmoji.value = ''
  showAddPage.value = true
  nextTick(() => pageNameInput.value?.focus())
}

function openAddSection() {
  dropdownOpen.value = false
  newSectionName.value = ''
  newSectionEmoji.value = ''
  showAddSection.value = true
  nextTick(() => sectionNameInput.value?.focus())
}

async function submitSection() {
  if (!newSectionName.value.trim()) return
  await navStore.addSection(newSectionName.value.trim(), newSectionEmoji.value || null)
  newSectionName.value = ''
  newSectionEmoji.value = ''
  showAddSection.value = false
}

async function submitPage() {
  if (!newPageName.value.trim()) return
  const page = await navStore.addPage(newPageName.value.trim(), null, newPageEmoji.value || null)
  newPageName.value = ''
  newPageEmoji.value = ''
  showAddPage.value = false
  router.push(`/page/${page.id}`)
}

function onClickOutside(e) {
  if (dropdownOpen.value && dropdownWrap.value && !dropdownWrap.value.contains(e.target)) {
    dropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  document.addEventListener('touchstart', onClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
  document.removeEventListener('touchstart', onClickOutside)
})
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

/* ── Header ── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-h);
  padding: 0 var(--sp-3) 0 var(--sp-4);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.app-name-wrap {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  min-width: 0;
}

.app-name {
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-md);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.header-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}

.status-dot.online {
  background: var(--accent-success);
}

.status-dot.offline {
  background: var(--accent-danger);
}

.status-dot.syncing {
  background: #faa61a;
  animation: status-pulse 1.2s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (hover: none) {
  .header-btn {
    width: 36px;
    height: 36px;
  }
}

.close-btn {
  display: none;
}

/* ── Dropdown ── */
.dropdown-wrap {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 160px;
  background: var(--bg-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-lg);
  padding: var(--sp-1);
  box-shadow: var(--shadow-lg);
  z-index: 50;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: background var(--t-fast), color var(--t-fast);
  text-align: left;
}

.dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity var(--t-fast), transform var(--t-fast);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

/* ── Scroll area ── */
.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-2) 0 var(--sp-4);
  display: flex;
  flex-direction: column;
}

/* ── Empty state ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-8) var(--sp-4);
  text-align: center;
  color: var(--text-muted);
}

.empty-state svg {
  opacity: 0.4;
  margin-bottom: var(--sp-1);
}

.empty-state p {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-state span {
  font-size: var(--text-xs);
  line-height: 1.5;
}

.empty-state strong {
  color: var(--text-secondary);
}

/* ── Modal ── */
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
  box-shadow: var(--shadow-xl);
}

.modal h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
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

/* ── Mobile ── */
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
    display: flex;
  }
}
</style>
