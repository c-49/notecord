import { defineStore } from 'pinia'
import { reactive } from 'vue'

const STORAGE_KEY = 'notecord-theme-overrides'

export const THEME_GROUPS = [
  {
    label: 'Backgrounds',
    vars: [
      { key: '--bg-primary', label: 'Primary background' },
      { key: '--bg-secondary', label: 'Secondary background' },
      { key: '--bg-tertiary', label: 'Tertiary background' },
      { key: '--bg-hover', label: 'Hover background' },
      { key: '--bg-active', label: 'Active background' },
      { key: '--bg-input', label: 'Input background' },
    ],
  },
  {
    label: 'Text',
    vars: [
      { key: '--text-primary', label: 'Primary text' },
      { key: '--text-secondary', label: 'Secondary text' },
      { key: '--text-muted', label: 'Muted text' },
      { key: '--text-link', label: 'Links' },
    ],
  },
  {
    label: 'Accent',
    vars: [
      { key: '--accent', label: 'Accent' },
      { key: '--accent-hover', label: 'Accent (hover)' },
      { key: '--accent-danger', label: 'Danger' },
      { key: '--accent-success', label: 'Success' },
    ],
  },
]

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

export const useThemeStore = defineStore('theme', () => {
  const overrides = reactive(loadOverrides())

  // Apply saved overrides immediately so the store's mere creation (from
  // App.vue's setup, before first paint) is enough to restore a saved theme.
  for (const [key, value] of Object.entries(overrides)) {
    document.documentElement.style.setProperty(key, value)
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  }

  function defaultValue(key) {
    return getComputedStyle(document.documentElement).getPropertyValue(key).trim()
  }

  function getValue(key) {
    return overrides[key] ?? defaultValue(key)
  }

  function isOverridden(key) {
    return key in overrides
  }

  function setColor(key, value) {
    overrides[key] = value
    document.documentElement.style.setProperty(key, value)
    persist()
  }

  function resetColor(key) {
    delete overrides[key]
    document.documentElement.style.removeProperty(key)
    persist()
  }

  function resetAll() {
    for (const key of Object.keys(overrides)) {
      document.documentElement.style.removeProperty(key)
      delete overrides[key]
    }
    persist()
  }

  return { overrides, getValue, isOverridden, setColor, resetColor, resetAll }
})
