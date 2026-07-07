<template>
  <div class="image-attachment">
    <img
      :src="fileUrl"
      :alt="altText"
      loading="lazy"
      class="thumb"
      :class="{ loaded }"
      @load="loaded = true"
      @error="broken = true"
      @click="lightboxOpen = true"
    />

    <!-- Broken image fallback -->
    <div v-if="broken" class="broken">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>Image unavailable</span>
    </div>

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="lightboxOpen" class="lightbox" @click.self="lightboxOpen = false" @keydown.esc="lightboxOpen = false" tabindex="-1">
        <button class="lightbox-close" @click="lightboxOpen = false" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
        <img :src="fileUrl" :alt="altText" class="lightbox-img" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getFileUrl } from '@/services/api'

const props = defineProps({
  noteFile: { type: Object, required: true },
})

const loaded = ref(false)
const broken = ref(false)
const lightboxOpen = ref(false)

// file_id may be a UUID string (right after create) or a full object (after fetch)
const fileId = computed(() => {
  const f = props.noteFile.file_id
  return typeof f === 'string' ? f : f?.id
})

const altText = computed(() => {
  const f = props.noteFile.file_id
  return (typeof f === 'object' ? f?.filename_download : null) ?? 'image'
})

// While an attachment's upload is still queued (offline or in progress),
// there's no real Directus file yet — show the local blob preview instead.
const fileUrl = computed(() => props.noteFile._previewUrl ?? getFileUrl(fileId.value))

// Reset state when file changes
watch(fileId, () => {
  loaded.value = false
  broken.value = false
})

// Trap focus and close on Escape when lightbox is open
watch(lightboxOpen, async (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
  } else {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onKey)
  }
})

function onKey(e) {
  if (e.key === 'Escape') lightboxOpen.value = false
}
</script>

<style scoped>
.image-attachment {
  position: relative;
  display: inline-block;
  width: 160px;
  height: 160px;
  max-width: 100%;
}

.thumb {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--r-lg);
  /* Fixed-size, cropped tile so multiple images in a note line up uniformly
     regardless of their original aspect ratio — the lightbox still shows the
     untouched image. */
  object-fit: cover;
  cursor: zoom-in;
  opacity: 0;
  transition: opacity var(--t-base);
  background: var(--bg-input);
}

.thumb.loaded {
  opacity: 1;
}

.broken {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  padding: var(--sp-2);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-align: center;
}

/* Lightbox */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  cursor: zoom-out;
  padding: var(--sp-8);
}

.lightbox-close {
  position: absolute;
  top: var(--sp-4);
  right: var(--sp-4);
  width: 36px;
  height: 36px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--t-base);
  z-index: 201;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

@media (hover: none) {
  .lightbox-close {
    width: 44px;
    height: 44px;
  }
}

.lightbox-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--r-lg);
  cursor: default;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8);
}
</style>
