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

  function checkSession() {
    if (!sessionCheck) {
      sessionCheck = (async () => {
        if (!navigator.onLine) {
          status.value = localStorage.getItem(AUTH_FLAG_KEY) === '1' ? 'authenticated' : 'unauthenticated'
          return
        }
        try {
          await refreshSession()
          user.value = await getCurrentUser()
          status.value = 'authenticated'
          localStorage.setItem(AUTH_FLAG_KEY, '1')
        } catch {
          user.value = null
          status.value = 'unauthenticated'
          localStorage.removeItem(AUTH_FLAG_KEY)
        }
      })()
    }
    return sessionCheck
  }

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
