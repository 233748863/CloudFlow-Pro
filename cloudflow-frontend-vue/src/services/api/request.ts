import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'
import { getAuthToken, getStoredAuthUser } from '@/utils/authStorage'
import { clearAuthSession } from '@/utils/sessionCleanup'

const API_TIMEOUT = 30000
const API_SUCCESS_CODE = 200

const appBasePath = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '')

const getResponseErrorMessage = (data: unknown, fallback = '网络请求失败') => {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    const message = record.message ?? record.msg ?? record.error
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return fallback
}

const redirectToServiceUnavailable = (status: number, message: string) => {
  const target = `${appBasePath}/503?status=${status}&message=${encodeURIComponent(message)}&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
  if (window.location.pathname !== `${appBasePath}/503`) {
    window.location.href = target
  }
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    silent?: boolean
  }
  export interface AxiosInstance {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
    post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
    put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
    delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
    patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  }
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json'
  }
})

let isOnline = typeof navigator === 'undefined' ? true : navigator.onLine
window.addEventListener('online', () => { isOnline = true })
window.addEventListener('offline', () => { isOnline = false })

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!isOnline) {
      return Promise.reject(new Error('网络连接已断开'))
    }

    const token = getAuthToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    try {
      const userStr = getStoredAuthUser()
      if (userStr) {
        const user = JSON.parse(userStr) as { tenantId?: number }
        if (user.tenantId) {
          config.headers['X-Tenant-Id'] = String(user.tenantId)
        }
      }
    } catch {
      // ignore invalid persisted user
    }

    return config
  },
  (error) => Promise.reject(error)
)

request.interceptors.response.use(
  (response: AxiosResponse) => {
    const res = response.data
    if (!res || typeof res !== 'object' || !('code' in res)) {
      return res
    }

    const apiResponse = res as ApiResponse
    if (apiResponse.code !== API_SUCCESS_CODE) {
      return Promise.reject(new Error(apiResponse.msg || apiResponse.message || '操作失败'))
    }

    return apiResponse.data
  },
  (error: AxiosError<ApiResponse | Record<string, unknown>>) => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return Promise.reject(new Error('请求超时'))
    }

    if (error.message === 'Network Error' || !isOnline) {
      return Promise.reject(new Error('网络连接失败'))
    }

    if (error.response?.status === 401) {
      clearAuthSession()
      const loginPath = `${appBasePath}/login`
      if (window.location.pathname !== loginPath) {
        window.location.href = loginPath
      }
      return Promise.reject(new Error('登录已过期，请重新登录'))
    }

    const message = getResponseErrorMessage(error.response?.data, error.message || '网络请求失败')
    if (error.response?.status && [502, 503, 504].includes(error.response.status)) {
      redirectToServiceUnavailable(error.response.status, message)
      return Promise.reject(new Error(message))
    }

    return Promise.reject(new Error(message))
  }
)

export default request
