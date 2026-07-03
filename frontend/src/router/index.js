import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/page/welcome',
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
