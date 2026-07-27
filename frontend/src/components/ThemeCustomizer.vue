<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal">
        <div class="modal-header">
          <h3>Settings</h3>
          <button class="icon-btn" aria-label="Close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="tab-bar">
          <button class="tab-btn" :class="{ active: activeTab === 'theme' }" @click="activeTab = 'theme'">Theme</button>
          <button class="tab-btn" :class="{ active: activeTab === 'backups' }" @click="selectBackupsTab">Backups</button>
        </div>

        <div v-if="activeTab === 'theme'" class="modal-body">
          <div v-for="group in THEME_GROUPS" :key="group.label" class="theme-group">
            <h4 class="group-label">{{ group.label }}</h4>
            <div v-for="v in group.vars" :key="v.key" class="color-row">
              <span class="color-name">{{ v.label }}</span>
              <div class="color-controls">
                <button
                  v-if="themeStore.isOverridden(v.key)"
                  class="reset-btn"
                  title="Reset to default"
                  @click="themeStore.resetColor(v.key)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
                  </svg>
                </button>
                <input
                  type="color"
                  class="color-input"
                  :value="themeStore.getValue(v.key)"
                  @input="themeStore.setColor(v.key, $event.target.value)"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-else class="modal-body">
          <!-- Every user: export just their own notes -->
          <div class="backup-row">
            <div class="backup-info">
              <span class="backup-label">My export</span>
              <span class="backup-meta">{{ myExportMeta }}</span>
            </div>
            <div class="backup-actions">
              <template v-if="myExport?.status === 'ready'">
                <button v-if="myExport.files?.html" class="btn btn-ghost" @click="download(myExport.files.html, 'my-notecord-export.html')">HTML</button>
                <button v-if="myExport.files?.pdf" class="btn btn-ghost" @click="download(myExport.files.pdf, 'my-notecord-export.pdf')">PDF</button>
                <button v-if="myExport.files?.docx" class="btn btn-ghost" @click="download(myExport.files.docx, 'my-notecord-export.docx')">DOCX</button>
              </template>
              <button v-if="canRequestExport" class="btn btn-primary" @click="requestMyExport">Request export</button>
            </div>
          </div>

          <!-- Admin only: whole-instance backup -->
          <template v-if="backupAccess">
            <div class="backup-row">
              <div class="backup-info">
                <span class="backup-label">Database backup</span>
                <span class="backup-meta">
                  {{ dbStatus ? `${formatNoteTimestamp(dbStatus.last_success_at)} — ${dbStatus.detail}` : 'No backup yet' }}
                </span>
              </div>
              <button v-if="dbStatus?.files?.dump" class="btn btn-ghost" @click="download(dbStatus.files.dump, 'notecord-db-backup.dump')">
                Download .dump
              </button>
            </div>

            <div class="backup-row">
              <div class="backup-info">
                <span class="backup-label">Notes export (whole instance)</span>
                <span class="backup-meta">
                  {{ exportStatus ? `${formatNoteTimestamp(exportStatus.last_success_at)} — ${exportStatus.detail}` : 'No backup yet' }}
                </span>
              </div>
              <div class="backup-actions">
                <button v-if="exportStatus?.files?.html" class="btn btn-ghost" @click="download(exportStatus.files.html, 'notecord-export.html')">HTML</button>
                <button v-if="exportStatus?.files?.pdf" class="btn btn-ghost" @click="download(exportStatus.files.pdf, 'notecord-export.pdf')">PDF</button>
                <button v-if="exportStatus?.files?.docx" class="btn btn-ghost" @click="download(exportStatus.files.docx, 'notecord-export.docx')">DOCX</button>
              </div>
            </div>
          </template>
        </div>

        <div class="modal-actions">
          <button v-if="activeTab === 'theme'" class="btn btn-ghost" @click="themeStore.resetAll()">Reset all to default</button>
          <span v-else />
          <button class="btn btn-primary" @click="emit('close')">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useThemeStore, THEME_GROUPS } from '@/stores/themeStore'
import { getBackupStatus, downloadBackupFile, requestExport, getMyExportRequests } from '@/services/api'
import { formatNoteTimestamp } from '@/utils/dateUtils'

