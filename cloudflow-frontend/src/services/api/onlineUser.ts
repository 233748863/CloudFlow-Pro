import request from './request';

/** 在线用户查询参数 */
export interface OnlineUserQuery {
  pageNum?: number;
  pageSize?: number;
  username?: string;
  nickName?: string;
  deptName?: string;
  tenantId?: number;
}

/** 在线用户条目 */
export interface OnlineUserItem {
  token: string;
  userId?: number;
  username?: string;
  nickName?: string;
  deptId?: number;
  deptName?: string;
  tenantId?: number;
  avatar?: string;
  roles?: string[];
  loginTime?: number;
  expireTime?: number;
  remainingSeconds?: number;
  currentLogin?: boolean;
}

/** 在线用户分页结果 */
export interface OnlineUserPageResult {
  rows: OnlineUserItem[];
  total: number;
  pageNum: number;
  pageSize: number;
}

/** 分页查询在线用户 */
export const getOnlineUserPage = (params: OnlineUserQuery): Promise<OnlineUserPageResult> => {
  return request.get<OnlineUserPageResult>('/auth/system/online/page', { params });
};

/** 批量强制下线 */
export const forceLogoutOnlineUsers = (tokens: string[]): Promise<string> => {
  return request.delete<string>('/auth/system/online', { data: tokens });
};
