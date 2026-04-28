const SESSION_CACHE_PREFIXES = ['api_cache_'];

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
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  clearSessionCaches();
};
