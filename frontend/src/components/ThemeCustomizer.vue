<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal">
        <div class="modal-header">
          <h3>Customize Theme</h3>
          <button class="icon-btn" aria-label="Close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="modal-body">
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

        <div class="modal-actions">
          <button class="btn btn-ghost" @click="themeStore.resetAll()">Reset all to default</button>
          <button class="btn btn-primary" @click="emit('close')">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useThemeStore, THEME_GROUPS } from '@/stores/themeStore'

const emit = defineEmits(['close'])
const themeStore = useThemeStore()
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
