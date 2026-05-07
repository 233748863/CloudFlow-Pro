const USER_KEY = 'cloudflow_pro_user';

// Token is managed via httpOnly cookie for all HTTP requests.
// We keep an in-memory copy solely for WebSocket connections,
// which cannot use cookies during the handshake.
let inMemoryToken: string | null = null;

export const getAuthToken = (): string | null => inMemoryToken;

export const setAuthToken = (token: string) => {
  inMemoryToken = token;
};

export const removeAuthToken = () => {
  inMemoryToken = null;
};

export const getStoredAuthUser = () => localStorage.getItem(USER_KEY);

export const setStoredAuthUser = (user: unknown) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const removeStoredAuthUser = () => {
  localStorage.removeItem(USER_KEY);
};
