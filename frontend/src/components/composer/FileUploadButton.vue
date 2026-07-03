<template>
  <label class="upload-btn" title="Attach a file or image">
    <input type="file" class="file-input" @change="onFile" />
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
    </svg>
  </label>
</template>

<script setup>
const emit = defineEmits(['file-selected'])

function onFile(e) {
  const file = e.target.files?.[0]
  if (file) emit('file-selected', file)
  e.target.value = ''
}
</script>

<style scoped>
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-full);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--t-base), background var(--t-base);
  flex-shrink: 0;
}

.upload-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.file-input {
  display: none;
}
</style>