const emit = defineEmits(['close'])
const themeStore = useThemeStore()

const activeTab = ref('theme')

// Non-admin users get a 403 here — that's expected, not an error to
// surface; backupAccess just stays false and that section stays hidden.
const backupAccess = ref(false)
const backupRows = ref([])
let backupsFetched = false

const dbStatus = computed(() => backupRows.value.find((r) => r.type === 'db'))
const exportStatus = computed(() => backupRows.value.find((r) => r.type === 'export'))

// My export — every user, not just the admin. At most one request row ever
// exists per user (export-personal.js prunes older ones once a new one
// settles), so "the latest" is always "the current state."
const myExport = ref(null)
let pollHandle = null

const canRequestExport = computed(() => {
  const status = myExport.value?.status
  return !status || status === 'ready' || status === 'failed'
})

const myExportMeta = computed(() => {
  const r = myExport.value
  if (!r) return 'No export yet'
  if (r.status === 'pending' || r.status === 'processing') return 'Preparing…'
  if (r.status === 'failed') return `Failed: ${r.detail ?? 'unknown error'}`
  return `${formatNoteTimestamp(r.completed_at)} — ${r.detail}`
})

function stopPolling() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null }
}

function startPolling() {
  stopPolling()
  pollHandle = setInterval(async () => {
    const rows = await getMyExportRequests().catch(() => [])
    myExport.value = rows[0] ?? null
    if (canRequestExport.value) stopPolling()
  }, 3000)
}

async function requestMyExport() {
  myExport.value = await requestExport().catch((e) => { console.error('Request export failed:', e); return myExport.value })
  startPolling()
}

function selectBackupsTab() {
  activeTab.value = 'backups'
  if (backupsFetched) return
  backupsFetched = true
  getBackupStatus()
    .then((rows) => { backupRows.value = rows; backupAccess.value = true })
    .catch(() => { backupAccess.value = false })
  getMyExportRequests()
    .then((rows) => {
      myExport.value = rows[0] ?? null
      if (!canRequestExport.value) startPolling()
    })
    .catch(() => {})
}

function download(fileId, filename) {
  downloadBackupFile(fileId, filename).catch((e) => console.error('Backup download failed:', e))
}

onUnmounted(stopPolling)
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
  width: min(440px, calc(100vw - 2rem));
  max-height: min(600px, calc(100vh - 4rem));
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-4) var(--sp-4) var(--sp-3);
  flex-shrink: 0;
}

.modal-header h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-md);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

@media (hover: none) {
  .icon-btn {
    width: 36px;
    height: 36px;
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--sp-4) var(--sp-2);
}

/* ── Tabs ── */
.tab-bar {
  display: flex;
  gap: var(--sp-1);
  padding: 0 var(--sp-4) var(--sp-3);
  flex-shrink: 0;
}

.tab-btn {
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-muted);
  transition: color var(--t-fast), background var(--t-fast);
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tab-btn.active {
  color: var(--text-primary);
  background: var(--bg-hover);
  font-weight: 600;
}

/* ── Backups ── */
.backups-empty {
  padding: var(--sp-4) 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.backup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-top: 1px solid var(--border);
}

.backup-row:first-of-type {
  border-top: none;
}

.backup-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.backup-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.backup-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.backup-actions {
  display: flex;
  gap: var(--sp-1);
  flex-shrink: 0;
}

.theme-group {
  margin-bottom: var(--sp-4);
}

.group-label {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  padding: var(--sp-1) 0 var(--sp-2);
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--border);
}

.theme-group .color-row:first-of-type {
  border-top: none;
}

.color-name {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.color-controls {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-shrink: 0;
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  transition: color var(--t-fast), background var(--t-fast);
}

.reset-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.color-input {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  cursor: pointer;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.color-input::-webkit-color-swatch {
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}

@media (hover: none) {
  .reset-btn {
    width: 32px;
    height: 32px;
  }

  .color-input {
    width: 40px;
    height: 40px;
  }
}

.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4) var(--sp-4);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
</style>
