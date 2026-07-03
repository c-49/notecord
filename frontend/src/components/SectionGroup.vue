<template>
  <div class="section-group">
    <button class="section-header" @click="collapsed = !collapsed" @contextmenu.prevent="showMenu = true">
      <svg class="chevron" :class="{ collapsed }" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="section-name">{{ section.emoji ? `${section.emoji} ` : '' }}{{ section.name }}</span>
    </button>

    <nav v-show="!collapsed">
      <PageListItem
        v-for="page in section.pages"
        :key="page.id"
        :page="page"
      />
      <button class="add-page-btn" @click="addPageToSection">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        New page
      </button>
    </nav>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useNavStore } from '@/stores/navStore'
import PageListItem from '@/components/PageListItem.vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  section: { type: Object, required: true },
})

const collapsed = ref(false)
const navStore = useNavStore()
const router = useRouter()

async function addPageToSection() {
  const name = prompt('Page name:')
  if (!name?.trim()) return
  const page = await navStore.addPage(name.trim(), props.section.id)
  router.push(`/page/${page.id}`)
}
</script>

<style scoped>
.section-group {
  margin-bottom: var(--sp-1);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  width: 100%;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-sm);
  margin: 0 var(--sp-2);
  width: calc(100% - var(--sp-4));
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
}

.section-header:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.chevron {
  transition: transform var(--t-base);
  flex-shrink: 0;
}

.chevron.collapsed {
  transform: rotate(-90deg);
}

.section-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-page-btn {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3) var(--sp-1) calc(var(--sp-6) + var(--sp-2));
  width: 100%;
  font-size: var(--text-xs);
  color: var(--text-muted);
  border-radius: var(--r-sm);
  transition: color var(--t-base), background var(--t-base);
}

.add-page-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}
</style>
