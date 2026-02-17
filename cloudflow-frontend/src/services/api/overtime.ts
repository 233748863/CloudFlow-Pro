import request from './request';
import { PageResult } from '@/types';

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
  /** 加班工作内容 */
  workContent?: string;
  /** 预计产出/成果 */
  expectedOutput?: string;
  /** 是否需要用餐(0否 1是) */
  needMeal?: number;
  /** 加班地点(OFFICE办公室/HOME居家/OTHER其他) */
  workLocation?: string;
  /** 附件URL（多个用逗号分隔） */
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

/** 加班申请 API */
export const overtimeApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; overtimeType?: string }) =>
    request.get('/oa/overtime/list', { params }) as Promise<PageResult<OvertimeRequest>>,
  getInfo: (id: number) => request.get(`/oa/overtime/${id}`) as Promise<OvertimeRequest>,
  add: (data: OvertimeRequest) => request.post('/oa/overtime', data),
  edit: (data: OvertimeRequest) => request.put('/oa/overtime', data),
  remove: (ids: number[]) => request.delete(`/oa/overtime/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/overtime/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/overtime/cancel/${id}`),
};
