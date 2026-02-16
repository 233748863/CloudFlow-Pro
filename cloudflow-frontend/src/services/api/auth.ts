import request from '@/services/api/request';
import { hashPassword } from '@/utils/crypto';
import { Role } from '@/types';

// API 响应类型
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
  deptName?: string; // 部门名称
  tenantId?: number;
  position?: string;
  phone?: string; // 手机号
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
  captchaToken?: string; // 验证码通过后的令牌
}

export const login = async (username: string, password?: string, captchaToken?: string): Promise<LoginResponse> => {
  const hashedPassword = password ? await hashPassword(password) : await hashPassword('123456');
  return request.post('/auth/login', { username, password: hashedPassword, captchaToken });
};

export const register = async (data: RegisterData): Promise<void> => {
  // 发送前对密码进行哈希
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
  // 后端返回格式 { user: {...}, roles: [...], permissions: [...] }
  // 需要将其扁平化为 UserInfo 格式
  const user = data?.user || data;
  return {
    userId: user.userId,
    userName: user.userName,
    nickName: user.nickName,
    email: user.email,
    role: user.role || (Array.isArray(data?.roles) && data.roles.length > 0 ? data.roles[0].toUpperCase() : 'USER'),
    avatar: user.avatar,
    deptId: user.deptId,
    deptName: user.deptName || user.dept?.deptName,
    tenantId: user.tenantId,
    position: user.position,
    phone: user.phone || user.phonenumber,
  } as UserInfo;
}

// 所有 /system/** 接口由 cloudflow-auth 服务提供
// 网关路由: /auth/** → cloudflow-auth (StripPrefix=1)
// 因此所有系统管理接口都添加 /auth 前缀以匹配网关路由

export const getDeptTree = () => {
  return request.get('/auth/system/dept/tree');
};

export const getDept = (deptId: number) => {
  return request.get(`/auth/system/dept/${deptId}`);
};

export const addDept = (data: any) => {
  return request.post('/auth/system/dept', data);
};

export const updateDept = (data: any) => {
  return request.put('/auth/system/dept', data);
};

export const deleteDept = (deptId: number) => {
  return request.delete(`/auth/system/dept/${deptId}`);
};

export const getUserList = (params?: any) => {
  return request.get('/auth/system/user/list', { params });
};

export const getUser = (userId: number) => {
  return request.get(`/auth/system/user/${userId}`);
};

export const addUser = (data: any) => {
  return request.post('/auth/system/user', data);
};

export const updateUser = (data: any) => {
  return request.put('/auth/system/user', data);
};

export const deleteUser = (userIds: number[]) => {
  return request.delete(`/auth/system/user/${userIds.join(',')}`);
};

export const getRoleList = (params?: any) => {
  return request.get('/auth/system/role/list', { params });
};

export const addRole = (data: any) => {
  return request.post('/auth/system/role', data);
};

export const updateRole = (data: any) => {
  return request.put('/auth/system/role', data);
};

export const deleteRole = (roleIds: number[]) => {
  return request.delete(`/auth/system/role/${roleIds.join(',')}`);
};

// Menu APIs
export const getMenuList = (params?: any) => {
  return request.get('/auth/system/menu/list', { params });
};

export const getMenu = (menuId: number) => {
  return request.get(`/auth/system/menu/${menuId}`);
};

export const addMenu = (data: any) => {
  return request.post('/auth/system/menu', data);
};

export const updateMenu = (data: any) => {
  return request.put('/auth/system/menu', data);
};

export const deleteMenu = (menuId: number) => {
  return request.delete(`/auth/system/menu/${menuId}`);
};

// Tree Select
export const getMenuTreeSelect = () => {
    return request.get('/auth/system/menu/list');
};

/**
 * 租户切换接口（仅超级管理员可用）
 * @param tenantId 目标租户ID
 */
export const switchTenant = async (tenantId: number): Promise<{ token: string; tenantId: number; message: string }> => {
  return request.post('/auth/switchTenant', { tenantId });
};
