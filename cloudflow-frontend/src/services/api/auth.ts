import request from './request';
import { hashPassword } from '../../utils/crypto';

export const login = async (username: string, password?: string, captchaToken?: string) => {
  const hashedPassword = password ? await hashPassword(password) : await hashPassword('123456');
  return request.post('/auth/login', { username, password: hashedPassword, captchaToken }) as Promise<any>;
};

export const register = async (data: any) => {
  // Hash password before sending
  if (data.password) {
    data.password = await hashPassword(data.password);
  }
  if (data.confirmPassword) {
    data.confirmPassword = await hashPassword(data.confirmPassword);
  }
  return request.post('/auth/register', data) as Promise<any>;
};

export const getCaptcha = () => {
  return request.get('/auth/captcha/slider') as Promise<any>;
};

export const checkCaptcha = (data: { uuid: string, x: number }) => {
  return request.post('/auth/captcha/check', data) as Promise<any>;
};

export const getInfo = () => {
    return request.get('/auth/info') as Promise<any>;
}

export const getDeptTree = () => {
  return request.get('/system/dept/tree');
};

export const getUserList = (params?: any) => {
  return request.get('/system/user/list', { params });
};

export const getUser = (userId: number) => {
  return request.get(`/system/user/${userId}`);
};

export const addUser = (data: any) => {
  return request.post('/system/user', data);
};

export const updateUser = (data: any) => {
  return request.put('/system/user', data);
};

export const deleteUser = (userIds: number[]) => {
  return request.delete(`/system/user/${userIds.join(',')}`);
};

export const getRoleList = (params?: any) => {
  return request.get('/system/role/list', { params });
};

export const addRole = (data: any) => {
  return request.post('/system/role', data);
};

export const updateRole = (data: any) => {
  return request.put('/system/role', data);
};

export const deleteRole = (roleIds: number[]) => {
  return request.delete(`/system/role/${roleIds.join(',')}`);
};

// Menu APIs
export const getMenuList = (params?: any) => {
  return request.get('/system/menu/list', { params });
};

export const getMenu = (menuId: number) => {
  return request.get(`/system/menu/${menuId}`);
};

export const addMenu = (data: any) => {
  return request.post('/system/menu', data);
};

export const updateMenu = (data: any) => {
  return request.put('/system/menu', data);
};

export const deleteMenu = (menuId: number) => {
  return request.delete(`/system/menu/${menuId}`);
};

// Tree Select
export const getMenuTreeSelect = () => {
    // Backend API might need adjustment to return proper tree structure or we build it on frontend
    // Currently list returns flat list, let's use list and build tree in frontend for now if needed,
    // or use a specific tree API.
    // Let's assume list API is enough for now.
    return request.get('/system/menu/list');
};
