const USER_KEY = 'cloudflow_pro_user'

let inMemoryToken: string | null = null

export const getAuthToken = () => inMemoryToken

export const setAuthToken = (token: string) => {
  inMemoryToken = token
}

export const removeAuthToken = () => {
  inMemoryToken = null
}

export const getStoredAuthUser = () => localStorage.getItem(USER_KEY)

export const setStoredAuthUser = (user: unknown) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const removeStoredAuthUser = () => {
  localStorage.removeItem(USER_KEY)
}
