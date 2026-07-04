<template>
  <!-- Expanded recording bar -->
  <div v-if="recording || paused" class="rec-bar">
    <button class="rec-btn rec-discard" title="Discard" @click="discard">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>

    <span class="rec-indicator" :class="{ paused }">
      <span class="rec-dot" />
    </span>

    <span class="rec-timer">{{ formatTime(elapsed) }}</span>

    <button class="rec-btn rec-pause" :title="paused ? 'Resume' : 'Pause'" @click="togglePause">
      <!-- Resume (play) -->
      <svg v-if="paused" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 3l14 9-14 9V3z"/>
      </svg>
      <!-- Pause -->
      <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
      </svg>
    </button>

    <button class="rec-btn rec-stop" title="Stop and attach" @click="stop">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2"/>
      </svg>
      <span class="rec-stop-label">Stop</span>
    </button>
  </div>

  <!-- Idle mic button -->
  <button v-else class="voice-btn" :class="{ error: micError }" :title="micError || 'Record a voice note'" @click="start">
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
const paused = ref(false)
const micError = ref('')
const elapsed = ref(0)
let mediaRecorder = null
let chunks = []
let timerHandle = null

function getPreferredMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

function formatTime(s) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function startTimer() {
  timerHandle = setInterval(() => { elapsed.value++ }, 1000)
}

function stopTimer() {
  clearInterval(timerHandle)
  timerHandle = null
}

async function start() {
  micError.value = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks = []
    elapsed.value = 0

    const mimeType = getPreferredMimeType()
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      stopTimer()
      stream.getTracks().forEach((t) => t.stop())
      recording.value = false
      paused.value = false
    }

    mediaRecorder.start(100)
    recording.value = true
    startTimer()
  } catch (err) {
    micError.value = err.name === 'NotAllowedError' ? 'Microphone access denied' : 'Microphone unavailable'
    setTimeout(() => { micError.value = '' }, 3000)
  }
}

function stop() {
  if (!mediaRecorder) return
  const wasPaused = paused.value
  if (wasPaused) {
    // resume so onstop fires cleanly, then immediately stop
    mediaRecorder.resume()
  }
  mediaRecorder.addEventListener('stop', () => {
    const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' })
    emit('recording-complete', blob)
  }, { once: true })
  mediaRecorder.stop()
}

function togglePause() {
  if (!mediaRecorder) return
  if (paused.value) {
    mediaRecorder.resume()
    paused.value = false
    startTimer()
  } else {
    mediaRecorder.pause()
    paused.value = true
    stopTimer()
  }
}

function discard() {
  if (!mediaRecorder) return
  stopTimer()
  mediaRecorder.addEventListener('stop', () => {
    // discard — don't emit
    recording.value = false
    paused.value = false
    chunks = []
  }, { once: true })
  if (paused.value) mediaRecorder.resume()
  mediaRecorder.stop()
}
</script>

<style scoped>
/* ── Idle mic button ── */
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

.voice-btn.error {
  color: var(--accent-danger);
}

@media (hover: none) {
  .voice-btn {
    width: 40px;
    height: 40px;
  }
}

/* On narrow screens the recording bar (discard + timer + pause + stop) competes
   with the composer's other controls for space and squeezes the text editor
   down to near-nothing. Drop it to its own full-width row instead — requires
   .composer-row to allow wrapping, see NoteComposer.vue. */
@media (max-width: 480px) {
  .rec-bar {
    flex-basis: 100%;
    order: 10;
    justify-content: center;
  }
}

/* ── Recording bar ── */
.rec-bar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  background: rgba(218, 55, 60, 0.1);
  border: 1px solid rgba(218, 55, 60, 0.3);
  border-radius: var(--r-full);
  padding: 3px 3px 3px var(--sp-2);
  flex-shrink: 0;
}

.rec-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-full);
  transition: background var(--t-fast), color var(--t-fast);
  flex-shrink: 0;
}

/* Discard */
.rec-discard {
  width: 24px;
  height: 24px;
  color: var(--text-muted);
}

.rec-discard:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.15);
}

/* Pause/Resume */
.rec-pause {
  width: 26px;
  height: 26px;
  color: var(--text-secondary);
}

.rec-pause:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* Stop */
.rec-stop {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px var(--sp-3) 4px var(--sp-2);
  background: var(--accent-danger);
  color: #fff;
  border-radius: var(--r-full);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.rec-stop:hover {
  filter: brightness(1.1);
}

@media (hover: none) {
  .rec-discard {
    width: 34px;
    height: 34px;
  }

  .rec-pause {
    width: 36px;
    height: 36px;
  }

  .rec-stop {
    height: 36px;
  }
}

/* The recording bar's children (discard + dot + timer + pause + "Stop" pill)
   don't wrap; drop the "Stop" text at narrow widths so the bar keeps fitting
   next to the file/send buttons in the composer row instead of overflowing it.
   Width-based (not hover-based) since a narrow desktop window has the same problem. */
@media (max-width: 420px) {
  .rec-stop-label {
    display: none;
  }

  .rec-stop {
    width: 36px;
    padding: 0;
  }
}

/* Timer */
.rec-timer {
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--accent-danger);
  white-space: nowrap;
  min-width: 28px;
  text-align: center;
}

/* Pulsing dot */
.rec-indicator {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-danger);
  animation: blink 1s ease-in-out infinite;
}

.rec-indicator.paused .rec-dot {
  animation: none;
  opacity: 0.4;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
</style>
