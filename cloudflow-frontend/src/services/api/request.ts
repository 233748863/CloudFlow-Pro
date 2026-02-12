import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { API_TIMEOUT, API_SUCCESS_CODE } from '@/constants/api';

// Define standard API response interface
// 定义标准 API 响应接口
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

// Extend AxiosRequestConfig to support silent mode
declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 静默模式：不显示错误 toast 提示 */
    silent?: boolean;
  }
}

// 创建 axios 实例
const request = axios.create({
  // 在生产环境使用环境变量 VITE_API_BASE_URL，在开发环境使用 /api (走代理)
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: API_TIMEOUT, // 30秒超时
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

    // 从 localStorage 获取 token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // 从 localStorage 获取 tenantId 并添加到请求头
    // 注意：tenantId 在用户登录后会被存储在 user 对象中
    // 我们需要从 localStorage 中获取完整的用户信息来提取 tenantId
    try {
      const userStr = localStorage.getItem('user');
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
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data;
    const isSilent = response.config?.silent;
    // 假设后端返回格式为 { code: 200, msg: 'success', data: ... }
    if (res.code !== API_SUCCESS_CODE) {
      // 503 服务不可用 - 微服务未启动，始终静默处理
      if (res.code === 503) {
        console.warn(`[API] 服务暂时不可用: ${res.msg}`);
        return Promise.reject(new Error(res.msg || '服务暂时不可用'));
      }
      // 处理特定业务错误
      if (!isSilent) {
        toast.error(res.msg || '操作失败');
      }
      return Promise.reject(new Error(res.msg || '错误'));
    }
    return res.data;
  },
  (error: AxiosError<ApiResponse>) => {
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
       // 清除 token 并跳转登录页
       localStorage.removeItem('token');
       // 使用 window.location.href 强制跳转，确保状态重置
       if (window.location.pathname !== '/login') {
           window.location.href = '/login';
       }
    } else if (error.response && error.response.status === 503) {
       // 服务不可用 - 微服务未启动，静默处理不弹 toast
       console.warn(`[API] 服务暂时不可用: ${error.config?.url}`);
    } else if (error.response) {
       // 通用错误提示
       if (!isSilent) {
         const msg = error.response.data?.msg || error.message || '网络请求失败';
         toast.error(msg);
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
