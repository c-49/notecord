import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as apiLogin, logout as apiLogout, refreshSession, getCurrentUser } from '@/services/api'
import { clearAll as clearOfflineData } from '@/services/offlineData'

// Doesn't grant any real API access by itself — Directus's httpOnly
// refresh-token cookie is the actual authority. This just lets a reload
// with no network fall back to "was authenticated last time we could check"
// instead of bouncing straight to the login screen (the whole point of the
// offline-first app shell is to work with no network at all).
const AUTH_FLAG_KEY = 'notecord-was-authenticated'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const status = ref('checking') // 'checking' | 'authenticated' | 'unauthenticated'
  const error = ref(null)

  // Memoized so the router guard can await this on every navigation without
  // re-issuing the refresh/readMe network calls after the first resolution.
  let sessionCheck = null

  async function reauthenticate() {
    try {
      await refreshSession()
      user.value = await getCurrentUser()
      status.value = 'authenticated'
      localStorage.setItem(AUTH_FLAG_KEY, '1')
    } catch (e) {
      // navigator.onLine is unreliable (e.g. Brave's DevTools "Offline" mode
      // doesn't flip it), so don't gate on it — instead distinguish by what
      // actually happened: the Directus SDK throws a structured error with an
      // `errors` array when a request reaches the server and gets a real
      // rejection (expired/invalid session), vs. a plain TypeError with no
      // such array when the request never reached the server at all (no
      // network, DNS failure, etc). Only the former is a genuine logout.
      const serverRejected = Array.isArray(e?.errors)
      user.value = null
      if (serverRejected) {
        status.value = 'unauthenticated'
        localStorage.removeItem(AUTH_FLAG_KEY)
      } else {
        status.value = localStorage.getItem(AUTH_FLAG_KEY) === '1' ? 'authenticated' : 'unauthenticated'
      }
    }
  }

  function checkSession() {
    if (!sessionCheck) sessionCheck = reauthenticate()
    return sessionCheck
  }

  // If the offline-trust fallback above rendered the app from the cached flag
  // alone, the SDK never actually got a real access token into memory —
  // reconnecting mid-session (no reload) would otherwise leave writes
  // silently failing until the next full reload, since nothing else
  // triggers a re-auth. Re-verify for real the moment connectivity returns.
  window.addEventListener('online', () => {
    if (status.value === 'authenticated') reauthenticate()
  })

  async function login(email, password) {
    error.value = null
    try {
      await apiLogin(email, password)
      user.value = await getCurrentUser()
      status.value = 'authenticated'
      localStorage.setItem(AUTH_FLAG_KEY, '1')
      sessionCheck = Promise.resolve()
    } catch (e) {
      error.value = 'Invalid email or password.'
      throw e
    }
  }

  async function logout() {
    try {
      await apiLogout()
    } finally {
      user.value = null
      status.value = 'unauthenticated'
      localStorage.removeItem(AUTH_FLAG_KEY)
      sessionCheck = Promise.resolve()
      await clearOfflineData().catch((e) => console.error('Failed to clear offline cache on logout:', e))
    }
  }

  return { user, status, error, checkSession, login, logout }
})
