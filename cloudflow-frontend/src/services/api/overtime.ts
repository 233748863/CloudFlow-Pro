import request from './request';

/** 加班申请接口类型 */
export interface OvertimeRequest {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  overtimeNo?: string;
  overtimeType: string;     // WORKDAY工作日 / WEEKEND周末 / HOLIDAY节假日
  startTime: string;
  endTime: string;
  overtimeHours?: number;
  compensateType?: string;  // SALARY加班费 / LEAVE调休
  reason: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

/** 加班申请 API */
export const overtimeApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; overtimeType?: string }) =>
    request.get('/oa/overtime/list', { params }),
  getInfo: (id: number) => request.get(`/oa/overtime/${id}`),
  add: (data: OvertimeRequest) => request.post('/oa/overtime', data),
  edit: (data: OvertimeRequest) => request.put('/oa/overtime', data),
  remove: (ids: number[]) => request.delete(`/oa/overtime/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/overtime/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/overtime/cancel/${id}`),
};
