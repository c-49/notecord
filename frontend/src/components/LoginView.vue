<template>
  <div class="login-screen">
    <form class="login-card" @submit.prevent="submit">
      <h1 class="title">NoteCord</h1>
      <p class="subtitle">Sign in to continue</p>

      <label class="field">
        <span class="field-label">Email</span>
        <input
          v-model="email"
          type="email"
          class="text-input"
          autocomplete="username"
          required
          :disabled="submitting"
        />
      </label>

      <label class="field">
        <span class="field-label">Password</span>
        <input
          v-model="password"
          type="password"
          class="text-input"
          autocomplete="current-password"
          required
          :disabled="submitting"
        />
      </label>

      <p v-if="authStore.error" class="error">{{ authStore.error }}</p>

      <button type="submit" class="btn btn-primary submit-btn" :disabled="submitting">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const submitting = ref(false)

async function submit() {
  submitting.value = true
  try {
    await authStore.login(email.value, password.value)
    router.push(route.query.redirect ?? '/')
  } catch {
    // authStore.error already holds the message; nothing else to do here.
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login-screen {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.login-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  width: min(360px, calc(100vw - 2rem));
  padding: var(--sp-6);
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
}

.title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
}

.subtitle {
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  margin-top: calc(var(--sp-1) * -2);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.field-label {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.text-input {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-primary);
  font-size: var(--text-base);
  outline: none;
  transition: border-color var(--t-base);
}

.text-input:focus {
  border-color: var(--accent);
}

.error {
  font-size: var(--text-sm);
  color: var(--accent-danger);
}

.submit-btn {
  justify-content: center;
}
</style>
