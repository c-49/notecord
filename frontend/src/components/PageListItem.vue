<template>
  <RouterLink
    :to="`/page/${page.id}`"
    class="page-item"
    :class="{ active: isActive }"
    @click="navStore.setActivePage(page.id)"
  >
    <span class="page-icon">{{ page.emoji ?? '#' }}</span>
    <span class="page-name">{{ page.name }}</span>
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useNavStore } from '@/stores/navStore'

const props = defineProps({
  page: { type: Object, required: true },
})

const navStore = useNavStore()
const route = useRoute()

const isActive = computed(() => route.params.pageId === String(props.page.id))
</script>

<style scoped>
.page-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  margin: 1px var(--sp-2);
  border-radius: var(--r-md);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-decoration: none;
  transition: color var(--t-base), background var(--t-base);
  cursor: pointer;
}

.page-item:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
  text-decoration: none;
}

.page-item.active {
  color: var(--text-primary);
  background: var(--bg-active);
}

.page-icon {
  font-size: var(--text-sm);
  flex-shrink: 0;
}

.page-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
