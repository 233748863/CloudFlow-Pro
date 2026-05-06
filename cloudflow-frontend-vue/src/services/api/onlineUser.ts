import request from '@/services/api/request'

export interface OnlineUserQuery {
  pageNum?: number
  pageSize?: number
  username?: string
  nickName?: string
  deptName?: string
  tenantId?: number
}

export interface OnlineUserItem {
  token: string
  userId?: number
  username?: string
  nickName?: string
  deptId?: number
  deptName?: string
  tenantId?: number
  avatar?: string
  roles?: string[]
  loginTime?: number
  expireTime?: number
  remainingSeconds?: number
  currentLogin?: boolean
}

export interface OnlineUserPageResult {
  rows?: OnlineUserItem[]
  records?: OnlineUserItem[]
  total?: number
  pageNum?: number
  pageSize?: number
}

export const getOnlineUserPage = (params: OnlineUserQuery) =>
  request.get<OnlineUserPageResult>('/auth/system/online/page', { params })

export const forceLogoutOnlineUsers = (tokens: string[]) =>
  request.delete<string>('/auth/system/online', { data: tokens })
