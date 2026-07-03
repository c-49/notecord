<template>
  <div class="image-attachment">
    <img :src="fileUrl" :alt="note.attachment_file?.filename_download ?? 'image'" loading="lazy" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getFileUrl } from '@/services/api'

const props = defineProps({
  note: { type: Object, required: true },
})

const fileUrl = computed(() => getFileUrl(props.note.attachment_file?.id))
</script>

<style scoped>
.image-attachment img {
  max-width: 400px;
  max-height: 300px;
  border-radius: var(--r-lg);
  object-fit: cover;
  display: block;
}
</style>
