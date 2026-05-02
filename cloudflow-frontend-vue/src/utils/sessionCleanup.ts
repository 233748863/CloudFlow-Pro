import { removeAuthToken, removeStoredAuthUser } from '@/utils/authStorage'

const SESSION_CACHE_PREFIXES = ['cloudflow_pro_api_cache_']

export const clearSessionCaches = () => {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (SESSION_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key)
      }
    })
  } catch {
    // ignore cleanup failures
  }
}

export const clearAuthSession = () => {
  removeAuthToken()
  removeStoredAuthUser()
  clearSessionCaches()
}
