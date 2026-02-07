import axios, { AxiosError, AxiosResponse } from 'axios';
import { toast } from 'sonner';

// Define standard API response interface
// 定义标准 API 响应接口
export interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

// 创建 axios 实例
const request = axios.create({
  // 在生产环境使用环境变量 VITE_API_BASE_URL，在开发环境使用 /api (走代理)
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
request.interceptors.request.use(
  config => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
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
    // 假设后端返回格式为 { code: 200, msg: 'success', data: ... }
    if (res.code !== 200) {
      // 处理特定业务错误
      console.error(res.msg || '错误');
      toast.error(res.msg || '操作失败');
      return Promise.reject(new Error(res.msg || '错误'));
    }
    return res.data;
  },
  (error: AxiosError<ApiResponse>) => {
    console.error('API 错误:', error);
    
    // 全局处理 401 未授权
    if (error.response && error.response.status === 401) {
       toast.error('登录已过期，请重新登录');
       // 清除 token 并跳转登录页
       localStorage.removeItem('token');
       // 使用 window.location.href 强制跳转，确保状态重置
       // 也可以通过 EventBus 通知 AuthContext 登出
       if (window.location.pathname !== '/login') {
           window.location.href = '/login';
       }
    } else {
       // 通用错误提示
       const msg = error.response?.data?.msg || error.message || '网络请求失败';
       toast.error(msg);
    }
    
    return Promise.reject(error);
  }
);

export default request;
