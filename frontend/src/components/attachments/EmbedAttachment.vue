<template>
  <a class="embed-card" :href="note.embed_url" target="_blank" rel="noopener">
    <div class="embed-accent" />
    <div class="embed-body">
      <span class="embed-url">{{ hostname }}</span>
      <span class="embed-link">{{ note.embed_url }}</span>
    </div>
  </a>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  note: { type: Object, required: true },
})

const hostname = computed(() => {
  try {
    return new URL(props.note.embed_url).hostname
  } catch {
    return props.note.embed_url
  }
})
</script>

<style scoped>
.embed-card {
  display: flex;
  max-width: 432px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  text-decoration: none;
  transition: border-color var(--t-base);
}

.embed-card:hover {
  border-color: var(--border-strong);
  text-decoration: none;
}

.embed-accent {
  width: 4px;
  background: var(--accent);
  flex-shrink: 0;
}

.embed-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  overflow: hidden;
}

.embed-url {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.embed-link {
  font-size: var(--text-sm);
  color: var(--text-link);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
