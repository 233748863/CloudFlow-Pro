import request from './request';
import { PageResult } from '@/types';
import { toBackendDateString } from '@/utils/dateFormat';

export interface Supplier {
  supplierId?: number;
  tenantId?: number;
  supplierName: string;
  contactName?: string;
  contactPhone?: string;
  bankName?: string;
  bankAccount?: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface PurchaseItem {
  id?: number;
  tenantId?: number;
  purchaseId?: number;
  consumableId: number;
  consumableName?: string;
  model?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
  receivedQuantity?: number;
}

export interface PurchaseRequest {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  purchaseNo?: string;
  supplierId: number;
  supplierName?: string;
  supplierContact?: string;
  supplierPhone?: string;
  supplierBank?: string;
  supplierAccount?: string;
  totalAmount?: number;
  expectedDate?: string;
  reason: string;
  status?: string;
  paymentRequestId?: number;
  attachmentUrl?: string;
  deptId?: number;
  deptName?: string;
  items?: PurchaseItem[];
  createTime?: string;
  updateTime?: string;
}

export interface PurchaseReceiptPayload {
  remark?: string;
  items: Array<{
    itemId: number;
    quantity: number;
  }>;
}

const normalizeExpectedDateForDisplay = (value?: string) =>
  value ? String(value).slice(0, 10) : undefined;

const normalizeExpectedDateForSubmit = (value?: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} 00:00:00`;
  }
  return toBackendDateString(trimmed);
};

const normalizePurchase = (item: PurchaseRequest): PurchaseRequest => ({
  ...item,
  expectedDate: normalizeExpectedDateForDisplay(item.expectedDate),
});

const normalizePurchasePage = (page: PageResult<PurchaseRequest>) => ({
  ...page,
  records: Array.isArray(page.records) ? page.records.map(normalizePurchase) : page.records,
  rows: Array.isArray(page.rows) ? page.rows.map(normalizePurchase) : page.rows,
});

const normalizePurchasePayload = (data: PurchaseRequest): PurchaseRequest => ({
  ...data,
  expectedDate: normalizeExpectedDateForSubmit(data.expectedDate),
  items: data.items?.map((item) => ({
    ...item,
    amount: Number(item.quantity || 0) * Number(item.unitPrice || 0),
  })),
});

export const supplierApi = {
  list: (params: {
    pageNum?: number;
    pageSize?: number;
    supplierName?: string;
    status?: string;
  }) => request.get('/oa/supplier/list', { params }) as Promise<PageResult<Supplier>>,

  getInfo: (id: number) => request.get(`/oa/supplier/${id}`) as Promise<Supplier>,

  add: (data: Supplier) => request.post('/oa/supplier', data),

  edit: (data: Supplier) => request.put('/oa/supplier', data),

  remove: (ids: number[]) => request.delete(`/oa/supplier/${ids.join(',')}`),
};

export const purchaseRequestApi = {
  list: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    supplierId?: number;
    userId?: number;
  }) => {
    const response = await request.get('/oa/purchase/request/list', { params }) as PageResult<PurchaseRequest>;
    return normalizePurchasePage(response);
  },

  getInfo: async (id: number) => {
    const response = await request.get(`/oa/purchase/request/${id}`) as PurchaseRequest;
    return normalizePurchase(response);
  },

  add: (data: PurchaseRequest) => request.post('/oa/purchase/request', normalizePurchasePayload(data)),

  edit: (data: PurchaseRequest) => request.put('/oa/purchase/request', normalizePurchasePayload(data)),

  remove: (ids: number[]) => request.delete(`/oa/purchase/request/${ids.join(',')}`),

  submit: (id: number) => request.post(`/oa/purchase/request/submit/${id}`),

  receipt: (id: number, data: PurchaseReceiptPayload) =>
    request.post(`/oa/purchase/request/${id}/receipt`, data),

  createPayment: (id: number) => request.post(`/oa/purchase/request/${id}/create-payment`),
};
