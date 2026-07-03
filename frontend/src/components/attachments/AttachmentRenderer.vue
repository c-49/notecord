<template>
  <ImageAttachment v-if="note.attachment_type === 'image'" :note="note" />
  <FileAttachment v-else-if="note.attachment_type === 'file'" :note="note" />
  <EmbedAttachment v-else-if="note.attachment_type === 'embed'" :note="note" />
  <VoiceAttachment v-else-if="note.attachment_type === 'voice'" :note="note" />
</template>

<script setup>
import ImageAttachment from './ImageAttachment.vue'
import FileAttachment from './FileAttachment.vue'
import EmbedAttachment from './EmbedAttachment.vue'
import VoiceAttachment from './VoiceAttachment.vue'

defineProps({
  note: { type: Object, required: true },
})
</script>
