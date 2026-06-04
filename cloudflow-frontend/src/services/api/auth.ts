import request from '@/services/api/request';
import { Role } from '@/types';

// ==================== 系统管理类型定义 ====================

/** 部门数据 */
export interface SysDept {
  deptId?: number;
  parentId?: number;
  deptName: string;
  orderNum?: number;
  leader?: string;
  phone?: string;
  email?: string;
  status?: string;
  children?: SysDept[];
}

/** 系统用户数据 */
export interface SysUser {
  userId?: number;
  deptId?: number;
  deptName?: string;
  userName: string;
  nickName: string;
  email?: string;
  phone?: string;
  sex?: string;
  avatar?: string;
  password?: string;
  status?: string;
  roleIds?: number[];
  postIds?: number[];
}

/** 系统角色数据 */
export interface SysRole {
  roleId?: number;
  tenantId?: number;
  roleName: string;
  roleKey: string;
  roleSort?: number;
  status?: string;
  dsType?: number;
  dsScope?: string | number[];
  menuIds?: number[];
  remark?: string;
}

/** 角色选择项数据 */
export interface RoleOption {
  roleId: number;
  roleName: string;
  roleKey: string;
}

export interface RoleMutexRule {
  id: number;
  tenantId?: number;
  roleId1: number;
  roleId2: number;
  createBy?: string;
  createTime?: string;
}

export interface RoleMutexRequest {
  roleId1: number;
  roleId2: number;
}

export interface DeptMigrateRequest {
  sourceDeptId: number;
  targetDeptId: number;
}

/** 系统菜单数据 */
export interface SysMenu {
  menuId?: number;
  menuName: string;
  parentId?: number;
  orderNum?: number;
  path?: string;
  component?: string;
  menuType?: string;
  visible?: string;
  status?: string;
  perms?: string;
  icon?: string;
  children?: SysMenu[];
}

/** 通用分页查询参数 */
export interface PageQuery {
  pageNum?: number;
  pageSize?: number;
  [key: string]: string | number | undefined;
}

// ==================== API 响应类型 ====================

export interface LoginResponse {
  token: string;
  expiresIn?: number;
  forcePasswordChange?: boolean;
}

export interface TenantOption {
  tenantCode: string;
  tenantName: string;
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
  tenantName?: string;
  position?: string;
  phone?: string; // 手机号
  status?: string;
  createTime?: string;
  permissions?: string[];
  forcePasswordChange?: boolean;
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

export interface CaptchaCheckRequest {
  uuid: string;
  x: number;
}

export interface RegisterData {
  tenantCode: string;
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
  nickName?: string;
  captchaToken?: string; // 验证码通过后的令牌
}

export const getTenantOptions = (): Promise<TenantOption[]> => {
  return request.get('/auth/tenant/options');
};

export const login = async (
  tenantCode: string,
  username: string,
  password: string,
  captchaToken: string,
): Promise<LoginResponse> => {
  return request.post('/auth/login', { tenantCode, username, password, captchaToken });
};

/**
 * 登出接口：通知后端清理 token 与相关缓存。
 */
export const logout = async (): Promise<void> => {
  return request.post('/auth/logout');
};

export const register = async (data: RegisterData): Promise<void> => {
  return request.post('/auth/register', { ...data });
};

export const getCaptcha = (): Promise<CaptchaResponse> => {
  return request.get('/auth/captcha/slider');
};

export const checkCaptcha = (data: CaptchaCheckRequest): Promise<CaptchaCheckResponse> => {
  return request.post('/auth/captcha/check', data);
};

/** 后端 /auth/info 返回的原始格式 */
interface AuthInfoResponse {
  user?: Record<string, unknown> & { dept?: { deptName?: string } };
  roles?: string[];
  permissions?: string[];
  [key: string]: unknown;
}

export const getInfo = async (): Promise<UserInfo> => {
  const data = await request.get<AuthInfoResponse>('/auth/info');
  // 后端返回格式 { user: {...}, roles: [...], permissions: [...] }
  // 需要将其扁平化为 UserInfo 格式
  const user = (data?.user || data) as Record<string, unknown> & { dept?: { deptName?: string } };
  const toBooleanFlag = (value: unknown): boolean => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value === 1;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'y' || normalized === 'yes';
    }
    return false;
  };
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
    tenantName: user.tenantName,
    position: user.position,
    phone: user.phone || user.phonenumber,
    status: user.status,
    createTime: user.createTime,
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    forcePasswordChange: toBooleanFlag(data?.forcePasswordChange ?? user.forcePasswordChange),
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

