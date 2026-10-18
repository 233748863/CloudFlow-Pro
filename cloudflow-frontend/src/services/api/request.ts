import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { API_TIMEOUT, API_SUCCESS_CODE, API_ERROR_CODES } from '@/constants/api';
import { handleApiError, ApiErrorResponse } from '@/utils/errorHandler';
import { clearAuthSession } from '@/utils/sessionCleanup';
import { getAuthSessionVersion, getAuthToken, getCurrentUserSnapshot } from '@/utils/authStorage';
import { navigateTo } from '@/utils/navigation';
import { isTauriRuntime, loadDesktopRuntimeConfig } from '@/services/desktopConfig';
import { attachTraceId, createTraceId, getRequestTraceContext, rememberRequestTrace, validTraceId } from '@/utils/trace';
import type { RequestTraceContext } from '@/utils/trace';
import { getFormFieldErrors } from '@/utils/formFieldErrors';

const appBasePath = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '');

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// 定义标准 API 响应接口
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

function hasStructuredErrorPayload(data: unknown): data is ApiErrorResponse {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const record = data as Record<string, unknown>;
  return typeof record.code === 'string'
    || typeof record.message === 'string'
    || Array.isArray(record.errors);
}

function getResponseErrorMessage(data: unknown, fallback = '网络请求失败') {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const message = record.message ?? record.msg ?? record.error;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  return fallback;
}

function isForcePasswordChangeUser() {
  const user = getCurrentUserSnapshot();
  return Boolean(user?.forcePasswordChange);
}

function getCookieValue(name: string) {
  if (typeof document === 'undefined' || !document.cookie) {
    return '';
  }

  const encodedName = `${encodeURIComponent(name)}=`;
  const cookies = document.cookie.split(';');
  for (const item of cookies) {
    const cookie = item.trim();
    if (cookie.startsWith(encodedName)) {
      return decodeURIComponent(cookie.slice(encodedName.length));
    }
  }
  return '';
}

function isUnsafeMethod(method?: string) {
  return UNSAFE_METHODS.has((method || 'get').toLowerCase());
}

// 扩展 AxiosRequestConfig 以支持静默模式
// 扩展 AxiosInstance 方法签名，因为响应拦截器已解包 res.data，实际返回业务数据而非 AxiosResponse
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 静默模式：不显示错误 toast 提示 */
    silent?: boolean;
    authSessionVersion?: number;
    requestTraceContext?: RequestTraceContext;
    /** 错误上报请求不覆盖最近一次业务请求编号。 */
    trackRequestTrace?: boolean;
  }
  export interface AxiosInstance {
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
    put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
    delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
    patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  }
}

