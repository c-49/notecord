<template>
  <div class="attachment-wrap">
    <ImageAttachment v-if="noteFile.attachment_type === 'image'" :note-file="noteFile" />
    <FileAttachment v-else-if="noteFile.attachment_type === 'file'" :note-file="noteFile" />
    <EmbedAttachment v-else-if="noteFile.attachment_type === 'embed'" :note-file="noteFile" />
    <VoiceAttachment v-else-if="noteFile.attachment_type === 'voice'" :note-file="noteFile" />

    <!-- Shown while a file/image/voice attachment is queued for upload
         (offline, or just about to sync) — embeds never have this since
         they don't need an upload. -->
    <span v-if="noteFile._pendingFile" class="uploading-badge">Uploading…</span>
  </div>
</template>

<script setup>
import ImageAttachment from './ImageAttachment.vue'
import FileAttachment from './FileAttachment.vue'
import EmbedAttachment from './EmbedAttachment.vue'
import VoiceAttachment from './VoiceAttachment.vue'

defineProps({
  noteFile: { type: Object, required: true },
})
</script>

<style scoped>
.attachment-wrap {
  position: relative;
  display: inline-block;
}

.uploading-badge {
  position: absolute;
  top: var(--sp-1);
  left: var(--sp-1);
  padding: 2px var(--sp-2);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--r-full);
  pointer-events: none;
}
</style>