export const addDept = (data: SysDept) => {
  return request.post('/auth/system/dept', data);
};

export const updateDept = (data: SysDept) => {
  return request.put('/auth/system/dept', data);
};

export const migrateDeptUsers = (data: DeptMigrateRequest) => {
  return request.post<number>('/auth/system/dept/migrate', data);
};

export const deleteDept = (deptId: number) => {
  return request.delete(`/auth/system/dept/${deptId}`);
};

export const getUserList = (params?: PageQuery) => {
  return request.get('/auth/system/user/list', { params });
};

export const getUser = (userId: number) => {
  return request.get(`/auth/system/user/${userId}`);
};

export const addUser = (data: SysUser) => {
  return request.post('/auth/system/user', data);
};

export const updateUser = (data: SysUser) => {
  return request.put('/auth/system/user', data);
};

export const resetUserPassword = async (userId: number, password: string): Promise<void> => {
  const data: ResetPasswordRequest = {
    password,
  };
  return request.put(`/auth/system/user/${userId}/password`, data);
};

export const deleteUser = (userIds: number[]) => {
  return request.delete(`/auth/system/user/${userIds.join(',')}`);
};

export const getRoleList = (params?: PageQuery) => {
  return request.get('/auth/system/role/list', { params });
};

export const getRole = (roleId: number) => {
  return request.get<SysRole>(`/auth/system/role/${roleId}`);
};

export const getRoleOptions = (): Promise<RoleOption[]> => {
  return request.get('/auth/system/role/optionselect');
};

export const addRole = (data: SysRole) => {
  return request.post('/auth/system/role', data);
};

export const updateRole = (data: SysRole) => {
  return request.put('/auth/system/role', data);
};

export const deleteRole = (roleIds: number[]) => {
  return request.delete(`/auth/system/role/${roleIds.join(',')}`);
};

export const getRoleMutexRules = () => {
  return request.get<RoleMutexRule[]>('/auth/system/role/mutex/list');
};

export const addRoleMutexRule = (data: RoleMutexRequest) => {
  return request.post<number>('/auth/system/role/mutex', data);
};

export const deleteRoleMutexRule = (id: number) => {
  return request.delete<number>(`/auth/system/role/mutex/${id}`);
};

// Menu APIs
export const getMenuList = (params?: PageQuery) => {
  return request.get('/auth/system/menu/list', { params });
};

export const getMenu = (menuId: number) => {
  return request.get(`/auth/system/menu/${menuId}`);
};

export const addMenu = (data: SysMenu) => {
  return request.post('/auth/system/menu', data);
};

export const updateMenu = (data: SysMenu) => {
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
  const data: SwitchTenantRequest = { tenantId };
  return request.post('/auth/switchTenant', data);
};

export interface ResetPasswordRequest {
  password: string;
}

export interface SwitchTenantRequest {
  tenantId: number;
}

export interface UpdateProfilePayload {
  nickName: string;
  email?: string;
  phone?: string;
}

export interface UpdateProfileRequest {
  nickName: string;
  email?: string;
  phonenumber?: string;
}

export interface ChangeProfilePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export const updateProfile = (data: UpdateProfilePayload): Promise<void> => {
  const payload: UpdateProfileRequest = {
    nickName: data.nickName,
    email: data.email,
    phonenumber: data.phone,
  };
  return request.put('/auth/profile', payload);
};

export const changeProfilePassword = async (
  oldPassword: string,
  newPassword: string,
): Promise<void> => {
  const data: ChangeProfilePasswordRequest = {
    oldPassword,
    newPassword,
  };
  return request.put('/auth/profile/password', data);
};
