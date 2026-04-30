import request from './request';

/** 耗材接口类型 */
export interface Consumable {
  consumableId?: number;
  name: string;
  model?: string;
  unit?: string;
  quantity?: number;
  lowStockThreshold?: number;
  tenantId?: number;
  createBy?: string;
  createTime?: string;
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

/** 耗材管理相关API */
export const consumableApi = {
  /** 分页查询耗材列表 */
  list: (params: {
    pageNum?: number;
    pageSize?: number;
    name?: string;
    model?: string;
  }) => request.get('/oa/consumable/list', { params }),

  /** 查询耗材详情 */
  getInfo: (id: number) => request.get(`/oa/consumable/${id}`),

  /** 新增耗材 */
  add: (data: Consumable) => request.post('/oa/consumable', data),

  /** 修改耗材 */
  edit: (data: Consumable) => request.put('/oa/consumable', data),

  /** 删除耗材 */
  remove: (ids: number[]) => request.delete(`/oa/consumable/${ids.join(',')}`),

  /** 获取库存流水 */
  logs: (id: number) => request.get(`/oa/consumable/${id}/logs`),

  /** 获取库存不足的耗材列表 */
  getLowStock: () => request.get('/oa/consumable/low-stock'),

  /** 入库操作 */
  addStock: (id: number, quantity: number, remark: string) =>
    request.post(`/oa/consumable/${id}/add-stock`, { quantity, remark }),

  /** 出库操作 */
  reduceStock: (id: number, quantity: number, stockOutType: 'ISSUE' | 'LOSS', remark: string) =>
    request.post(`/oa/consumable/${id}/reduce-stock`, { quantity, stockOutType, remark }),
};
