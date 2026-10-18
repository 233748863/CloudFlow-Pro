import request from '../request';
import type { PageResult } from '@/types';
import type { CrmPriceBook, CrmProduct, CrmSalesTarget, CrmSalesTargetPreview, CrmSalesTargetWrite } from './types';

// ===== 产品 =====

export const listProducts = (params: {
  pageNum?: number;
  pageSize?: number;
  productName?: string;
  category?: string;
  status?: string;
}) => request.get('/crm/product/list', { params }) as Promise<PageResult<CrmProduct>>;

export const addProduct = (data: CrmProduct) => request.post('/crm/product', data);
export const editProduct = (data: CrmProduct) => request.put('/crm/product', data);
export const removeProduct = (ids: number[]) =>
  request.delete(`/crm/product/${ids.join(',')}`);

// ===== 价目表 =====

export const listPriceBooks = (params: {
  pageNum?: number;
  pageSize?: number;
  priceBookName?: string;
  status?: string;
}) => request.get('/crm/price-book/list', { params }) as Promise<PageResult<CrmPriceBook>>;

export const addPriceBook = (data: CrmPriceBook) => request.post('/crm/price-book', data);
export const editPriceBook = (data: CrmPriceBook) => request.put('/crm/price-book', data);
export const removePriceBook = (ids: number[]) =>
  request.delete(`/crm/price-book/${ids.join(',')}`);

// ===== 销售目标 =====

export const listSalesTargets = (params: {
  pageNum?: number;
  pageSize?: number;
  targetName?: string;
  dimensionType?: string;
  periodType?: string;
  targetYear?: number;
  targetPeriod?: number;
  calculationBasis?: string;
  currency?: string;
  status?: string;
}) => request.get('/crm/sales-target/list', { params }) as Promise<PageResult<CrmSalesTarget>>;

export const getSalesTarget = (id: number) => request.get<CrmSalesTarget>(`/crm/sales-target/${id}`);
export const getSalesTargetCreation = (key: string) => request.get<CrmSalesTarget | null>(`/crm/sales-target/creation/${encodeURIComponent(key)}`);
export const previewSalesTarget = (data: CrmSalesTargetWrite) => request.post<CrmSalesTargetPreview>('/crm/sales-target/preview', data);
export const addSalesTarget = (data: CrmSalesTargetWrite) => request.post<CrmSalesTarget>('/crm/sales-target', data);
export const editSalesTarget = (data: CrmSalesTargetWrite) => request.put<CrmSalesTarget>('/crm/sales-target', data);
export const removeSalesTarget = (ids: number[], versions: number[]) =>
  request.delete(`/crm/sales-target/${ids.join(',')}`, { params: { versions: versions.join(',') } });
