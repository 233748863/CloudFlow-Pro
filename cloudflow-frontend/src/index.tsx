import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/unity2-refresh.css';
import './styles/mobile-foundation.css';
import App from './App';
import { initializeTheme } from './context/ThemeContext';

// 旧版共享接口缓存没有账号/租户隔离，新版本改用只读摘要后移除遗留响应。
if (typeof caches !== 'undefined') {
  void caches.delete('api-cache').catch(() => { /* 禁止缓存存储时仍正常启动。 */ });
}

// 开发服务器不使用 PWA 缓存，启动时清理旧版部署遗留的 Service Worker，
// 避免 localhost 继续返回已经过期的前端资源。
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
  if ('caches' in window) {
    void caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        void caches.delete(cacheName);
      });
    });
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

initializeTheme();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
