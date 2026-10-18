import request from './request';
import type { SysSupplier } from './oaOperations';
import { PageResult } from '@/types';
import { toBackendDateString } from '@/utils/dateFormat';
import { completeConsumableOperation, consumableOperationStorageKey, freezeConsumableOperation, newConsumableOperationKey, readConsumableOperation } from './consumableOperation';
import type { ConsumablePageResult, ConsumablePosting, ConsumableReceiptView } from './consumableLedger';

export interface Supplier extends SysSupplier {
  supplierName: string;
}

export interface PurchaseItem {
  rfqItemId?: number;
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
  budgetSubjectCode?: string;
  budgetSubjectName?: string;
}

export interface PurchaseRequest {
  rfqId?: number;
  version?: number;
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
  paymentStatus?: string;
  paymentRequestId?: number;
  attachmentUrl?: string;
  deptId?: number;
  deptName?: string;
  projectId?: number;
  projectName?: string;
  customerId?: number;
  customerName?: string;
  budgetSubjectCode?: string;
  budgetSubjectName?: string;
  items?: PurchaseItem[];
  createTime?: string;
  updateTime?: string;
}

export interface PurchaseReceiptPayload {
  operationKey?: string;
  purchaseVersion?: number;
  remark?: string;
  items: Array<{
    itemId: number | string;
    quantity: number;
  }>;
}

type FrozenPurchaseReceipt = PurchaseReceiptPayload & { operationKey: string; purchaseVersion: number };
const receiptScope = (id: number | string) => consumableOperationStorageKey(`purchase:receipt:${id}`);
const receiptContent = (data: PurchaseReceiptPayload) => JSON.stringify({
  remark: data.remark?.trim() || '',
  items: data.items.map((item) => ({ itemId: String(item.itemId), quantity: item.quantity })).sort((first, second) => first.itemId.localeCompare(second.itemId)),
});

export const getPendingConsumableReceipt = (id: number | string) => readConsumableOperation<FrozenPurchaseReceipt>(receiptScope(id));
export const clearConsumableReceiptAfterVerification = (id: number | string) => completeConsumableOperation(receiptScope(id));

const receiveConsumables = async (id: number | string, data: PurchaseReceiptPayload): Promise<ConsumablePosting> => {
  const key = receiptScope(id);
  let command = readConsumableOperation<FrozenPurchaseReceipt>(key);
  if (!command) {
    const purchase = data.purchaseVersion == null ? await purchaseRequestApi.getInfo(id) : null;
    const version = data.purchaseVersion ?? purchase?.version;
    if (!Number.isInteger(version) || version! < 0) throw new Error('采购单缺少有效版本，未发送收货请求');
    command = freezeConsumableOperation(key, { ...data, operationKey: data.operationKey ?? newConsumableOperationKey(), purchaseVersion: version! });
  }
  if (receiptContent(command) !== receiptContent(data) || data.operationKey && data.operationKey !== command.operationKey || data.purchaseVersion != null && data.purchaseVersion !== command.purchaseVersion) {
    throw new Error(`上一笔收货尚未确认，请恢复原明细重试或先核对收货记录；原明细：${command.items.map((item) => `#${item.itemId} 数量${item.quantity}`).join('、')}`);
  }
  const result = await request.post(`/oa/purchase/request/${id}/receipt`, command) as ConsumablePosting;
  completeConsumableOperation(key);
  return result;
};

export interface PurchaseFromSuggestionPayload {
  supplierId?: number;
  expectedDate?: string;
  reason?: string;
  items: Array<{
    consumableId: number;
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

  getInfo: async (id: number | string) => {
    const response = await request.get(`/oa/purchase/request/${id}`) as PurchaseRequest;
    return normalizePurchase(response);
  },

  add: (data: PurchaseRequest) => request.post('/oa/purchase/request', normalizePurchasePayload(data)),

  edit: (data: PurchaseRequest) => request.put('/oa/purchase/request', normalizePurchasePayload(data)),

  remove: (ids: number[]) => request.delete(`/oa/purchase/request/${ids.join(',')}`),

  submit: (id: number) => request.post(`/oa/purchase/request/submit/${id}`),

  receipt: receiveConsumables,

  receipts: (id: number | string, params: { pageNum?: number; pageSize?: number } = {}) =>
    request.get(`/oa/purchase/request/${id}/receipts`, { params }) as Promise<ConsumablePageResult<ConsumableReceiptView>>,

  createPayment: (id: number) => request.post(`/oa/purchase/request/${id}/create-payment`),

  createFromSuggestion: (data: PurchaseFromSuggestionPayload) =>
    request.post('/oa/purchase/request/from-suggestion', {
      ...data,
      expectedDate: normalizeExpectedDateForSubmit(data.expectedDate),
    }) as Promise<PurchaseRequest>,
};
