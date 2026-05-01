import request from './request';
import type { PageQuery } from './auth';

export interface SysTenant {
  tenantId?: number;
  tenantCode?: string;
  tenantName: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  companyName?: string;
  address?: string;
  domain?: string;
  packageId?: number;
  expireTime?: string;
  accountCount?: number;
  userLimit?: number;
  storageLimit?: number;
  storageUsed?: number;
  status?: string;
  remark?: string;
  createTime?: string;
}

export interface TenantStatistics {
  expired: boolean;
  disabled: boolean;
  userLimitReached: boolean;
  userCount: number;
}

export interface TenantStatisticsItem extends TenantStatistics {
  tenantId: number;
}

export interface TenantStorageSummary {
  tenantId: number;
  storageLimit: number;
  storageUsed: number;
  remainingStorage: number;
  storageUsagePercent: number;
}

export const getTenantList = (params?: PageQuery) => {
  return request.get('/auth/system/tenant/list', { params });
};

export const getTenantDetail = (tenantId: number) => {
  return request.get(`/auth/system/tenant/${tenantId}`) as Promise<SysTenant>;
};

export const addTenant = (data: SysTenant) => {
  return request.post('/auth/system/tenant', data);
};

export const updateTenant = (data: SysTenant) => {
  return request.put('/auth/system/tenant', data);
};

export const deleteTenant = (tenantIds: number[]) => {
  return request.delete(`/auth/system/tenant/${tenantIds.join(',')}`);
};

export const changeTenantStatus = (data: { tenantId: number; status: string }) => {
  return request.put(`/auth/system/tenant/${data.tenantId}/status`, null, {
    params: { status: data.status },
  });
};

export const getTenantStatistics = (tenantId: number) => {
  return request.get(`/auth/system/tenant/${tenantId}/check`) as Promise<TenantStatistics>;
};

export const getTenantStatisticsBatch = (tenantIds: number[]) => {
  if (tenantIds.length === 0) {
    return Promise.resolve([] as TenantStatisticsItem[]);
  }

  return request.get('/auth/system/tenant/statistics', {
    params: {
      tenantIds: tenantIds.join(','),
    },
  }) as Promise<TenantStatisticsItem[]>;
};

export const refreshTenantStorageUsage = (tenantId: number) => {
  return request.post(`/auth/system/tenant/${tenantId}/storage/refresh`) as Promise<TenantStorageSummary>;
};
