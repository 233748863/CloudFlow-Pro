import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'
import { useNetworkStore } from '@/stores/network'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

function redirectToRuntimeError(message: unknown) {
  const currentPath = window.location.pathname + window.location.search
  const isErrorPage = window.location.pathname === '/500'
  if (isErrorPage) return
  const text = message instanceof Error ? message.message : String(message || '页面运行时出现异常')
  router.replace(`/500?message=${encodeURIComponent(text)}&redirect=${encodeURIComponent(currentPath)}`)
}

app.config.errorHandler = (error) => {
  redirectToRuntimeError(error)
}

window.addEventListener('unhandledrejection', (event) => {
  redirectToRuntimeError(event.reason)
})

useThemeStore().apply()
useNetworkStore().bind()

app.mount('#app')
