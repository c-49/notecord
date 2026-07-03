import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/components/HomeView.vue'),
  },
  {
    path: '/page/:pageId',
    name: 'page',
    component: () => import('@/components/PageView.vue'),
  },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
