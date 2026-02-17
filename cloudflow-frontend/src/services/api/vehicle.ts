import request from './request';
import { PageQuery, PageResult } from '@/types';

// --- 类型定义 ---

/** 车辆信息 */
export interface SysVehicle {
  vehicleId?: number;
  licensePlate: string;
  brand: string;
  model: string;
  color: string;
  capacity: number;
  /** 状态：1可用 2已预约 3使用中 4维修中 5报废 */
  status: '1' | '2' | '3' | '4' | '5';
  mileage: number;
  purchaseDate?: string;
  insuranceExpiry?: string;
  /** 下次保养日期 */
  nextMaintenanceDate?: string;
  location?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

/** 用车记录 */
export interface VehicleUsage {
  usageId?: number;
  vehicleId: number;
  applicantId: number;
  driverId?: number;
  startTime: string;
  endTime: string;
  destination: string;
  /** 还车地点 */
  returnLocation?: string;
  /** 是否往返(0单程 1往返) */
  isRoundTrip?: number;
  reason: string;
  passengerCount: number;
  passengers?: string;
  /** 附件URL（多个用逗号分隔） */
  attachmentUrl?: string;
  startMileage?: number;
  endMileage?: number;
  /** 状态：0待审批 1已批准 2已驳回 3进行中 4已完成 5已取消 */
  status?: '0' | '1' | '2' | '3' | '4' | '5';
  /** 审批人 */
  approverId?: number;
  approverName?: string;
  /** 审批意见 */
  approveRemark?: string;
  processInstanceId?: string;
  vehiclePlate?: string;
  applicantName?: string;
  driverName?: string;
  createTime?: string;
}

/** 车辆费用 */
export interface VehicleExpense {
  expenseId?: number;
  vehicleId: number;
  usageId?: number;
  /** 费用类型：1油费 2过路费 3停车费 4维修保养 5保险 6其他 */
  expenseType: '1' | '2' | '3' | '4' | '5' | '6';
  amount: number;
  expenseDate: string;
  description?: string;
  receiptUrl?: string;
  vehiclePlate?: string;
  createTime?: string;
}

/** 车辆统计信息 */
export interface VehicleStats {
  total: number;
  available: number;
  booked: number;
  inUse: number;
  maintenance: number;
  scrapped: number;
  /** 保险即将到期数量（30天内） */
  insuranceExpiringSoon: number;
}

/** 费用统计信息 */
export interface ExpenseStats {
  totalAmount: number;
  count: number;
  /** 按类型分组的费用 */
  byType: Record<string, number>;
  /** 本月费用 */
  monthlyAmount: number;
  /** 上月费用 */
  lastMonthAmount: number;
}

// --- 车辆管理 API ---

/** 获取车辆列表（分页） */
export const getVehicleList = (query: any) => {
  return request.get('/oa/vehicle/list', { params: query }) as Promise<PageResult<SysVehicle>>;
};

/** 获取可用车辆列表 */
export const getAvailableVehicles = () => {
  return request.get('/oa/vehicle/available') as Promise<SysVehicle[]>;
};

/** 获取车辆详情 */
export const getVehicleInfo = (id: number) => {
  return request.get(`/oa/vehicle/${id}`) as Promise<SysVehicle>;
};

/** 新增车辆 */
export const addVehicle = (data: SysVehicle) => {
  return request.post('/oa/vehicle', data) as Promise<void>;
};

/** 更新车辆 */
export const updateVehicle = (data: SysVehicle) => {
  return request.put('/oa/vehicle', data) as Promise<void>;
};

/** 删除车辆 */
export const deleteVehicle = (ids: number[]) => {
  return request.delete(`/oa/vehicle/${ids.join(',')}`) as Promise<void>;
};

/** 获取车辆统计概览 */
export const getVehicleStats = () => {
  return request.get('/oa/vehicle/stats') as Promise<VehicleStats>;
};

// --- 用车申请 API ---

/** 获取用车记录列表（分页） */
export const getUsageList = (query: any) => {
  return request.get('/oa/vehicle/usage/list', { params: query }) as Promise<PageResult<VehicleUsage>>;
};

/** 提交用车申请 */
export const submitUsage = (data: VehicleUsage) => {
  return request.post('/oa/vehicle/usage', data) as Promise<void>;
};

/** 获取用车记录详情 */
export const getUsageInfo = (id: number) => {
  return request.get(`/oa/vehicle/usage/${id}`) as Promise<VehicleUsage>;
};

/** 审批用车申请 */
export const approveUsage = (id: number, approved: boolean, remark?: string) => {
  return request.put(`/oa/vehicle/usage/${id}/approve`, { approved, remark }) as Promise<void>;
};

/** 归还车辆（完成用车） */
export const returnVehicle = (id: number, data: { endMileage: number; remark?: string }) => {
  return request.put(`/oa/vehicle/usage/${id}/return`, data) as Promise<void>;
};

/** 取消用车申请 */
export const cancelUsage = (id: number) => {
  return request.put(`/oa/vehicle/usage/${id}/cancel`) as Promise<void>;
};

// --- 费用管理 API ---

/** 获取费用列表（分页） */
export const getExpenseList = (query: any) => {
  return request.get('/oa/vehicle/expense/list', { params: query }) as Promise<PageResult<VehicleExpense>>;
};

/** 新增费用 */
export const addExpense = (data: VehicleExpense) => {
  return request.post('/oa/vehicle/expense', data) as Promise<void>;
};

/** 获取费用统计 */
export const getExpenseStats = (startDate?: string, endDate?: string) => {
  return request.get('/oa/vehicle/expense/stats', { params: { startDate, endDate } }) as Promise<ExpenseStats>;
};
