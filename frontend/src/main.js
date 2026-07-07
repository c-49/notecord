import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import { initMutationQueue } from '@/services/mutationQueue'
import router from './router'
import App from './App.vue'
import './style.css'

registerSW({ immediate: true })
initMutationQueue()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
