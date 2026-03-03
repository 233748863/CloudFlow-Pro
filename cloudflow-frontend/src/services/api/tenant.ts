import request from './request';
import type { PageQuery } from './auth';

/**
 * 租户管理API
 */

/** 租户数据 */
export interface SysTenant {
  tenantId?: number;
  tenantName: string;
  contactName?: string;
  contactPhone?: string;
  companyName?: string;
  address?: string;
  domain?: string;
  packageId?: number;
  expireTime?: string;
  accountCount?: number;
  status?: string;
  remark?: string;
}

// 获取租户列表
export const getTenantList = (params?: PageQuery) => {
  return request.get('/auth/system/tenant/list', { params });
};

// 获取租户详情
export const getTenantDetail = (tenantId: number) => {
  return request.get(`/auth/system/tenant/${tenantId}`);
};

// 新增租户
export const addTenant = (data: SysTenant) => {
  return request.post('/auth/system/tenant', data);
};

// 修改租户
export const updateTenant = (data: SysTenant) => {
  return request.put('/auth/system/tenant', data);
};

// 删除租户
export const deleteTenant = (tenantIds: number[]) => {
  return request.delete(`/auth/system/tenant/${tenantIds.join(',')}`);
};

// 修改租户状态
export const changeTenantStatus = (data: { tenantId: number; status: string }) => {
  return request.put(`/auth/system/tenant/${data.tenantId}/status`, null, {
    params: { status: data.status },
  });
};

// 获取租户统计信息
export const getTenantStatistics = (tenantId: number) => {
  return request.get(`/auth/system/tenant/${tenantId}/check`);
};
