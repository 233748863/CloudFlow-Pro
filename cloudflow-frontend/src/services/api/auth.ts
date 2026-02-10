import request from '@/services/api/request';
import { hashPassword } from '@/utils/crypto';
import { Role } from '@/types';

// API Response Types
export interface LoginResponse {
  token: string;
  expiresIn?: number;
}

export interface UserInfo {
  userId: number;
  userName: string;
  nickName: string;
  email: string;
  role: Role;
  avatar: string;
  deptId?: string;
  position?: string;
}

export interface CaptchaResponse {
  uuid: string;
  bgImage: string;
  sliderImage: string;
  y: number;
  sliderWidth: number;
  sliderHeight: number;
}

export interface CaptchaCheckResponse {
  passToken: string;
}

export interface RegisterData {
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
  nickName?: string;
}

export const login = async (username: string, password?: string, captchaToken?: string): Promise<LoginResponse> => {
  const hashedPassword = password ? await hashPassword(password) : await hashPassword('123456');
  return request.post('/auth/login', { username, password: hashedPassword, captchaToken });
};

export const register = async (data: RegisterData): Promise<void> => {
  // Hash password before sending
  const registerData = { ...data };
  if (registerData.password) {
    registerData.password = await hashPassword(registerData.password);
  }
  if (registerData.confirmPassword) {
    registerData.confirmPassword = await hashPassword(registerData.confirmPassword);
  }
  return request.post('/auth/register', registerData);
};

export const getCaptcha = (): Promise<CaptchaResponse> => {
  return request.get('/auth/captcha/slider');
};

export const checkCaptcha = (data: { uuid: string, x: number }): Promise<CaptchaCheckResponse> => {
  return request.post('/auth/captcha/check', data);
};

export const getInfo = async (): Promise<UserInfo> => {
  const data: any = await request.get('/auth/info');
  // Backend returns { user: {...}, roles: [...], permissions: [...] }
  // We need to flatten it into UserInfo format
  const user = data?.user || data;
  return {
    userId: user.userId,
    userName: user.userName,
    nickName: user.nickName,
    email: user.email,
    role: user.role || (Array.isArray(data?.roles) && data.roles.length > 0 ? data.roles[0].toUpperCase() : 'USER'),
    avatar: user.avatar,
    deptId: user.deptId,
    position: user.position,
  } as UserInfo;
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
