<template>
  <div v-if="groups.length" class="reactions-row">
    <button
      v-for="g in groups"
      :key="g.emoji"
      class="reaction-pill"
      :class="{ mine: g.mine }"
      :title="g.tooltip"
      @click="toggle(g.emoji)"
    >
      <span class="reaction-emoji">{{ g.emoji }}</span>
      <span class="reaction-count">{{ g.count }}</span>
    </button>
  </div>

  <EmojiPickerPopover
    v-if="pickerOpen"
    :anchor-rect="anchorRect"
    :quick-emojis="quickReactionsStore.emojis"
    @select="onSelect"
    @close="pickerOpen = false"
  />
</template>

<script setup>
import { computed, ref, inject } from 'vue'
import groupBy from 'lodash/groupBy'
import { useNotesStore, notesStoreKey } from '@/stores/notesStore'
import { useAuthStore } from '@/stores/authStore'
import { useQuickReactionsStore } from '@/stores/quickReactionsStore'
import EmojiPickerPopover from '@/components/EmojiPickerPopover.vue'

const props = defineProps({
  note: { type: Object, required: true },
})

const notesStore = inject(notesStoreKey, useNotesStore())
const authStore = useAuthStore()
const quickReactionsStore = useQuickReactionsStore()

function reactorLabel(r) {
  if (r.user_id?.id === authStore.user?.id) return 'You'
  const name = [r.user_id?.first_name, r.user_id?.last_name].filter(Boolean).join(' ')
  return name || r.user_id?.email?.split('@')[0] || 'Someone'
}

// Discord-style summary text: "You reacted", "You and Alice reacted",
// "Alice, Bob, and Carol reacted", "You, Alice, and 3 others reacted".
function formatNames(names) {
  if (names.length === 1) return `${names[0]} reacted`
  if (names.length === 2) return `${names[0]} and ${names[1]} reacted`
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} reacted`
  return `${names.slice(0, 3).join(', ')}, and ${names.length - 3} others reacted`
}

const groups = computed(() => {
  const byEmoji = groupBy(props.note.reactions ?? [], 'emoji')
  return Object.entries(byEmoji).map(([emoji, rows]) => {
    const names = rows.map(reactorLabel)
    // "You" sorts first, matching the ordering Discord's own tooltip uses.
    names.sort((a, b) => (a === 'You' ? -1 : b === 'You' ? 1 : 0))
    return {
      emoji,
      count: rows.length,
      mine: rows.some((r) => r.user_id?.id === authStore.user?.id),
      tooltip: `${formatNames(names)} with ${emoji}`,
    }
  })
})

function toggle(emoji) {
  notesStore.toggleReaction(props.note.id, emoji)
}

const pickerOpen = ref(false)
const anchorRect = ref(null)

// Called by NoteBlock.vue's "add reaction" toolbar button, passing itself as
// the anchor — kept here rather than duplicated in NoteBlock so all
// reaction-picking logic (open/select/toggle) lives in one place.
function openPicker(anchorEl) {
  anchorRect.value = anchorEl.getBoundingClientRect()
  pickerOpen.value = true
}

function onSelect(emoji) {
  pickerOpen.value = false
  toggle(emoji)
}

// toggle is also exposed for NoteContextMenu.vue's quick-react row, which
// calls straight into it (no picker involved) — same as this component's
// own reaction pills already do.
defineExpose({ openPicker, toggle })
</script>

<style scoped>
.reactions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.reaction-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: var(--r-lg);
  border: 1px solid var(--border-strong);
  background: var(--bg-input);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  line-height: 1.6;
  transition: background var(--t-fast), border-color var(--t-fast);
}

.reaction-pill:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.reaction-pill.mine {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-input));
  color: var(--text-primary);
}

.reaction-emoji {
  font-size: 14px;
  line-height: 1;
}

.reaction-count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
