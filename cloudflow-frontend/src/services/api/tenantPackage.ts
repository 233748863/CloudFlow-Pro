import request from './request';

export interface TenantPackageFeature {
  menuId: number;
  parentId: number;
  menuName: string;
  menuType: 'M' | 'C' | 'F';
  permissions: string | null;
  enabled: boolean;
  fixedAccountOperation: boolean;
  independentOperation: boolean;
}

export interface TenantPackageCatalog {
  features: TenantPackageFeature[];
  modules: string[];
}

export interface TenantPackageSave {
  packageId?: number;
  version?: number;
  packageCode: string;
  packageName: string;
  menuIds: number[];
  enabledModules: string[];
  maxUsers: number;
  maxStorageMb: number;
  price: number;
  billingCycle: 'NONE' | 'MONTHLY' | 'YEARLY';
  sortNo: number;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
  remark: string;
}

export interface TenantPackageTemplate extends TenantPackageSave {
  packageId: number;
  version: number;
  createTime: string;
  updateTime: string;
}

export interface TenantPackagePage {
  rows: TenantPackageTemplate[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface TenantPackageAdjustments {
  addMenuIds: number[];
  removeMenuIds: number[];
  maxUsers: number | null;
  maxStorageMb: number | null;
}

export interface TenantPackageSelection {
  packageId: number;
  packageVersion: number;
  adjustments: TenantPackageAdjustments;
}

export interface TenantPackageSnapshot {
  tenantId: number;
  packageId: number;
  packageVersion: number;
  tenantVersion: number;
  adjustments: TenantPackageAdjustments;
  effective: { menuIds: number[]; permissions: string[]; quotas: { maxUsers: number; maxStorageMb: number } };
}

export interface TenantPackageSyncView {
  syncId: number;
  status: string;
  preview: {
    platformTenantId: number;
    operatorId: number;
    packageId: number;
    packageVersion: number;
    createdAt: string;
    expiresAt: string;
    hash: string;
    items: { targetTenantId: number; before: TenantPackageSnapshot; proposed: TenantPackageSnapshot | null; errorCode: string | null }[];
  };
  items: { tenantId: number; status: string; errorCode: string | null; appliedTime: string | null }[];
}

const base = '/auth/system/tenant-package';
export const listTenantPackages = (query: { pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<TenantPackagePage>(`${base}/list`, { params: query, signal, silent: true });
export const readTenantPackage = (packageId: number, signal?: AbortSignal) =>
  request.get<TenantPackageTemplate>(`${base}/${packageId}`, { signal, silent: true });
export const readTenantPackageCatalog = (signal?: AbortSignal) =>
  request.get<TenantPackageCatalog>(`${base}/catalog`, { signal, silent: true });
export const saveTenantPackage = (payload: TenantPackageSave) => payload.packageId == null
  ? request.post<TenantPackageTemplate>(base, payload, { silent: true })
  : request.put<TenantPackageTemplate>(base, payload, { silent: true });
export const previewTenantPackageSync = (packageId: number, tenantIds: number[]) =>
  request.post<TenantPackageSyncView>(`${base}/${packageId}/sync-preview`, { tenantIds }, { silent: true });
export const readTenantPackageSync = (syncId: number, signal?: AbortSignal) =>
  request.get<TenantPackageSyncView>(`${base}/sync/${syncId}`, { signal, silent: true });
export const confirmTenantPackageSync = (syncId: number, previewHash: string) =>
  request.post<TenantPackageSyncView>(`${base}/sync/${syncId}/confirm`, { previewHash }, { silent: true });
export const cancelTenantPackageSync = (syncId: number, previewHash: string) =>
  request.post<TenantPackageSyncView>(`${base}/sync/${syncId}/cancel`, { previewHash }, { silent: true });
