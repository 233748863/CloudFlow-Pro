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

const redirectToLogin = () => {
  clearAuthSession()
  const loginPath = `${appBasePath}/login`
  if (window.location.pathname !== loginPath) {
    window.location.href = loginPath
  }
}

const tryGetDownloadFileName = (contentDisposition?: string) => {
  if (!contentDisposition) return ''

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const normalMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return normalMatch?.[1] ?? ''
}

const normalizeBinaryError = async (response: AxiosResponse<Blob | ArrayBuffer>) => {
  const data = response.data
  const blob = data instanceof Blob ? data : new Blob([data])
  const fileName = tryGetDownloadFileName(response.headers?.['content-disposition'])
  const isJsonFile = fileName.toLowerCase().endsWith('.json')

  if (isJsonFile) return null

  const headBuffer = await blob.slice(0, 16).arrayBuffer()
  const headBytes = new Uint8Array(headBuffer)
  const isZipPayload = headBytes.length >= 2 && headBytes[0] === 0x50 && headBytes[1] === 0x4b
  if (isZipPayload) return null

  const headText = new TextDecoder('utf-8').decode(headBytes).trim()
  const contentType = String(response.headers?.['content-type'] || blob.type || '').toLowerCase()
  const looksLikeJson = contentType.includes('json') || headText.startsWith('{') || headText.startsWith('[')
  if (!looksLikeJson) return null

  try {
    const text = (await blob.text()).trim()
    const parsed = JSON.parse(text) as Partial<ApiResponse>
    if (parsed && typeof parsed === 'object' && 'code' in parsed) {
      return new Error(parsed.msg || parsed.message || '下载失败')
    }
  } catch {
    return null
  }

  return null
}

const normalizeBinaryResponse = (response: AxiosResponse<Blob | ArrayBuffer>) => {
  const data = response.data
  const contentType = String(response.headers?.['content-type'] || '')
  const blob = data instanceof Blob
    ? data
    : new Blob([data], { type: contentType || 'application/octet-stream' })
  const fileName = tryGetDownloadFileName(response.headers?.['content-disposition'])

  if (!fileName || typeof File === 'undefined') return blob

  return new File([blob], fileName, {
    type: blob.type || contentType || 'application/octet-stream',
    lastModified: Date.now()
  })
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
  async (response: AxiosResponse) => {
    if (response.config?.responseType === 'blob' || response.config?.responseType === 'arraybuffer') {
      const binaryError = await normalizeBinaryError(response as AxiosResponse<Blob | ArrayBuffer>)
      if (binaryError) return Promise.reject(binaryError)
      return normalizeBinaryResponse(response as AxiosResponse<Blob | ArrayBuffer>)
    }

    const res = response.data
    if (!res || typeof res !== 'object' || !('code' in res)) {
      return res
    }

    const apiResponse = res as ApiResponse
    if (apiResponse.code !== API_SUCCESS_CODE) {
      if (apiResponse.code === 401) {
        redirectToLogin()
        return Promise.reject(new Error(apiResponse.msg || apiResponse.message || '登录已过期，请重新登录'))
      }
      if (apiResponse.code === 503) {
        const message = apiResponse.msg || apiResponse.message || '服务暂时不可用'
        redirectToServiceUnavailable(503, message)
        return Promise.reject(new Error(message))
      }
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
      redirectToLogin()
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
