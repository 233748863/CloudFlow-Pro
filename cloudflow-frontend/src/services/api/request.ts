import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { API_TIMEOUT, API_SUCCESS_CODE } from '@/constants/api';
import { handleApiError, ApiErrorResponse } from '@/utils/errorHandler';
import { clearAuthSession } from '@/utils/sessionCleanup';
import { getStoredAuthUser } from '@/utils/authStorage';

const appBasePath = import.meta.env.BASE_URL === '/'
  ? ''
  : import.meta.env.BASE_URL.replace(/\/$/, '');

// 定义标准 API 响应接口
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
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

// 扩展 AxiosRequestConfig 以支持静默模式
// 扩展 AxiosInstance 方法签名，因为响应拦截器已解包 res.data，实际返回业务数据而非 AxiosResponse
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 静默模式：不显示错误 toast 提示 */
    silent?: boolean;
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
window.addEventListener('online', () => { isOnline = true; });
window.addEventListener('offline', () => { isOnline = false; });

// 请求拦截器
request.interceptors.request.use(
  config => {
    // 检查网络状态
    if (!isOnline) {
      toast.error('网络连接已断开，请检查网络设置');
      return Promise.reject(new Error('网络连接已断开'));
    }

    // Token 通过 httpOnly cookie 自动携带，无需手动设置 Authorization header

    // 从 localStorage 获取 tenantId 并添加到请求头
    try {
      const userStr = getStoredAuthUser();
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.tenantId) {
          config.headers['X-Tenant-Id'] = String(user.tenantId);
        }
      }
    } catch (e) {
      // 如果解析失败，忽略错误，不添加 X-Tenant-Id 头
      console.warn('Failed to parse user info from localStorage:', e);
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
    // binary download responses (e.g. export APIs)
    if (response.config?.responseType === 'blob' || response.config?.responseType === 'arraybuffer') {
      const binaryError = await normalizeBinaryError(response as AxiosResponse<Blob | ArrayBuffer>);
      if (binaryError) {
        return Promise.reject(binaryError);
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
      // 503 服务不可用 - 微服务未启动，始终静默处理
      if (res.code === 503) {
        console.warn(`[API] 服务暂时不可用: ${res.msg}`);
        return Promise.reject(new Error(res.msg || '服务暂时不可用'));
      }
      // 403 权限不足 - 显示友好的权限错误提示
      if (res.code === 403) {
        if (!isSilent) {
          toast.error(res.msg || '您没有权限执行此操作', {
            duration: 4000,
            description: '如需访问此功能，请联系系统管理员'
          });
        }
        return Promise.reject(new Error(res.msg || '权限不足'));
      }
      // 处理特定业务错误
      if (!isSilent) {
        toast.error(res.msg || '操作失败');
      }
      return Promise.reject(new Error(res.msg || '错误'));
    }
    return res.data;
  },
  (error: AxiosError<ApiResponse | ApiErrorResponse>) => {
    // 处理超时错误
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      toast.error('请求超时，请稍后重试');
      return Promise.reject(new Error('请求超时'));
    }

    // 处理网络错误
    if (error.message === 'Network Error' || !isOnline) {
      toast.error('网络连接失败，请检查网络设置');
      return Promise.reject(new Error('网络连接失败'));
    }

    const isSilent = error.config?.silent;

    // 全局处理 401 未授权 (always show)
    if (error.response && error.response.status === 401) {
       toast.error('登录已过期，请重新登录');
       // 清除认证信息和会话缓存，并跳转登录页
       clearAuthSession();
       // 使用 window.location.href 强制跳转，确保状态重置
       const loginPath = `${appBasePath}/login`;
       if (window.location.pathname !== loginPath) {
           window.location.href = loginPath;
       }
    } else if (error.response && error.response.status === 503) {
       // 服务不可用 - 微服务未启动，静默处理不弹 toast
       console.warn(`[API] 服务暂时不可用: ${error.config?.url}`);
    } else if (error.response) {
       // 使用统一的错误处理器
       // 检查响应数据是否包含标准化的错误格式（有 code 字段）
       const responseData = error.response.data;
       if (responseData && typeof responseData === 'object' && 'code' in responseData) {
         // 标准化错误响应，使用增强的错误处理器
         handleApiError(error as AxiosError<ApiErrorResponse>, { silent: isSilent });
         const msg = getResponseErrorMessage(responseData, error.message || '网络请求失败');
         return Promise.reject(new Error(msg));
       } else {
         // 旧格式的错误响应，使用原有的处理方式
         const msg = getResponseErrorMessage(responseData, error.message || '网络请求失败');
         if (!isSilent) {
           toast.error(msg);
         }
         return Promise.reject(new Error(msg));
       }
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
