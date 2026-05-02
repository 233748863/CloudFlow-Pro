import { defineStore } from 'pinia'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
  title?: string
  duration: number
}

let nextId = 1

export const useToastStore = defineStore('toast', {
  state: () => ({
    items: [] as ToastItem[]
  }),
  actions: {
    push(type: ToastType, message: string, title?: string, duration = 2800) {
      const item = { id: nextId++, type, message, title, duration }
      this.items.push(item)
      window.setTimeout(() => {
        this.remove(item.id)
      }, duration)
    },
    remove(id: number) {
      this.items = this.items.filter((entry) => entry.id !== id)
    },
    success(message: string) {
      this.push('success', message)
    },
    error(message: string) {
      this.push('error', message)
    },
    warning(message: string) {
      this.push('warning', message)
    },
    info(message: string) {
      this.push('info', message)
    }
  }
})
