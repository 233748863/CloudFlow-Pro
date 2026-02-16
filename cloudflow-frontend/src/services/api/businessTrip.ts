import request from './request';
import { PageResult } from '@/types';

/** 出差申请接口类型 */
export interface BusinessTrip {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  tripNo?: string;
  destination: string;
  startDate: string;
  endDate: string;
  tripDays?: number;
  transportType?: string;   // PLANE / TRAIN / CAR / OTHER
  estimatedCost?: number;
  companions?: string;
  reason: string;
  itinerary?: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

/** 出差申请 API */
export const businessTripApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; destination?: string }) =>
    request.get('/oa/business-trip/list', { params }) as Promise<PageResult<BusinessTrip>>,
  getInfo: (id: number) => request.get(`/oa/business-trip/${id}`) as Promise<BusinessTrip>,
  add: (data: BusinessTrip) => request.post('/oa/business-trip', data),
  edit: (data: BusinessTrip) => request.put('/oa/business-trip', data),
  remove: (ids: number[]) => request.delete(`/oa/business-trip/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/business-trip/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/business-trip/cancel/${id}`),
};
