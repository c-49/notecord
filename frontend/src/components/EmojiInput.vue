<template>
  <div class="emoji-wrap">
    <div
      v-if="!editing"
      class="emoji-display"
      role="button"
      tabindex="0"
      aria-label="Set emoji"
      @click="activate"
      @keydown.enter.prevent="activate"
    >
      <span v-if="modelValue" class="emoji-value">{{ modelValue }}</span>
      <span v-else class="emoji-empty">{{ defaultChar }}</span>
      <div class="emoji-tooltip">
        <span class="tooltip-line">Click to set emoji</span>
        <span class="tooltip-shortcut">
          <kbd>Win</kbd><span>+</span><kbd>.</kbd>
          &nbsp;·&nbsp;
          <kbd>⌘</kbd><kbd>⌃</kbd><kbd>Space</kbd>
        </span>
      </div>
    </div>

    <div v-else class="emoji-editing">
      <input
        ref="inputEl"
        class="emoji-field"
        :value="modelValue"
        placeholder="😊"
        @input="onInput"
        @keydown.enter.prevent="deactivate"
        @keydown.escape="cancel"
        @blur="deactivate"
      />
      <span class="emoji-hint">Win+. or ⌘⌃Space</span>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  defaultChar: { type: String, default: '✦' },
})

const emit = defineEmits(['update:modelValue'])

const editing = ref(false)
const inputEl = ref(null)
let valueOnOpen = ''

function activate() {
  valueOnOpen = props.modelValue
  editing.value = true
  nextTick(() => {
    inputEl.value?.focus()
    inputEl.value?.select()
  })
}

function onInput(e) {
  const raw = e.target.value.trim()
  if (!raw) { emit('update:modelValue', ''); return }
  try {
    const segs = [...new Intl.Segmenter().segment(raw)]
    emit('update:modelValue', segs[0]?.segment ?? raw.slice(0, 4))
  } catch {
    emit('update:modelValue', raw.slice(0, 4))
  }
}

function deactivate() {
  editing.value = false
}

function cancel() {
  emit('update:modelValue', valueOnOpen)
  editing.value = false
}
</script>

<style scoped>
.emoji-wrap {
  flex-shrink: 0;
  width: 44px;
}

/* ── Display mode ── */
.emoji-display {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  border: 1.5px solid var(--border-strong);
  background: var(--bg-input);
  transition: border-color var(--t-base), background var(--t-base);
  user-select: none;
}

.emoji-display:hover,
.emoji-display:focus {
  border-color: var(--accent);
  background: var(--bg-hover);
  outline: none;
}

.emoji-display:hover .emoji-tooltip,
.emoji-display:focus .emoji-tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: none;
}

.emoji-empty {
  font-size: 16px;
  color: var(--text-muted);
  opacity: 0.5;
}

/* ── Tooltip ── */
.emoji-tooltip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--bg-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-lg);
  padding: var(--sp-2) var(--sp-3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity var(--t-base), transform var(--t-base);
  box-shadow: var(--shadow-md);
  z-index: 20;
}

.emoji-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--border-strong);
}

.tooltip-line {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

.tooltip-shortcut {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-muted);
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 1px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ── Edit mode ── */
.emoji-editing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.emoji-field {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
  text-align: center;
  cursor: text;
  border: 1.5px solid var(--accent);
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
  padding: 0;
}

.emoji-hint {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}
</style>
