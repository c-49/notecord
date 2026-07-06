import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as apiLogin, logout as apiLogout, refreshSession, getCurrentUser } from '@/services/api'

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
        try {
          await refreshSession()
          user.value = await getCurrentUser()
          status.value = 'authenticated'
        } catch {
          user.value = null
          status.value = 'unauthenticated'
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
      sessionCheck = Promise.resolve()
    }
  }

  return { user, status, error, checkSession, login, logout }
})
