import request from './request';
import { PageResult } from '@/types';

/** 访客预约接口类型 */
export interface Visitor {
  visitorId?: number;
  tenantId?: number;
  visitorName: string;
  visitorPhone?: string;
  visitorCompany?: string;
  visitorCount?: number;
  idCard?: string;
  visitReason: string;
  hostId: number;
  hostName?: string;
  hostDept?: string;
  visitDate: string;
  visitTimeStart?: string;
  visitTimeEnd?: string;
  actualArrive?: string;
  actualLeave?: string;
  visitArea?: string;
  carPlate?: string;
  belongings?: string;
  photoUrl?: string;
  passCode?: string;
  status?: string;
  remark?: string;
  createTime?: string;
}

/** 访客管理 API */
export const visitorApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; visitorName?: string; visitDate?: string }) =>
    request.get('/oa/visitor/list', { params }) as Promise<PageResult<Visitor>>,
  getInfo: (id: number) => request.get(`/oa/visitor/${id}`) as Promise<Visitor>,
  add: (data: Visitor) => request.post('/oa/visitor', data),
  edit: (data: Visitor) => request.put('/oa/visitor', data),
  remove: (ids: number[]) => request.delete(`/oa/visitor/${ids.join(',')}`),
  confirm: (id: number) => request.put(`/oa/visitor/confirm/${id}`),
  checkIn: (id: number) => request.put(`/oa/visitor/checkin/${id}`),
  checkOut: (id: number) => request.put(`/oa/visitor/checkout/${id}`),
  cancel: (id: number) => request.put(`/oa/visitor/cancel/${id}`),
  qrCode: (id: number) => request.get<Blob>(`/oa/visitor/${id}/qrcode`, {
    responseType: 'blob',
    silent: true,
  }),
};
