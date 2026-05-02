import { defineStore } from 'pinia'

export const useNetworkStore = defineStore('network', {
  state: () => ({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    websocketConnected: false
  }),
  actions: {
    bind() {
      window.addEventListener('online', () => { this.online = true })
      window.addEventListener('offline', () => { this.online = false })
    },
    setWebsocketConnected(value: boolean) {
      this.websocketConnected = value
    }
  }
})
