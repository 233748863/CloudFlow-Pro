import { defineStore } from 'pinia'

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    loading: false
  }),
  actions: {
    start() {
      this.loading = true
    },
    done() {
      this.loading = false
    }
  }
})
