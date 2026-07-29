<template>
  <div class="emoji-wrap">
    <div
      ref="swatchRef"
      class="emoji-display"
      role="button"
      tabindex="0"
      aria-label="Choose emoji"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
    >
      <span v-if="modelValue" class="emoji-value">{{ modelValue }}</span>
      <span v-else class="emoji-empty">{{ defaultChar }}</span>
      <button
        v-if="modelValue"
        class="emoji-clear"
        title="Remove emoji"
        @click.stop="clear"
      >
        ×
      </button>
      <div class="emoji-tooltip">
        <span class="tooltip-line">Click to choose emoji</span>
      </div>
    </div>

    <EmojiPickerPopover
      v-if="pickerOpen"
      :anchor-rect="anchorRect"
      @select="onSelect"
      @close="pickerOpen = false"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import EmojiPickerPopover from '@/components/EmojiPickerPopover.vue'

defineProps({
  modelValue: { type: String, default: '' },
  defaultChar: { type: String, default: '✦' },
})

const emit = defineEmits(['update:modelValue'])

const swatchRef = ref(null)
const pickerOpen = ref(false)
const anchorRect = ref(null)

function openPicker() {
  anchorRect.value = swatchRef.value.getBoundingClientRect()
  pickerOpen.value = true
}

function onSelect(emoji) {
  pickerOpen.value = false
  emit('update:modelValue', emoji)
}

function clear() {
  emit('update:modelValue', '')
}
</script>

<style scoped>
.emoji-wrap {
  flex-shrink: 0;
  width: 44px;
}

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

.emoji-clear {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  transition: color var(--t-fast), background var(--t-fast);
}

.emoji-clear:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
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
</style>
