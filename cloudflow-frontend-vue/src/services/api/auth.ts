import request from '@/services/api/request'
import { hashPassword } from '@/utils/crypto'
import type { User } from '@/types'

export interface TenantOption {
  tenantCode: string
  tenantName: string
}

export interface LoginResponse {
  token: string
  expiresIn?: number
}

export interface CaptchaResponse {
  uuid: string
  bgImage: string
  sliderImage: string
  y: number
  sliderWidth: number
  sliderHeight: number
}

export interface CaptchaCheckRequest {
  uuid: string
  x: number
}

export interface CaptchaCheckResponse {
  passToken: string
}

export interface RegisterData {
  tenantCode: string
  username: string
  password: string
  confirmPassword: string
  email?: string
  nickName?: string
  captchaToken?: string
}

export interface UserInfo {
  userId: number
  userName: string
  nickName: string
  email: string
  role: string
  avatar: string
  deptId?: string
  deptName?: string
  tenantId?: number
  tenantName?: string
  position?: string
  phone?: string
  status?: string
  createTime?: string
  permissions?: string[]
}

interface AuthInfoResponse {
  user?: Record<string, unknown> & { dept?: { deptName?: string } }
  roles?: string[]
  permissions?: string[]
  [key: string]: unknown
}

export const getTenantOptions = () => request.get<TenantOption[]>('/auth/tenant/options')

export const getCaptcha = () => request.get<CaptchaResponse>('/auth/captcha/slider')

export const checkCaptcha = (data: CaptchaCheckRequest) => request.post<CaptchaCheckResponse>('/auth/captcha/check', data)

export const login = async (
  tenantCode: string,
  username: string,
  password?: string,
  captchaToken?: string
) => {
  const hashedPassword = password ? await hashPassword(password) : await hashPassword('123456')
  return request.post<LoginResponse>('/auth/login', { tenantCode, username, password: hashedPassword, captchaToken })
}

export const logout = () => request.post<void>('/auth/logout')

export const register = async (data: RegisterData) => {
  const payload = { ...data }
  if (payload.password) payload.password = await hashPassword(payload.password)
  if (payload.confirmPassword) payload.confirmPassword = await hashPassword(payload.confirmPassword)
  return request.post<void>('/auth/register', payload)
}

export const getInfo = async (): Promise<UserInfo> => {
  const data = await request.get<AuthInfoResponse>('/auth/info')
  const user = (data?.user || data) as Record<string, unknown> & { dept?: { deptName?: string } }
  return {
    userId: Number(user.userId),
    userName: String(user.userName || ''),
    nickName: String(user.nickName || user.userName || ''),
    email: String(user.email || ''),
    role: String(user.role || (Array.isArray(data?.roles) && data.roles.length > 0 ? data.roles[0].toUpperCase() : 'USER')),
    avatar: String(user.avatar || ''),
    deptId: user.deptId != null ? String(user.deptId) : undefined,
    deptName: String(user.deptName || user.dept?.deptName || ''),
    tenantId: user.tenantId != null ? Number(user.tenantId) : undefined,
    tenantName: user.tenantName != null ? String(user.tenantName) : undefined,
    position: user.position != null ? String(user.position) : undefined,
    phone: String(user.phone || user.phonenumber || ''),
    status: String(user.status || 'ACTIVE'),
    createTime: user.createTime != null ? String(user.createTime) : undefined,
    permissions: Array.isArray(data?.permissions) ? data.permissions : []
  }
}

export const buildAuthUser = (userInfo: UserInfo): User => ({
  id: String(userInfo.userId),
  name: userInfo.nickName || userInfo.userName,
  username: userInfo.userName,
  email: userInfo.email || '',
  role: userInfo.role,
  deptId: userInfo.deptId,
  deptName: userInfo.deptName,
  tenantId: userInfo.tenantId,
  tenantName: userInfo.tenantName,
  position: userInfo.position,
  phone: userInfo.phone,
  status: userInfo.status || 'ACTIVE',
  createTime: userInfo.createTime,
  avatar: userInfo.avatar,
  permissions: userInfo.permissions || []
})

export const switchTenant = (tenantId: number) =>
  request.post<{ token: string; tenantId: number; message: string }>('/auth/switchTenant', { tenantId })

export interface UpdateProfilePayload {
  nickName: string
  email?: string
  phone?: string
}

export const updateProfile = (data: UpdateProfilePayload) =>
  request.put<void>('/auth/profile', {
    nickName: data.nickName,
    email: data.email,
    phonenumber: data.phone
  })

export const changeProfilePassword = async (oldPassword: string, newPassword: string) =>
  request.put<void>('/auth/profile/password', {
    oldPassword: await hashPassword(oldPassword),
    newPassword: await hashPassword(newPassword)
  })