function tryGetDownloadFileName(contentDisposition?: string) {
  if (!contentDisposition) {
    return '';
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const normalMatch = contentDisposition.match(/filename="?([^\";]+)"?/i);
  return normalMatch?.[1] ?? '';
}

async function normalizeBinaryError(response: AxiosResponse<Blob | ArrayBuffer>) {
  const data = response.data;
  const blob = data instanceof Blob ? data : new Blob([data]);
  const fileName = tryGetDownloadFileName(response.headers?.['content-disposition']);
  const isJsonFile = fileName.toLowerCase().endsWith('.json');

  if (isJsonFile) {
    return null;
  }

  const headBuffer = await blob.slice(0, 16).arrayBuffer();
  const headBytes = new Uint8Array(headBuffer);
  const isZipPayload = headBytes.length >= 2 && headBytes[0] === 0x50 && headBytes[1] === 0x4b;
  if (isZipPayload) {
    return null;
  }

  const headText = new TextDecoder('utf-8').decode(headBytes).trim();
  const contentType = String(response.headers?.['content-type'] || blob.type || '').toLowerCase();
  const looksLikeJson = contentType.includes('json') || headText.startsWith('{') || headText.startsWith('[');
  if (!looksLikeJson) {
    return null;
  }

  try {
    const text = (await blob.text()).trim();
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'code' in parsed) {
      return new Error((parsed as { msg?: string }).msg || '下载失败');
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeBinaryResponse(response: AxiosResponse<Blob | ArrayBuffer>) {
  const data = response.data;
  const contentType = String(response.headers?.['content-type'] || '');
  const blob = data instanceof Blob
    ? data
    : new Blob([data], { type: contentType || 'application/octet-stream' });
  const fileName = tryGetDownloadFileName(response.headers?.['content-disposition']);

  if (!fileName || typeof File === 'undefined') {
    return blob;
  }

  return new File([blob], fileName, {
    type: blob.type || contentType || 'application/octet-stream',
    lastModified: Date.now(),
  });
}

// 创建 axios 实例
const request = axios.create({
  // 在生产环境使用环境变量 VITE_API_BASE_URL，在开发环境使用 /api (走代理)
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: API_TIMEOUT, // 30秒超时
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 检测网络状态
let isOnline = navigator.onLine;
// 401 并发去重：确保多个请求同时收到 401 时只执行一次跳转
let redirectingSessionVersion: number | null = null;
window.addEventListener('online', () => { isOnline = true; });
window.addEventListener('offline', () => { isOnline = false; });

function redirectToLoginWhenUnauthorized(options: { silent?: boolean; authSessionVersion?: number } = {}) {
  const currentVersion = getAuthSessionVersion();
  if (options.authSessionVersion !== currentVersion) {
    return;
  }
  // 并发去重：多个请求同时 401 时只处理一次
  if (redirectingSessionVersion === currentVersion) {
    return;
  }
  redirectingSessionVersion = currentVersion;

  if (options.silent) {
    clearAuthSession();
    window.dispatchEvent(new Event('cloudflow:auth-expired'));
    // 延迟重置去重状态，避免并发静默请求时发生死锁或拦截失效，同时预防高频并发 401 引发 React 重绘溢出
    setTimeout(() => {
      if (redirectingSessionVersion === currentVersion) redirectingSessionVersion = null;
    }, 1500);
    return;
  }

  if (isForcePasswordChangeUser()) {
    redirectingSessionVersion = null;
    return;
  }

  toast.error('登录已过期，请重新登录');
  clearAuthSession();
  window.dispatchEvent(new Event('cloudflow:auth-expired'));

  const loginPath = `${appBasePath}/login`;
  if (window.location.pathname !== loginPath) {
    navigateTo(loginPath, { replace: true });
  }

  // 延迟重置非静默跳转的标志位，确保在软跳转期间或之后，下一次 Token 过期时拦截功能依然可用
  setTimeout(() => {
    if (redirectingSessionVersion === currentVersion) redirectingSessionVersion = null;
  }, 1500);
}

// 请求拦截器
request.interceptors.request.use(
  async config => {
    const sessionVersion = getAuthSessionVersion();
    const traceId = validTraceId(config.headers['X-Trace-Id']) ?? createTraceId();
    config.headers['X-Trace-Id'] = traceId;
    const runtimeConfig = await loadDesktopRuntimeConfig();
    if (sessionVersion !== getAuthSessionVersion()) throw new axios.CanceledError('登录身份已变化，请重新操作');
    const tauriRuntime = isTauriRuntime();
    config.baseURL = runtimeConfig.apiBaseUrl;
    if (tauriRuntime) {
      config.withCredentials = false;
    }

    // 检查网络状态
    const isSilent = config.silent;
    if (!isOnline) {
      if (!isSilent) {
        toast.error('网络连接已断开，请检查网络设置');
      }
      return Promise.reject(attachTraceId(new Error('网络连接已断开'), traceId));
    }

    const token = getAuthToken();
    config.authSessionVersion = sessionVersion;
    config.requestTraceContext = getRequestTraceContext();
    if (token) {
      config.headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    if (!tauriRuntime && isUnsafeMethod(config.method)) {
      const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
      if (csrfToken) {
        config.headers[CSRF_HEADER_NAME] = csrfToken;
      }
    }

    // 从 AuthContext 维护的 in-memory 快照取 tenantId 并添加到请求头
    const user = getCurrentUserSnapshot();
    if (user?.tenantId != null) {
      config.headers['X-Tenant-Id'] = String(user.tenantId);
    }

    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  async (response: AxiosResponse<any>) => {
    const traceId = validTraceId(response.headers['x-trace-id']) ?? validTraceId(response.config.headers['X-Trace-Id']);
    if (response.config.trackRequestTrace !== false) rememberRequestTrace(traceId, response.config.requestTraceContext);
    // binary download responses (e.g. export APIs)
    if (response.config?.responseType === 'blob' || response.config?.responseType === 'arraybuffer') {
      const binaryError = await normalizeBinaryError(response as AxiosResponse<Blob | ArrayBuffer>);
      if (binaryError) {
        return Promise.reject(attachTraceId(binaryError, traceId));
      }
      return normalizeBinaryResponse(response as AxiosResponse<Blob | ArrayBuffer>);
    }

    const res = response.data;
    const isSilent = response.config?.silent;
    // pass through non-standard responses
    if (!res || typeof res !== 'object' || !('code' in res)) {
      return res;
    }
    // 假设后端返回格式为 { code: 200, msg: 'success', data: ... }
    if (res.code !== API_SUCCESS_CODE) {
      if (res.code === API_ERROR_CODES.UNAUTHORIZED) {
        redirectToLoginWhenUnauthorized({ silent: isSilent, authSessionVersion: response.config.authSessionVersion });
        return Promise.reject(attachTraceId(new Error(res.msg || '登录已过期，请重新登录'), traceId));
      }
      // 503 服务不可用 - 微服务未启动，始终静默处理
      if (res.code === 503) {
        console.warn('[API] 服务暂时不可用');
        return Promise.reject(attachTraceId(new Error(res.msg || '服务暂时不可用'), traceId));
      }
      // 403 权限不足 - 显示友好的权限错误提示
      if (res.code === 403) {
        if (!isSilent) {
          toast.error(res.msg || '您没有权限执行此操作', {
            duration: 4000,
            description: '如需访问此功能，请联系系统管理员'
          });
        }
        return Promise.reject(attachTraceId(new Error(res.msg || '权限不足'), traceId));
      }
      // 处理特定业务错误
      if (!isSilent) {
        toast.error(res.msg || '操作失败');
      }
      return Promise.reject(attachTraceId(new Error(res.msg || '错误'), traceId));
    }
    if ((response.headers['x-crm-rule-warning'] === 'true' || response.headers['x-oa-rule-warning'] === 'true') && typeof res.msg === 'string') {
      toast.warning(res.msg, { duration: 10000 });
    }
    return res.data;
  },
  (error: AxiosError<ApiResponse | ApiErrorResponse>) => {
    // Navigation and superseded reads deliberately cancel requests; preserve cancellation without reporting a failure.
    if (axios.isCancel(error)) return Promise.reject(error);
    const traceId = validTraceId(error.response?.headers['x-trace-id']) ?? validTraceId(error.config?.headers['X-Trace-Id']);
    if (error.config?.trackRequestTrace !== false) rememberRequestTrace(traceId, error.config?.requestTraceContext);
    attachTraceId(error, traceId);
    const isSilent = error.config?.silent;

    // 处理超时错误
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      if (!isSilent) {
        toast.error('请求超时，请稍后重试');
      }
      return Promise.reject(attachTraceId(new Error('请求超时'), traceId));
    }

    // 处理网络错误
    if (error.message === 'Network Error' || !isOnline) {
      if (!isSilent) {
        toast.error('网络连接失败，请检查网络设置');
      }
      return Promise.reject(attachTraceId(new Error('网络连接失败'), traceId));
    }

    // 全局处理 401 未授权；静默请求只清状态，不弹提示。
    if (error.response && error.response.status === 401) {
       redirectToLoginWhenUnauthorized({ silent: isSilent, authSessionVersion: error.config?.authSessionVersion });
    } else if (error.response && error.response.status === 503) {
       // 服务不可用 - 微服务未启动，静默处理不弹 toast
       console.warn('[API] 服务暂时不可用');
    } else if (error.response) {
       const responseData = error.response.data;
       if (hasStructuredErrorPayload(responseData)) {
         handleApiError(error as AxiosError<ApiErrorResponse>, { silent: isSilent });
         const msg = getResponseErrorMessage(responseData, error.message || '网络请求失败');
         return Promise.reject(attachTraceId(Object.assign(new Error(msg), {
           status: error.response.status,
           code: responseData.code,
           fieldErrors: getFormFieldErrors(responseData),
         }), traceId));
       }
       const msg = getResponseErrorMessage(responseData, error.message || '网络请求失败');
       if (!isSilent) {
         toast.error(msg);
       }
       return Promise.reject(attachTraceId(Object.assign(new Error(msg), { status: error.response.status }), traceId));
    } else {
       // 其他错误
       if (!isSilent) {
         toast.error('请求失败，请稍后重试');
       }
    }
    
    return Promise.reject(error);
  }
);

export default request;
