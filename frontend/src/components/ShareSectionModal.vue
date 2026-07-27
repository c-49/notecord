<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="$emit('close')">
      <div class="modal">
        <h3>Share "{{ page ? page.name : section.name }}"</h3>

        <!-- Whole section vs specific channels -->
        <div v-if="!page" class="scope-toggle">
          <button
            class="scope-btn"
            :class="{ active: mode === 'whole' }"
            @click="mode = 'whole'"
          >
            Entire section
          </button>
          <button
            class="scope-btn"
            :class="{ active: mode === 'pages' }"
            @click="mode = 'pages'"
          >
            Choose specific channels
          </button>
        </div>

        <div v-if="!page && mode === 'pages'" class="page-checklist">
          <label v-for="p in sectionPages" :key="p.id" class="page-check-row">
            <input type="checkbox" :value="p.id" v-model="selectedPageIds" />
            <span>{{ p.emoji ? `${p.emoji} ` : '' }}{{ p.name }}</span>
          </label>
          <p v-if="!sectionPages.length" class="empty-hint">No channels in this section yet.</p>
        </div>

        <!-- Add a grant -->
        <div class="add-grant">
          <div class="user-search">
            <input
              v-model="userQuery"
              class="name-input"
              placeholder="Share with someone's email…"
              @input="onQueryInput"
            />
            <div v-if="userResults.length" class="user-results">
              <button
                v-for="u in userResults"
                :key="u.id"
                class="user-result"
                @click="selectUser(u)"
              >
                {{ displayName(u) }}
              </button>
            </div>
          </div>

          <div v-if="selectedUser" class="selected-user">
            <span>{{ displayName(selectedUser) }}</span>
            <button class="clear-btn" title="Clear" @click="selectedUser = null">×</button>
          </div>

          <div class="role-picker">
            <button class="role-btn" :class="{ active: role === 'viewer' }" @click="role = 'viewer'">Viewer</button>
            <button class="role-btn" :class="{ active: role === 'editor' }" @click="role = 'editor'">Editor</button>
          </div>

          <p v-if="errorMsg" class="error-hint">{{ errorMsg }}</p>

          <div class="modal-actions">
            <button class="btn btn-ghost" @click="$emit('close')">Done</button>
            <button class="btn btn-primary" :disabled="!canSubmit || submitting" @click="submitGrant">
              Share
            </button>
          </div>
        </div>

        <!-- Existing grants -->
        <div v-if="existingGrants.length" class="existing-grants">
          <h4>People with access</h4>
          <div v-for="g in existingGrants" :key="g.id" class="grant-row">
            <span class="grant-user">{{ displayName(g.user_id) }}</span>
            <span class="grant-scope">{{ grantScopeLabel(g) }}</span>
            <span class="grant-role">{{ g.role }}</span>
            <button class="revoke-btn" title="Revoke access" @click="revokeGrant(g.id)">Revoke</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSharingStore } from '@/stores/sharingStore'

const props = defineProps({
  section: { type: Object, required: true },
  // When set, this modal is scoped to sharing just this one page — the
  // whole-section/specific-channels toggle is hidden.
  page: { type: Object, default: null },
  // All pages in the section — only needed for the "choose specific
  // channels" checklist when sharing from the section level.
  sectionPages: { type: Array, default: () => [] },
})
defineEmits(['close'])

const sharingStore = useSharingStore()

const mode = ref('whole')
const selectedPageIds = ref([])
const userQuery = ref('')
const userResults = ref([])
const selectedUser = ref(null)
const role = ref('viewer')
const submitting = ref(false)
const errorMsg = ref('')

let searchTimer = null
function onQueryInput() {
  selectedUser.value = null
  clearTimeout(searchTimer)
  const q = userQuery.value
  if (!q.trim()) { userResults.value = []; return }
  searchTimer = setTimeout(async () => {
    userResults.value = await sharingStore.searchUsers(q)
  }, 250)
}

function selectUser(u) {
  selectedUser.value = u
  userResults.value = []
  userQuery.value = ''
}

function displayName(u) {
  if (!u) return ''
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ')
  return name ? `${name} (${u.email})` : u.email
}

const existingGrants = computed(() =>
  props.page ? sharingStore.grantsGivenForPage(props.page.id) : sharingStore.grantsGivenForSection(props.section.id)
)

function grantScopeLabel(grant) {
  if (grant.page_id === null) return 'entire section'
  const p = props.sectionPages.find((x) => x.id === grant.page_id) ?? props.page
  return p ? p.name : 'a channel'
}

const canSubmit = computed(() => {
  if (!selectedUser.value) return false
  if (!props.page && mode.value === 'pages') return selectedPageIds.value.length > 0
  return true
})

async function submitGrant() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMsg.value = ''
  try {
    if (props.page) {
      await sharingStore.sharePages(props.section.id, [props.page.id], selectedUser.value.id, role.value)
    } else if (mode.value === 'whole') {
      await sharingStore.shareWhole(props.section.id, selectedUser.value.id, role.value)
    } else {
      await sharingStore.sharePages(props.section.id, selectedPageIds.value, selectedUser.value.id, role.value)
      selectedPageIds.value = []
    }
    selectedUser.value = null
  } catch (e) {
    errorMsg.value = e?.errors?.[0]?.message?.includes('unique')
      ? 'Already shared with this person for this target.'
      : 'Could not share — please try again.'
  } finally {
    submitting.value = false
  }
}

async function revokeGrant(id) {
  await sharingStore.revoke(id)
}
</script>

<style scoped>
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
  width: min(420px, calc(100vw - 2rem));
  max-height: min(600px, calc(100vh - 4rem));
  overflow-y: auto;
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

.modal h4 {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: var(--sp-2);
}

.scope-toggle {
  display: flex;
  gap: var(--sp-2);
}

.scope-btn {
  flex: 1;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: var(--text-sm);
  transition: color var(--t-base), background var(--t-base), border-color var(--t-base);
}

.scope-btn.active {
  color: var(--text-primary);
  background: var(--bg-active);
  border-color: var(--accent);
}

.page-checklist {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  padding: var(--sp-2);
}

.page-check-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  padding: var(--sp-1);
}

.empty-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
  padding: var(--sp-1);
}

.add-grant {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-top: var(--sp-2);
  border-top: 1px solid var(--border-strong);
}

.user-search {
  position: relative;
}

.name-input {
  width: 100%;
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

.user-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  overflow: hidden;
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.user-result {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.user-result:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.selected-user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-active);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.clear-btn {
  color: var(--text-muted);
  font-size: var(--text-lg);
  line-height: 1;
}

.clear-btn:hover {
  color: var(--text-primary);
}

.role-picker {
  display: flex;
  gap: var(--sp-2);
}

.role-btn {
  flex: 1;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: var(--text-sm);
  transition: color var(--t-base), background var(--t-base), border-color var(--t-base);
}

.role-btn.active {
  color: var(--text-primary);
  background: var(--bg-active);
  border-color: var(--accent);
}

.error-hint {
  font-size: var(--text-sm);
  color: var(--accent-danger);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
}

.existing-grants {
  padding-top: var(--sp-2);
  border-top: 1px solid var(--border-strong);
}

.grant-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  font-size: var(--text-sm);
}

.grant-user {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grant-scope {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.grant-role {
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.revoke-btn {
  color: var(--accent-danger);
  font-size: var(--text-xs);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-sm);
}

.revoke-btn:hover {
  background: rgba(218, 55, 60, 0.12);
}
</style>
