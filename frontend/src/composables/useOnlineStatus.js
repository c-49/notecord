import { ref, onMounted, onUnmounted } from 'vue'

const PROBE_INTERVAL_MS = 15000

// navigator.onLine (and the online/offline events) aren't reliable everywhere
// — e.g. Brave's DevTools "Offline" network throttling doesn't flip it, so a
// browser can be fully cut off from the network while navigator.onLine still
// reports true. Actively probing Directus itself is the only signal that
// actually reflects whether requests will succeed.
export function useOnlineStatus() {
  const isOnline = ref(navigator.onLine)
  let intervalId = null

  async function probe() {
    if (!navigator.onLine) {
      isOnline.value = false
      return
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_DIRECTUS_URL}/server/ping`, { cache: 'no-store' })
      isOnline.value = res.ok
    } catch {
      isOnline.value = false
    }
  }

  onMounted(() => {
    probe()
    window.addEventListener('online', probe)
    window.addEventListener('offline', probe)
    intervalId = setInterval(probe, PROBE_INTERVAL_MS)
  })

  onUnmounted(() => {
    window.removeEventListener('online', probe)
    window.removeEventListener('offline', probe)
    clearInterval(intervalId)
  })

  return { isOnline }
}
