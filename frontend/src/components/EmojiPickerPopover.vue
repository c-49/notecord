<template>
  <Teleport to="body">
    <div class="emoji-picker-backdrop" @click.self="close" @contextmenu.self.prevent="close">
      <div class="emoji-picker-pop" :style="popStyle">
        <!-- Optional quick-pick row — callers opt in by passing quickEmojis
             (e.g. NoteReactions.vue passes the user's editable quick-react
             set; callers that don't care about it, like EmojiInput.vue for
             section/page icons, just omit the prop). -->
        <div v-if="quickEmojis.length" class="quick-row">
          <button
            v-for="e in quickEmojis"
            :key="e"
            class="quick-emoji"
            :title="`Pick ${e}`"
            @click="selectQuick(e)"
          >
            {{ e }}
          </button>
        </div>
        <emoji-picker ref="pickerElRef" class="picker-el" @emoji-click="onEmojiClick" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue'
import 'emoji-picker-element'

const props = defineProps({
  // A plain { top, bottom, left, right } snapshot from the trigger button's
  // getBoundingClientRect() — a snapshot rather than a live ref because the
  // button that opened this is about to get an "active" state anyway, and
  // re-measuring on every scroll/resize isn't worth it for a popover this
  // short-lived (closes on any outside click).
  anchorRect: { type: Object, required: true },
  quickEmojis: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'close'])

// emoji-picker-element's own default size — kept in sync with .picker-el
// below so the viewport-edge clamping math matches what's actually rendered.
const PICKER_WIDTH = 352
const PICKER_HEIGHT = 400
// 8px padding top+bottom + 36px emoji buttons + 1px border — only affects
// whether the popover flips above/below the anchor near a viewport edge,
// so it doesn't need to be pixel-exact.
const QUICK_ROW_HEIGHT = 53
const MARGIN = 8

const popStyle = computed(() => {
  const { top, bottom, left } = props.anchorRect
  const totalHeight = PICKER_HEIGHT + (props.quickEmojis.length ? QUICK_ROW_HEIGHT : 0)
  const x = Math.min(Math.max(MARGIN, left), window.innerWidth - PICKER_WIDTH - MARGIN)
  const wouldOverflowBelow = bottom + 6 + totalHeight > window.innerHeight - MARGIN
  const y = wouldOverflowBelow ? Math.max(MARGIN, top - totalHeight - 6) : bottom + 6
  return { left: `${x}px`, top: `${y}px` }
})

function onEmojiClick(e) {
  emit('select', e.detail.unicode)
}

function selectQuick(emoji) {
  emit('select', emoji)
}

function close() {
  emit('close')
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

const pickerElRef = ref(null)

// emoji-picker-element has its own internal, usage-count-based "Favorites"
// section built into the grid (no public API to disable or control it).
// Showing it alongside a caller-supplied quick row above would be
// confusing (two different-looking "favorites" that don't stay in sync,
// one of them not editable at all) — and even with no quick row supplied,
// it's still an uncontrollable, usage-tracked list that doesn't fit this
// app's "everything is explicit" ethos. Hide it directly in its shadow DOM
// instead, since that's the only lever available; low risk since it's just
// a display:none on one CSS class, but worth re-checking after any future
// emoji-picker-element version bump in case its internals change.
async function hideBuiltInFavorites() {
  await nextTick()
  const root = pickerElRef.value?.shadowRoot
  if (!root || root.querySelector('#hide-favorites-style')) return
  const style = document.createElement('style')
  style.id = 'hide-favorites-style'
  style.textContent = '.favorites { display: none !important; }'
  root.appendChild(style)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  hideBuiltInFavorites()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.emoji-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.emoji-picker-pop {
  position: fixed;
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: var(--sp-2);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-strong);
}

.quick-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 20px;
  line-height: 1;
  border-radius: var(--r-md);
  background: var(--bg-input);
  transition: background var(--t-fast);
}

.quick-emoji:hover {
  background: var(--bg-hover);
}

.picker-el {
  width: 352px;
  height: 400px;
  /* emoji-picker-element's own theming hooks, mapped onto NoteCord's
     existing CSS variables so it follows both the light/dark theme and any
     user color customizations from ThemeCustomizer.vue automatically. */
  --background: var(--bg-secondary);
  --border-color: var(--border-strong);
  --indicator-color: var(--accent);
  --input-border-color: var(--border-strong);
  --input-font-color: var(--text-primary);
  --input-placeholder-color: var(--text-muted);
  --category-font-color: var(--text-secondary);
  --button-hover-background: var(--bg-hover);
  --button-active-background: var(--bg-hover);
  --outline-color: var(--accent);
}
</style>
