<template>
  <div class="voice-attachment">
    <button class="play-btn" @click="togglePlay" :aria-label="playing ? 'Pause' : 'Play'">
      <svg v-if="!playing" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 3l14 9-14 9V3z"/>
      </svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1"/>
        <rect x="14" y="4" width="4" height="16" rx="1"/>
      </svg>
    </button>

    <div class="voice-scrubber">
      <input
        type="range"
        :max="duration || 100"
        :value="currentTime"
        @input="seek"
        class="scrubber-input"
      />
      <div class="voice-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</div>
    </div>

    <audio ref="audioEl" :src="audioUrl" @timeupdate="onTimeUpdate" @loadedmetadata="onMeta" @ended="playing = false" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getFileUrl } from '@/services/api'

const props = defineProps({
  note: { type: Object, required: true },
})

const audioEl = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)

const audioUrl = computed(() => getFileUrl(props.note.attachment_file?.id))

function togglePlay() {
  if (!audioEl.value) return
  if (playing.value) {
    audioEl.value.pause()
    playing.value = false
  } else {
    audioEl.value.play()
    playing.value = true
  }
}

function onTimeUpdate() {
  currentTime.value = audioEl.value?.currentTime ?? 0
}

function onMeta() {
  duration.value = audioEl.value?.duration ?? 0
}

function seek(e) {
  if (audioEl.value) audioEl.value.currentTime = e.target.value
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}
</script>

<style scoped>
.voice-attachment {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-2xl);
  max-width: 320px;
}

.play-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--r-full);
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--t-base);
}

.play-btn:hover {
  background: var(--accent-hover);
}

.voice-scrubber {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scrubber-input {
  width: 100%;
  accent-color: var(--accent);
  cursor: pointer;
}

.voice-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
