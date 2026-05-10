import request from './request';
import { PageQuery, PageResult } from '@/types';

export interface SysVehicle {
  vehicleId?: number;
  licensePlate: string;
  brand: string;
  model: string;
  color: string;
  capacity: number;
  status: '1' | '2' | '3' | '4' | '5';
  runtimeStatus?: '1' | '2' | '3' | '4' | '5';
  mileage: number;
  purchaseDate?: string;
  insuranceExpiry?: string;
  annualInspectionExpiry?: string;
  maintenanceCycleKm?: number;
  nextMaintenanceMileage?: number;
  managerUserId?: number;
  location?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
  currentUsageId?: number;
  currentUsageStatus?: string;
  currentUserName?: string;
  currentDriverName?: string;
  currentDestination?: string;
  plannedReturnTime?: string;
  nextBookingStartTime?: string;
  warningTags?: string;
  expenseAmount30d?: number;
}

export interface VehicleUsage {
  usageId?: number;
  vehicleId: number;
  applicantId: number;
  driverId?: number;
  driverMode?: 0 | 1;
  startTime: string;
  endTime: string;
  destination: string;
  returnLocation?: string;
  isRoundTrip?: number;
  reason: string;
  passengerCount: number;
  passengers?: string;
  attachmentUrl?: string;
  startMileage?: number;
  endMileage?: number;
  actualStartTime?: string;
  actualEndTime?: string;
  dispatchTime?: string;
  dispatchRemark?: string;
  returnRemark?: string;
  status?: '0' | '1' | '2' | '3' | '4' | '5';
  approverId?: number;
  approverName?: string;
  approveRemark?: string;
  processInstanceId?: string;
  vehiclePlate?: string;
  applicantName?: string;
  driverName?: string;
  totalExpenseAmount?: number;
  tripDistance?: number;
  createTime?: string;
}

export interface VehicleExpense {
  expenseId?: number;
  vehicleId: number;
  usageId?: number;
  expenseType: '1' | '2' | '3' | '4' | '5' | '6';
  amount: number;
  expenseDate: string;
  description?: string;
  receiptUrl?: string;
  vehiclePlate?: string;
  createTime?: string;
}

export interface VehicleMaintenance {
  maintenanceId?: number;
  vehicleId: number;
  maintenanceType: string;
  status?: string;
  title: string;
  description?: string;
  providerName?: string;
  costAmount?: number;
  maintenanceDate?: string;
  nextMaintenanceDate?: string;
  mileageAtService?: number;
  nextMaintenanceMileage?: number;
  attachmentUrl?: string;
  vehiclePlate?: string;
  createTime?: string;
}

export interface VehicleViolation {
  violationId?: number;
  vehicleId: number;
  usageId?: number;
  driverId?: number;
  violationTime: string;
  violationAddress?: string;
  violationReason: string;
  penaltyAmount?: number;
  points?: number;
  status?: string;
  handledTime?: string;
  handlerId?: number;
  remark?: string;
  attachmentUrl?: string;
  vehiclePlate?: string;
  driverName?: string;
  createTime?: string;
}

export interface VehicleStats {
  total: number;
  available: number;
  booked: number;
  inUse: number;
  maintenance: number;
  scrapped: number;
  insuranceExpiringSoon: number;
  annualInspectionExpiringSoon?: number;
  maintenanceDueSoon?: number;
  pendingViolationCount?: number;
  overdueRiskCount?: number;
  expenseAmount30d?: number;
  usageCount30d?: number;
}

export interface ExpenseStats {
  totalAmount: number;
  count: number;
  byType: Record<string, number>;
  monthlyAmount: number;
  lastMonthAmount: number;
}

export interface VehicleProfile {
  vehicle: SysVehicle;
  currentUsage?: VehicleUsage | null;
  nextUsage?: VehicleUsage | null;
  recentUsages: VehicleUsage[];
  recentExpenses: VehicleExpense[];
  maintenances: VehicleMaintenance[];
  violations: VehicleViolation[];
  risks: Array<{
    id: number;
    riskCode: string;
    riskName: string;
    riskLevel: string;
    riskStatus: string;
    detectedTime?: string;
    ownerName?: string;
  }>;
  expenseAmount30d?: number;
  expenseAmount90d?: number;
  tripDistance30d?: number;
  costPerKm30d?: number;
}

export interface VehicleScheduleItem {
  usageId: number;
  vehicleId: number;
  vehiclePlate?: string;
  status: string;
  runtimeStatus: string;
  applicantName?: string;
  driverName?: string;
  destination?: string;
  startTime: string;
  endTime: string;
  actualStartTime?: string;
  actualEndTime?: string;
}

