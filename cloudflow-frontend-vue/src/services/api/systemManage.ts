import request from '@/services/api/request'

export interface PageQuery {
  pageNum?: number
  pageSize?: number
  [key: string]: string | number | undefined
}

export interface SysUser {
  userId?: number
  deptId?: number
  deptName?: string
  tenantId?: number
  tenantName?: string
  userName: string
  nickName: string
  email?: string
  phonenumber?: string
  phone?: string
  sex?: string
  password?: string
  status?: string
  role?: string
  roleIds?: number[]
  postIds?: number[]
  createTime?: string
  loginDate?: string
  remark?: string
}

export interface SysRole {
  roleId?: number
  tenantId?: number
  roleName: string
  roleKey: string
  roleSort?: number
  status?: string
  dsType?: number
  dsScope?: string
  menuIds?: number[]
  createTime?: string
  remark?: string
}

export interface RoleOption {
  roleId: number
  roleName: string
  roleKey: string
}

export interface SysMenu {
  menuId?: number
  menuName: string
  parentId?: number
  orderNum?: number
  path?: string
  component?: string
  query?: string
  isFrame?: string
  isCache?: string
  menuType?: 'M' | 'C' | 'F' | string
  visible?: string
  status?: string
  perms?: string
  icon?: string
  remark?: string
  children?: SysMenu[]
}

export interface SysDept {
  deptId?: number
  parentId?: number
  ancestors?: string
  deptName: string
  orderNum?: number
  leader?: string
  phone?: string
  email?: string
  status?: string
  delFlag?: string
  createTime?: string
  remark?: string
  children?: SysDept[]
}

export interface SysTenant {
  tenantId?: number
  tenantCode?: string
  tenantName: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  domain?: string
  status?: string
  expireTime?: string
  userLimit?: number
  storageLimit?: number
  storageUsed?: number
  accountCount?: number
  remark?: string
  createTime?: string
}

export interface TenantStatistics {
  tenantId?: number
  expired: boolean
  disabled: boolean
  userLimitReached: boolean
  userCount: number
}

export interface TenantStorageSummary {
  tenantId: number
  storageLimit: number
  storageUsed: number
  remainingStorage: number
  storageUsagePercent: number
}

export interface SysFile {
  fileId: number
  tenantId?: number
  fileName: string
  filePath?: string
  url?: string
  storageType?: string
  fileSize?: number
  fileType?: string
  createBy?: string
  createTime?: string
  remark?: string
}

export interface FilePageResult {
  rows?: SysFile[]
  records?: SysFile[]
  total?: number
}

export const getUserList = (params?: PageQuery) =>
  request.get<SysUser[]>('/auth/system/user/list', { params })

export const getUser = (userId: number) =>
  request.get<SysUser>(`/auth/system/user/${userId}`)

export const addUser = (data: SysUser) =>
  request.post<void>('/auth/system/user', data)

export const updateUser = (data: SysUser) =>
  request.put<void>('/auth/system/user', data)

export const resetUserPassword = async (userId: number, password: string) =>
  request.put<void>(`/auth/system/user/${userId}/password`, { password })

export const deleteUser = (userIds: number[]) =>
  request.delete<void>(`/auth/system/user/${userIds.join(',')}`)

export const getRoleList = (params?: PageQuery) =>
  request.get<SysRole[]>('/auth/system/role/list', { params })

export const getRoleOptions = () =>
  request.get<RoleOption[]>('/auth/system/role/optionselect')

export const getRole = (roleId: number) =>
  request.get<SysRole>(`/auth/system/role/${roleId}`)

export const addRole = (data: SysRole) =>
  request.post<void>('/auth/system/role', data)

export const updateRole = (data: SysRole) =>
  request.put<void>('/auth/system/role', data)

export const deleteRole = (roleIds: number[]) =>
  request.delete<void>(`/auth/system/role/${roleIds.join(',')}`)

export const getMenuList = (params?: PageQuery) =>
  request.get<SysMenu[]>('/auth/system/menu/list', { params })

export const getMenu = (menuId: number) =>
  request.get<SysMenu>(`/auth/system/menu/${menuId}`)

export const getMenuTreeSelect = () =>
  request.get<SysMenu[]>('/auth/system/menu/treeselect')

export const addMenu = (data: SysMenu) =>
  request.post<void>('/auth/system/menu', data)

export const updateMenu = (data: SysMenu) =>
  request.put<void>('/auth/system/menu', data)

export const deleteMenu = (menuId: number) =>
  request.delete<void>(`/auth/system/menu/${menuId}`)

export const getDeptTree = () =>
  request.get<SysDept[]>('/auth/system/dept/tree')

export const getDept = (deptId: number) =>
  request.get<SysDept>(`/auth/system/dept/${deptId}`)

export const addDept = (data: SysDept) =>
  request.post<void>('/auth/system/dept', data)

export const updateDept = (data: SysDept) =>
  request.put<void>('/auth/system/dept', data)

export const deleteDept = (deptId: number) =>
  request.delete<void>(`/auth/system/dept/${deptId}`)

export const getTenantList = (params?: PageQuery) =>
  request.get<{ records?: SysTenant[]; rows?: SysTenant[]; total?: number }>('/auth/system/tenant/list', { params })

export const getTenantDetail = (tenantId: number) =>
  request.get<SysTenant>(`/auth/system/tenant/${tenantId}`)

export const addTenant = (data: SysTenant) =>
  request.post<void>('/auth/system/tenant', data)

export const updateTenant = (data: SysTenant) =>
  request.put<void>('/auth/system/tenant', data)

export const deleteTenant = (tenantId: number) =>
  request.delete<void>(`/auth/system/tenant/${tenantId}`)

export const changeTenantStatus = (tenantId: number, status: string) =>
  request.put<void>(`/auth/system/tenant/${tenantId}/status`, null, { params: { status } })

export const getTenantStatisticsBatch = (tenantIds: number[]) =>
  request.get<TenantStatistics[]>('/auth/system/tenant/statistics', { params: { tenantIds: tenantIds.join(',') } })

export const refreshTenantStorageUsage = (tenantId: number) =>
  request.post<TenantStorageSummary>(`/auth/system/tenant/${tenantId}/storage/refresh`)

export const uploadFile = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<SysFile>('/auth/system/file/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const getFileList = (params?: PageQuery) =>
  request.get<FilePageResult>('/auth/system/file/list', { params })

export const getFileStorageSummary = () =>
  request.get<TenantStorageSummary>('/auth/system/file/storage/summary')

export const refreshFileStorageSummary = () =>
  request.post<TenantStorageSummary>('/auth/system/file/storage/refresh')

export const deleteFile = (fileIds: number[]) =>
  request.delete<void>(`/auth/system/file/${fileIds.join(',')}`)
