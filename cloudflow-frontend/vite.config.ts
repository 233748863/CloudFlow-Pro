import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isTauriMode = mode === 'tauri';
    return {
      build: {
        rollupOptions: {
          output: {
            // 按稳定依赖域拆分公共 chunk，避免主入口持续膨胀触发体积告警。
            manualChunks(id) {
              if (!id.includes('node_modules')) {
                return undefined;
              }

              const normalizedId = id.replace(/\\/g, '/');
              const packagePath = normalizedId.split('node_modules/')[1];

              if (
                packagePath.startsWith('react/') ||
                packagePath.startsWith('react-dom/') ||
                packagePath.startsWith('react-router-dom/') ||
                packagePath.startsWith('scheduler/')
              ) {
                return 'react-vendor';
              }

              if (
                packagePath.startsWith('@tanstack/') ||
                packagePath.startsWith('axios/') ||
                packagePath.startsWith('zustand/') ||
                packagePath.startsWith('date-fns/')
              ) {
                return 'data-vendor';
              }

              if (packagePath.startsWith('@fullcalendar/')) {
                return 'calendar-vendor';
              }

              if (packagePath.startsWith('@dnd-kit/')) {
                return 'dnd-vendor';
              }

              if (
                packagePath.startsWith('marked/') ||
                packagePath.startsWith('dompurify/')
              ) {
                return 'content-vendor';
              }

              if (
                packagePath.startsWith('lucide-react/') ||
                packagePath.startsWith('sonner/')
              ) {
                return 'ui-vendor';
              }

              return 'vendor';
            },
          },
        },
      },
      server: {
        port: isTauriMode ? 3001 : 3000,
        strictPort: true,
        host: '0.0.0.0',
        headers: {
          'X-Frame-Options': 'SAMEORIGIN',
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          // 开发态 CSP：Vite HMR 需要 unsafe-inline / unsafe-eval，故此处相对宽松。
          // 生产环境的 CSP 由网关 / Nginx 下发，需去掉 unsafe-eval 并收紧 connect-src。
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' ws: wss: http: https:",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'self'"
          ].join('; ')
        },
        proxy: {
          '/api': {
            target: env.VITE_API_BASE_URL || 'http://localhost:9000',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, '')
          },
          // WebSocket 代理，转发到网关
          '/ws': {
            target: env.VITE_API_BASE_URL || 'http://localhost:9000',
            changeOrigin: true,
            ws: true
          }
        }
      },
      plugins: [
        react(), 
        tailwindcss(),
        ...(!isTauriMode ? [VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg'],
          manifest: {
            name: 'CloudFlow Pro',
            short_name: 'CloudFlow',
            description: 'Enterprise Cloud Flow Management System',
            theme_color: '#ffffff',
            icons: [
              {
                src: 'icon.svg',
                sizes: '192x192 512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          },
          workbox: {
             globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
             runtimeCaching: [
                {
                   urlPattern: ({ url }) => url.pathname.startsWith('/api'),
                   handler: 'NetworkFirst',
                   options: {
                      cacheName: 'api-cache',
                      cacheableResponse: {
                         statuses: [0, 200]
                      }
                   }
                }
             ]
          }
        })] : [])
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          'sonner': path.resolve(__dirname, './src/lib/sonner.tsx'),
        }
      }
    };
});
