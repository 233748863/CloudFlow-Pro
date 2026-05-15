import { defineStore } from 'pinia'
import { buildAuthUser, getInfo, logout as logoutApi, switchTenant as switchTenantApi } from '@/services/api/auth'
import type { User } from '@/types'
import { clearAuthSession } from '@/utils/sessionCleanup'
import { setAuthToken, setStoredAuthUser } from '@/utils/authStorage'

interface AuthState {
  user: User | null
  loading: boolean
}

interface InitOptions {
  skipProbe?: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    loading: true
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    permissions: (state) => state.user?.permissions || [],
    isAdmin: (state) => {
      const role = String(state.user?.role || '').toUpperCase()
      return role === 'ADMIN' || role === 'SUPER_ADMIN'
    }
  },
  actions: {
    async init(options: InitOptions = {}) {
      try {
        if (!options.skipProbe) {
          await this.refreshUser()
        }
      } catch {
        clearAuthSession()
      } finally {
        this.loading = false
      }
    },
    async refreshUser() {
      const userInfo = await getInfo()
      const currentUser = buildAuthUser(userInfo)
      this.user = currentUser
      setStoredAuthUser(currentUser)
      return currentUser
    },
    async loginWithToken(token: string) {
      this.loading = true
      try {
        setAuthToken(token)
        await this.refreshUser()
      } finally {
        this.loading = false
      }
    },
    async logout() {
      try {
        await logoutApi()
      } catch {
        // local logout still proceeds
      }
      clearAuthSession()
      this.user = null
    },
    hasPermission(permission: string) {
      return this.permissions.includes(permission)
        || this.permissions.includes('*:*:*')
        || this.permissions.includes('*')
    },
    async switchTenant(tenantId: number) {
      const response = await switchTenantApi(tenantId)
      setAuthToken(response.token)
      await this.refreshUser()
      window.location.reload()
    }
  }
})
