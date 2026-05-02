const TOKEN_KEY = 'cloudflow_pro_token'
const USER_KEY = 'cloudflow_pro_user'

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY)

export const setAuthToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

export const removeAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

export const getStoredAuthUser = () => localStorage.getItem(USER_KEY)

export const setStoredAuthUser = (user: unknown) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const removeStoredAuthUser = () => {
  localStorage.removeItem(USER_KEY)
}
