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
        :style="progressStyle"
        @input="seek"
        class="scrubber-input"
      />
      <div class="voice-time">{{ formatTime(currentTime) }} / {{ duration > 0 ? formatTime(duration) : '--:--' }}</div>
    </div>

    <audio ref="audioEl" :src="audioUrl" preload="metadata"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMeta"
      @durationchange="onDurationChange"
      @seeked="onSeeked"
      @ended="onEnded"
    />
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { getFileUrl } from '@/services/api'

const props = defineProps({
  noteFile: { type: Object, required: true },
})

const audioEl = ref(null)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
let seekingForDuration = false

const audioUrl = computed(() => {
  const f = props.noteFile.file_id
  const id = typeof f === 'string' ? f : f?.id
  return getFileUrl(id)
})

const progressStyle = computed(() => {
  const pct = duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0
  return `--progress: ${pct.toFixed(1)}%`
})

function togglePlay() {
  if (!audioEl.value) return
  if (playing.value) {
    audioEl.value.pause()
    playing.value = false
  } else {
    audioEl.value.play().catch(() => {})
    playing.value = true
  }
}

function onTimeUpdate() {
  currentTime.value = audioEl.value?.currentTime ?? 0
}

function onMeta() {
  const d = audioEl.value?.duration ?? 0
  if (isFinite(d) && d > 0) {
    duration.value = d
  } else {
    // WebM files from MediaRecorder have Infinity duration — seek to end to detect real length
    seekingForDuration = true
    audioEl.value.currentTime = 1e10
  }
}

function onDurationChange() {
  const d = audioEl.value?.duration ?? 0
  if (isFinite(d) && d > 0) {
    duration.value = d
  }
}

function onSeeked() {
  if (seekingForDuration) {
    seekingForDuration = false
    duration.value = audioEl.value.currentTime
    currentTime.value = 0  // reset display before second seek fires timeupdate
    audioEl.value.currentTime = 0
  }
}

function onEnded() {
  playing.value = false
  currentTime.value = 0
}

function seek(e) {
  const t = parseFloat(e.target.value)
  if (audioEl.value && isFinite(t)) audioEl.value.currentTime = t
}

onBeforeUnmount(() => {
  audioEl.value?.pause()
})

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
  cursor: pointer;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--accent) var(--progress, 0%),
    var(--bg-hover) var(--progress, 0%)
  );
  outline: none;
}

.scrubber-input::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  transition: transform var(--t-fast);
}

.scrubber-input::-webkit-slider-thumb:hover {
  transform: scale(1.3);
}

.scrubber-input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  cursor: pointer;
}

.voice-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
