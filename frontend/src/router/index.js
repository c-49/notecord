import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/components/LoginView.vue'),
  },
  {
    path: '/',
    // Layout wrapper (sidebar + nav data loading) — only mounts for routes
    // nested here, so it never loads app data before the user is authenticated.
    component: () => import('@/components/AppShell.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/components/HomeView.vue'),
      },
      {
        path: 'page/:pageId',
        name: 'page',
        component: () => import('@/components/PageView.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.checkSession()

  if (authStore.status !== 'authenticated' && to.name !== 'login') {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (authStore.status === 'authenticated' && to.name === 'login') {
    return { path: '/' }
  }
  return true
})

export default router
