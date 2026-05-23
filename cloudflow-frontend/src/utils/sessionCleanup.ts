import { removeAuthToken, clearCurrentUserSnapshot } from '@/utils/authStorage';

const SESSION_CACHE_PREFIXES = ['cloudflow_pro_api_cache_'];

export const clearSessionCaches = (): void => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (SESSION_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore cleanup failures so sign-out can continue.
  }
};

export const clearAuthSession = (): void => {
  removeAuthToken();
  clearCurrentUserSnapshot();
  clearSessionCaches();
};
