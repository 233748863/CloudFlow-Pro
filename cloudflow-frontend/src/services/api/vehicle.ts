import request from './request';
import { PageQuery, PageResult, R } from '@/types'; // Assuming these exist or I can infer structure

// --- Types ---

export interface SysVehicle {
  vehicleId?: number;
  licensePlate: string;
  brand: string;
  model: string;
  color: string;
  capacity: number;
  status: '1' | '2' | '3' | '4' | '5'; // 1:Available, 2:Booked, 3:InUse, 4:Maintenance, 5:Scrapped
  mileage: number;
  purchaseDate?: string;
  insuranceExpiry?: string;
  location?: string;
  remark?: string;
  createTime?: string;
}

export interface VehicleUsage {
  usageId?: number;
  vehicleId: number;
  applicantId: number;
  driverId?: number;
  startTime: string;
  endTime: string;
  destination: string;
  reason: string;
  passengerCount: number;
  passengers?: string;
  startMileage?: number;
  endMileage?: number;
  status?: '0' | '1' | '2' | '3' | '4' | '5'; // 0:Pending, 1:Approved, 2:Rejected, 3:InProgress, 4:Completed, 5:Cancelled
  processInstanceId?: string;
  vehiclePlate?: string; // from backend
  applicantName?: string; // from backend
  driverName?: string; // from backend
  createTime?: string;
}

export interface VehicleExpense {
  expenseId?: number;
  vehicleId: number;
  usageId?: number;
  expenseType: '1' | '2' | '3' | '4' | '5' | '6'; // 1:Fuel, 2:Toll, 3:Parking, 4:Maintenance, 5:Insurance, 6:Other
  amount: number;
  expenseDate: string;
  description?: string;
  receiptUrl?: string;
  vehiclePlate?: string;
  createTime?: string;
}

// --- API ---

// Vehicle Management
export const getVehicleList = (query: any) => {
  return request.get('/oa/vehicle/list', { params: query }) as Promise<PageResult<SysVehicle>>;
};

export const getAvailableVehicles = () => {
  return request.get('/oa/vehicle/available') as Promise<SysVehicle[]>;
};

export const getVehicleInfo = (id: number) => {
  return request.get(`/oa/vehicle/${id}`) as Promise<SysVehicle>;
};

export const addVehicle = (data: SysVehicle) => {
  return request.post('/oa/vehicle', data) as Promise<void>;
};

export const updateVehicle = (data: SysVehicle) => {
  return request.put('/oa/vehicle', data) as Promise<void>;
};

export const deleteVehicle = (ids: number[]) => {
  return request.delete(`/oa/vehicle/${ids.join(',')}`) as Promise<void>;
};

// Vehicle Usage
export const getUsageList = (query: any) => {
  return request.get('/oa/vehicle/usage/list', { params: query }) as Promise<PageResult<VehicleUsage>>;
};

export const submitUsage = (data: VehicleUsage) => {
  return request.post('/oa/vehicle/usage', data) as Promise<void>;
};

export const getUsageInfo = (id: number) => {
  return request.get(`/oa/vehicle/usage/${id}`) as Promise<VehicleUsage>;
};

// Vehicle Expense
export const getExpenseList = (query: any) => {
  return request.get('/oa/vehicle/expense/list', { params: query }) as Promise<PageResult<VehicleExpense>>;
};

export const addExpense = (data: VehicleExpense) => {
  return request.post('/oa/vehicle/expense', data) as Promise<void>;
};

export const getExpenseStats = (startDate?: string, endDate?: string) => {
  return request.get('/oa/vehicle/expense/stats', { params: { startDate, endDate } }) as Promise<any>;
};
