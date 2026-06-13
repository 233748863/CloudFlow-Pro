import request from '../request';
import type { PageResult } from '@/types';
import type { CrmPriceBook, CrmProduct, CrmSalesTarget } from './types';

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
  status?: string;
}) => request.get('/crm/sales-target/list', { params }) as Promise<PageResult<CrmSalesTarget>>;

export const addSalesTarget = (data: CrmSalesTarget) => request.post('/crm/sales-target', data);
export const editSalesTarget = (data: CrmSalesTarget) => request.put('/crm/sales-target', data);
export const removeSalesTarget = (ids: number[]) =>
  request.delete(`/crm/sales-target/${ids.join(',')}`);
