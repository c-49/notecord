<template>
  <button
    class="voice-btn"
    :class="{ recording }"
    @click="toggle"
    :title="recording ? 'Stop recording' : 'Record a voice note'"
    :aria-label="recording ? 'Stop recording' : 'Record voice note'"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1a4 4 0 014 4v7a4 4 0 01-8 0V5a4 4 0 014-4z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  </button>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['recording-complete'])

const recording = ref(false)
let mediaRecorder = null
const chunks = []

async function toggle() {
  if (recording.value) {
    mediaRecorder?.stop()
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks.length = 0
      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        emit('recording-complete', blob)
        stream.getTracks().forEach((t) => t.stop())
        recording.value = false
      }
      mediaRecorder.start()
      recording.value = true
    } catch {
      alert('Microphone access is required to record voice notes.')
    }
  }
}
</script>

<style scoped>
.voice-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--r-full);
  color: var(--text-muted);
  transition: color var(--t-base), background var(--t-base);
  flex-shrink: 0;
}

.voice-btn:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.voice-btn.recording {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.15);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
