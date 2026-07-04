<template>
  <AppShell />
</template>

<script setup>
import AppShell from '@/components/AppShell.vue'
import { useThemeStore } from '@/stores/themeStore'

// Instantiating the store applies any saved color overrides immediately,
// before first paint, so there's no flash of the default theme.
useThemeStore()
</script>
