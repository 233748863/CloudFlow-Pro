export const getStoredAuthUser = () => localStorage.getItem('user');

export const setStoredAuthUser = (value: string) => {
  localStorage.setItem('user', value);
};

export const removeStoredAuthUser = () => {
  localStorage.removeItem('user');
};

export const getStoredAuthToken = () => localStorage.getItem('token');

export const setStoredAuthToken = (value: string) => {
  localStorage.setItem('token', value);
};

export const removeStoredAuthToken = () => {
  localStorage.removeItem('token');
};
