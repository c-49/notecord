import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { updateMyQuickReactions } from '@/services/api'

export const MAX_QUICK_REACTIONS = 8

// Discord's own defaults, close enough — used whenever the user's
// quick_reactions field is null/empty (never saved yet, or reset).
export const DEFAULT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

// Stored server-side on directus_users.quick_reactions (self-only read/write
// — see setup-schema.js) rather than localStorage, so it follows the user
// across devices/browsers like everything else in this app, unlike
// themeStore.js's per-browser color overrides which are deliberately local.
export const useQuickReactionsStore = defineStore('quickReactions', () => {
  const authStore = useAuthStore()

  // Only a genuinely unset field (null/undefined — never saved, or a brand
  // new account) falls back to the defaults. An explicit empty array (the
  // user removed every chip) must NOT fall back here, or removing the last
  // one would look like it silently undid itself back to the full default
  // set the instant it was removed.
  const emojis = computed(() => {
    const saved = authStore.user?.quick_reactions
    return Array.isArray(saved) ? saved : DEFAULT_QUICK_REACTIONS
  })

  async function persist(next) {
    const prev = authStore.user.quick_reactions
    authStore.user.quick_reactions = next // optimistic
    try {
      await updateMyQuickReactions(next)
    } catch (e) {
      authStore.user.quick_reactions = prev
      throw e
    }
  }

  async function addEmoji(emoji) {
    if (emojis.value.includes(emoji) || emojis.value.length >= MAX_QUICK_REACTIONS) return
    await persist([...emojis.value, emoji])
  }

  async function removeEmoji(emoji) {
    await persist(emojis.value.filter((e) => e !== emoji))
  }

  async function resetToDefault() {
    await persist([...DEFAULT_QUICK_REACTIONS])
  }

  return { emojis, addEmoji, removeEmoji, resetToDefault }
})