export interface VehicleQuery extends PageQuery {
  licensePlate?: string;
  brand?: string;
  status?: string;
}

export interface UsageQuery extends PageQuery {
  vehicleId?: number;
  applicantId?: number;
  status?: string;
  startTime?: string;
  endTime?: string;
}

export interface ExpenseQuery extends PageQuery {
  vehicleId?: number;
  usageId?: number;
  expenseType?: string;
  startDate?: string;
  endDate?: string;
}

export interface VehicleUsageApprovalRequest {
  approved: boolean;
  remark?: string;
}

export interface VehicleDispatchRequest {
  driverMode?: 0 | 1;
  driverId?: number;
  startMileage?: number;
  dispatchRemark?: string;
  actualStartTime?: string;
}

export interface VehicleReturnRequest {
  endMileage: number;
  remark?: string;
  returnLocation?: string;
}

export const getVehicleList = (query: VehicleQuery) =>
  request.get('/oa/vehicle/list', { params: query }) as Promise<PageResult<SysVehicle>>;

export const getAvailableVehicles = () =>
  request.get('/oa/vehicle/available') as Promise<SysVehicle[]>;

export const getVehicleInfo = (id: number) =>
  request.get(`/oa/vehicle/${id}`) as Promise<SysVehicle>;

export const getVehicleProfile = (id: number) =>
  request.get(`/oa/vehicle/${id}/profile`) as Promise<VehicleProfile>;

export const getVehicleSchedule = (params: { vehicleId?: number; startDate?: string; endDate?: string }) =>
  request.get('/oa/vehicle/schedule', { params }) as Promise<VehicleScheduleItem[]>;

export const addVehicle = (data: SysVehicle) =>
  request.post('/oa/vehicle', data) as Promise<void>;

export const updateVehicle = (data: SysVehicle) =>
  request.put('/oa/vehicle', data) as Promise<void>;

export const deleteVehicle = (ids: number[]) =>
  request.delete(`/oa/vehicle/${ids.join(',')}`) as Promise<void>;

export const getVehicleStats = () =>
  request.get('/oa/vehicle/stats') as Promise<VehicleStats>;

export const getUsageList = (query: UsageQuery) =>
  request.get('/oa/vehicle/usage/list', { params: query }) as Promise<PageResult<VehicleUsage>>;

export const submitUsage = (data: VehicleUsage) =>
  request.post('/oa/vehicle/usage', data) as Promise<void>;

export const getUsageInfo = (id: number) =>
  request.get(`/oa/vehicle/usage/${id}`) as Promise<VehicleUsage>;

export const approveUsage = (id: number, approved: boolean, remark?: string) => {
  const data: VehicleUsageApprovalRequest = { approved, remark };
  return request.put(`/oa/vehicle/usage/${id}/approve`, data) as Promise<void>;
};

export const dispatchUsage = (id: number, data: VehicleDispatchRequest) =>
  request.put(`/oa/vehicle/usage/${id}/dispatch`, data) as Promise<void>;

export const returnVehicle = (id: number, data: VehicleReturnRequest) =>
  request.put(`/oa/vehicle/usage/${id}/return`, data) as Promise<void>;

export const cancelUsage = (id: number) =>
  request.put(`/oa/vehicle/usage/${id}/cancel`) as Promise<void>;

export const getExpenseList = (query: ExpenseQuery) =>
  request.get('/oa/vehicle/expense/list', { params: query }) as Promise<PageResult<VehicleExpense>>;

export const addExpense = (data: VehicleExpense) =>
  request.post('/oa/vehicle/expense', data) as Promise<void>;

export const getExpenseStats = (startDate?: string, endDate?: string) =>
  request.get('/oa/vehicle/expense/stats', { params: { startDate, endDate } }) as Promise<ExpenseStats>;

export const getMaintenanceList = (query: PageQuery & Partial<VehicleMaintenance>) =>
  request.get('/oa/vehicle/maintenance/list', { params: query }) as Promise<PageResult<VehicleMaintenance>>;

export const addMaintenance = (data: VehicleMaintenance) =>
  request.post('/oa/vehicle/maintenance', data) as Promise<void>;

export const getViolationList = (query: PageQuery & Partial<VehicleViolation>) =>
  request.get('/oa/vehicle/violation/list', { params: query }) as Promise<PageResult<VehicleViolation>>;

export const addViolation = (data: VehicleViolation) =>
  request.post('/oa/vehicle/violation', data) as Promise<void>;
