<template>
  <Teleport to="body">
    <div class="context-menu-backdrop" @click.self="close" @contextmenu.self.prevent="close">
      <div class="context-menu" :style="menuStyle">
        <div class="quick-react-row">
          <button
            v-for="e in quickEmojis"
            :key="e"
            class="quick-emoji"
            :title="`React with ${e}`"
            @click="react(e)"
          >
            {{ e }}
          </button>
          <button class="quick-emoji quick-emoji-expand" title="More reactions" @click="$emit('expand')">
            ➕
          </button>
        </div>

        <div class="menu-sep" />

        <button v-if="canCreateThread" class="menu-item" @click="emitAndClose('create-thread')">
          <span class="menu-icon">🧵</span> Create Thread
        </button>
        <button class="menu-item" @click="emitAndClose('toggle-pin')">
          <span class="menu-icon">📌</span> {{ pinned ? 'Unpin Note' : 'Pin Note' }}
        </button>
        <button class="menu-item menu-danger" @click="emitAndClose('delete')">
          <span class="menu-icon">🗑️</span> Delete Note
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  // Same { top, bottom, left, right } getBoundingClientRect() snapshot
  // approach EmojiPickerPopover.vue already uses — see its own prop comment
  // for why a snapshot rather than a live ref.
  anchorRect: { type: Object, required: true },
  quickEmojis: { type: Array, default: () => [] },
  pinned: { type: Boolean, default: false },
  canCreateThread: { type: Boolean, default: true },
})

const emit = defineEmits(['react', 'expand', 'create-thread', 'toggle-pin', 'delete', 'close'])

// Same size-class constants as EmojiPickerPopover.vue, sized for this
// menu's actual content instead of the emoji picker's.
const MENU_WIDTH = 200
const MENU_HEIGHT = 220
const MARGIN = 8

const menuStyle = computed(() => {
  const { top, bottom, left } = props.anchorRect
  const x = Math.min(Math.max(MARGIN, left), window.innerWidth - MENU_WIDTH - MARGIN)
  const wouldOverflowBelow = bottom + 6 + MENU_HEIGHT > window.innerHeight - MARGIN
  const y = wouldOverflowBelow ? Math.max(MARGIN, top - MENU_HEIGHT - 6) : bottom + 6
  return { left: `${x}px`, top: `${y}px` }
})

function react(emoji) {
  emit('react', emoji)
  close()
}

function emitAndClose(name) {
  emit(name)
  close()
}

function close() {
  emit('close')
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.context-menu {
  position: fixed;
  width: 200px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--sp-2);
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.quick-react-row {
  display: flex;
  gap: 4px;
  padding-bottom: var(--sp-1);
}

.quick-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  font-size: 17px;
  line-height: 1;
  border-radius: var(--r-md);
  background: var(--bg-input);
  transition: background var(--t-fast);
}

.quick-emoji:hover {
  background: var(--bg-hover);
}

.quick-emoji-expand {
  font-size: 14px;
}

.menu-sep {
  height: 1px;
  background: var(--border);
  margin: var(--sp-1) 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2) var(--sp-2);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-align: left;
  transition: background var(--t-fast), color var(--t-fast);
}

.menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.menu-icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

.menu-danger {
  color: var(--accent-danger);
}

.menu-danger:hover {
  background: rgba(218, 55, 60, 0.12);
  color: var(--accent-danger);
}
</style>
