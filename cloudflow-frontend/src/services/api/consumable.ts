import request from './request';
import type { ConsumablePosting, ConsumableStockCommand, ConsumableIssueResult } from './consumableLedger';

/** 耗材接口类型 */
export interface Consumable {
  consumableId?: number;
  name: string;
  model?: string;
  unit?: string;
  quantity?: number;
  lowStockThreshold?: number;
  defaultSupplierId?: number;
  defaultSupplierName?: string;
  targetStock?: number;
  warnEnabled?: number;
  categoryId?: number | string;
  brand?: string;
  maxStock?: number;
  storageLocation?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  version?: number;
  stockAmount?: string;
  avgCost?: string;
  lastPurchasePrice?: string;
  lastCalcTime?: string;
  tenantId?: number;
  createBy?: string;
  createTime?: string;
}

export interface ConsumableReplenishmentSuggestion {
  consumableId: number;
  name: string;
  model?: string;
  unit?: string;
  quantity?: number;
  lowStockThreshold?: number;
  targetStock?: number;
  suggestedQuantity?: number;
  defaultSupplierId?: number;
  defaultSupplierName?: string;
}

export interface ConsumableStockLog {
  logId?: number;
  refId?: number;
  refType?: string;
  type?: string;
  quantityChange?: number;
  operatorId?: number;
  targetId?: number;
  remark?: string;
  createTime?: string;
}

export interface ConsumableStockRequest extends ConsumableStockCommand {}

export interface ConsumableStockOutRequest extends ConsumableStockRequest {
  stockOutType: 'ISSUE' | 'LOSS';
  requestId?: string;
  itemId?: string;
  requestVersion?: number;
}

export interface ConsumableListResult { records?: Consumable[]; rows?: Consumable[]; total: number }

const masterPayload = (data: Consumable, edit = false) => ({
  ...(edit ? { consumableId: data.consumableId, version: data.version, status: data.status } : {}),
  name: data.name.trim(), model: data.model?.trim() || undefined, unit: data.unit?.trim(),
  categoryId: data.categoryId || undefined, brand: data.brand?.trim() || undefined,
  lowStockThreshold: data.lowStockThreshold, targetStock: data.targetStock, maxStock: data.maxStock,
  defaultSupplierId: data.defaultSupplierId, warnEnabled: data.warnEnabled, storageLocation: data.storageLocation?.trim() || undefined,
});

/** 耗材管理相关API */
export const consumableApi = {
  /** 分页查询耗材列表 */
  list: (params: {
    pageNum?: number;
    pageSize?: number;
    name?: string;
    model?: string;
    categoryId?: string;
    status?: string;
  }) => request.get('/oa/consumable/list', { params }) as Promise<ConsumableListResult>,

  /** 查询耗材详情 */
  getInfo: (id: number | string) => request.get(`/oa/consumable/${id}`) as Promise<Consumable>,

  /** 新增耗材 */
  add: (data: Consumable) => request.post('/oa/consumable', masterPayload(data)),

  /** 修改耗材 */
  edit: (data: Consumable) => request.put('/oa/consumable', masterPayload(data, true)),

  /** 删除耗材 */
  remove: (ids: number[]) => request.delete(`/oa/consumable/${ids.join(',')}`),

  /** 获取库存流水 */
  logs: (id: number) => request.get(`/oa/consumable/${id}/logs`),

  /** 获取库存不足的耗材列表 */
  getLowStock: () => request.get('/oa/consumable/low-stock') as Promise<Consumable[]>,

  /** 获取补货建议 */
  getReplenishmentSuggestions: () =>
    request.get('/oa/consumable/replenishment-suggestions') as Promise<ConsumableReplenishmentSuggestion[]>,

  /** 入库操作 */
  addStock: (id: number | string, data: ConsumableStockRequest) => request.post(`/oa/consumable/${id}/add-stock`, data) as Promise<ConsumablePosting>,

  /** 出库操作 */
  reduceStock: (id: number | string, data: ConsumableStockOutRequest) => request.post(`/oa/consumable/${id}/reduce-stock`, data) as Promise<ConsumablePosting | ConsumableIssueResult>,
};
