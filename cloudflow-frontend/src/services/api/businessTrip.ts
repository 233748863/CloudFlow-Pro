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
  /** 出发地 */
  departure?: string;
  destination: string;
  startDate: string;
  endDate: string;
  tripDays?: number;
  transportType?: string;   // PLANE / TRAIN / CAR / OTHER
  estimatedCost?: number;
  /** 住宿安排(SELF自行安排/COMPANY公司安排/NONE无需住宿) */
  accommodation?: string;
  /** 出差期间联系电话 */
  contactPhone?: string;
  /** 紧急联系人 */
  emergencyContact?: string;
  /** 紧急联系人电话 */
  emergencyPhone?: string;
  /** 关联项目名称 */
  projectName?: string;
  projectId?: number;
  customerId?: number;
  customerName?: string;
  budgetSubjectCode?: string;
  budgetSubjectName?: string;
  companions?: string;
  reason: string;
  itinerary?: string;
  /** 附件URL（多个用逗号分隔） */
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
  export: (params: { pageNum?: number; pageSize?: number; status?: string; destination?: string }) =>
    request.get('/oa/business-trip/export', { params, responseType: 'blob' }) as Promise<Blob>,
  getInfo: (id: number) => request.get(`/oa/business-trip/${id}`) as Promise<BusinessTrip>,
  add: (data: BusinessTrip) => request.post('/oa/business-trip', data),
  edit: (data: BusinessTrip) => request.put('/oa/business-trip', data),
  remove: (ids: number[]) => request.delete(`/oa/business-trip/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/business-trip/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/business-trip/cancel/${id}`),
};
