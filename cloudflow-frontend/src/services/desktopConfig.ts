import { invoke } from '@tauri-apps/api/core';

const DEFAULT_API_BASE_URL = 'http://localhost:9000';

export interface DesktopRuntimeConfig {
  apiBaseUrl: string;
  wsBaseUrl?: string;
  configPath?: string;
  source: 'browser-env' | 'default' | 'file' | 'tauri-error';
}

let runtimeConfigPromise: Promise<DesktopRuntimeConfig> | null = null;

export function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function normalizeBaseUrl(value: unknown, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || fallback;
}

function getBrowserConfig(): DesktopRuntimeConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL, '/api'),
    wsBaseUrl: normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL),
    source: 'browser-env',
  };
}

export async function loadDesktopRuntimeConfig(): Promise<DesktopRuntimeConfig> {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = (async () => {
      if (!isTauriRuntime()) {
        return getBrowserConfig();
      }

      try {
        const config = await invoke<Partial<DesktopRuntimeConfig>>('load_desktop_config');
        return {
          apiBaseUrl: normalizeBaseUrl(config.apiBaseUrl, DEFAULT_API_BASE_URL),
          wsBaseUrl: normalizeBaseUrl(config.wsBaseUrl) || undefined,
          configPath: config.configPath,
          source: config.source === 'file' ? 'file' : 'default',
        };
      } catch (error) {
        console.warn('Failed to load desktop config, using default API gateway.', error);
        return {
          apiBaseUrl: DEFAULT_API_BASE_URL,
          source: 'tauri-error',
        };
      }
    })();
  }

  return runtimeConfigPromise;
}

export function buildHttpUrl(apiBaseUrl: string, path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (/^https?:\/\//i.test(apiBaseUrl)) {
    return `${apiBaseUrl}${normalizedPath}`;
  }
  return `${apiBaseUrl}${normalizedPath}`;
}

export function resolveWebSocketBaseUrl(config: DesktopRuntimeConfig) {
  if (config.wsBaseUrl) {
    return config.wsBaseUrl;
  }

  if (/^https?:\/\//i.test(config.apiBaseUrl)) {
    try {
      const url = new URL(config.apiBaseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = url.pathname.replace(/\/+$/, '');
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return DEFAULT_API_BASE_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    }
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function buildWebSocketUrl(config: DesktopRuntimeConfig, path: string) {
  const baseUrl = resolveWebSocketBaseUrl(config);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
