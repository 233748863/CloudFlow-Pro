import request from './request';

export type IpAclRuleType = 'EXACT' | 'CIDR' | 'RANGE';
export type IpAclMode = 'BLACK' | 'WHITE';
export type IpAclStatus = 'ACTIVE' | 'INACTIVE';

export interface SysIpAcl {
  id?: number;
  tenantId?: number;
  ruleCode: string;
  ruleName: string;
  ipPattern: string;
  ruleType: IpAclRuleType;
  mode: IpAclMode;
  priority: number;
  status: IpAclStatus;
  expireAt?: string;
  reason?: string;
  deleted?: number;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export interface IpAclPage {
  records: SysIpAcl[];
  total: number;
  size: number;
  current: number;
}

export interface IpAclQuery {
  keyword?: string;
  mode?: IpAclMode | '';
  status?: IpAclStatus | '';
  pageNum?: number;
  pageSize?: number;
}

export const pageIpAcl = (params: IpAclQuery) =>
  request.get<IpAclPage>('/auth/system/ipAcl/page', { params });

export const listActiveIpAcl = () =>
  request.get<SysIpAcl[]>('/auth/system/ipAcl/active');

export const getIpAcl = (id: number) =>
  request.get<SysIpAcl>(`/auth/system/ipAcl/${id}`);

export const createIpAcl = (data: SysIpAcl) =>
  request.post('/auth/system/ipAcl', data);

export const updateIpAcl = (data: SysIpAcl) =>
  request.put('/auth/system/ipAcl', data);

export const deleteIpAcl = (id: number) =>
  request.delete(`/auth/system/ipAcl/${id}`);

export const toggleIpAcl = (id: number, status: IpAclStatus) =>
  request.post(`/auth/system/ipAcl/${id}/status`, undefined, { params: { status } });

export const republishIpAcl = () =>
  request.post('/auth/system/ipAcl/republish');

export type UserBlacklistStatus = 'ACTIVE' | 'INACTIVE';

export interface SysUserBlacklist {
  id?: number;
  tenantId?: number;
  userId: number;
  userName?: string;
  status: UserBlacklistStatus;
  expireAt?: string;
  reason?: string;
  opUserId?: number;
  opUserName?: string;
  deleted?: number;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export interface UserBlacklistPage {
  records: SysUserBlacklist[];
  total: number;
  size: number;
  current: number;
}

export interface UserBlacklistQuery {
  keyword?: string;
  status?: UserBlacklistStatus | '';
  pageNum?: number;
  pageSize?: number;
}

export const pageUserBlacklist = (params: UserBlacklistQuery) =>
  request.get<UserBlacklistPage>('/auth/system/userBlacklist/page', { params });

export const getUserBlacklist = (id: number) =>
  request.get<SysUserBlacklist>(`/auth/system/userBlacklist/${id}`);

export const banUser = (data: SysUserBlacklist) =>
  request.post('/auth/system/userBlacklist', data);

export const updateUserBlacklist = (data: SysUserBlacklist) =>
  request.put('/auth/system/userBlacklist', data);

export const unbanUser = (id: number) =>
  request.post(`/auth/system/userBlacklist/${id}/unban`);

export const deleteUserBlacklist = (id: number) =>
  request.delete(`/auth/system/userBlacklist/${id}`);
