<template>
  <ImageAttachment v-if="noteFile.attachment_type === 'image'" :note-file="noteFile" />
  <FileAttachment v-else-if="noteFile.attachment_type === 'file'" :note-file="noteFile" />
  <EmbedAttachment v-else-if="noteFile.attachment_type === 'embed'" :note-file="noteFile" />
  <VoiceAttachment v-else-if="noteFile.attachment_type === 'voice'" :note-file="noteFile" />
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
