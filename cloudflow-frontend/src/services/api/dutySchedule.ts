import request from './request';
import { PageResult } from '@/types';

/** 值班排班接口类型 */
export interface DutySchedule {
  scheduleId?: number;
  tenantId?: number;
  title: string;
  scheduleType: string;     // DAILY / HOLIDAY / EMERGENCY
  dutyDate: string;
  shiftType?: string;       // DAY / NIGHT / FULL
  startTime?: string;
  endTime?: string;
  userId: number;
  userName?: string;
  backupUserId?: number;
  backupUserName?: string;
  deptId?: number;
  deptName?: string;
  location?: string;
  dutyContent?: string;
  checkInTime?: string;
  checkOutTime?: string;
  status?: string;
  swapReason?: string;
  remark?: string;
  createTime?: string;
}

/** 值班排班 API */
export const dutyScheduleApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; scheduleType?: string; userId?: number }) =>
    request.get('/oa/duty/list', { params }) as Promise<PageResult<DutySchedule>>,
  calendar: (params: { year: number; month: number; deptId?: number }) =>
    request.get('/oa/duty/calendar', { params }) as Promise<DutySchedule[]>,
  getInfo: (id: number) => request.get(`/oa/duty/${id}`) as Promise<DutySchedule>,
  add: (data: DutySchedule) => request.post('/oa/duty', data),
  addBatch: (data: DutySchedule[]) => request.post('/oa/duty/batch', data),
  edit: (data: DutySchedule) => request.put('/oa/duty', data),
  remove: (ids: number[]) => request.delete(`/oa/duty/${ids.join(',')}`),
  checkIn: (id: number) => request.put(`/oa/duty/checkin/${id}`),
  checkOut: (id: number) => request.put(`/oa/duty/checkout/${id}`),
  swap: (id: number, data: { backupUserId: number; backupUserName: string; reason: string }) =>
    request.put(`/oa/duty/swap/${id}`, data),
};
