import request from './request';
import { PageResult } from '@/types';

/** 补卡/外勤申请接口类型 */
export interface AttendanceAppeal {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  appealNo?: string;
  appealType: string;       // MAKEUP补卡 / FIELD外勤
  appealDate: string;
  appealTime?: string;
  checkType?: string;       // 1签到 2签退
  /** 关联原始考勤记录ID */
  originalRecordId?: number;
  /** 原始打卡状态(LATE迟到/EARLY早退/ABSENT缺卡/ABNORMAL异常) */
  originalStatus?: string;
  /** 证明人姓名 */
  witnessName?: string;
  location?: string;
  address?: string;
  reason: string;
  /** 附件URL（多个用逗号分隔） */
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

/** 补卡/外勤申请 API */
export const attendanceAppealApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; appealType?: string }) =>
    request.get('/oa/attendance/appeal/list', { params }) as Promise<PageResult<AttendanceAppeal>>,
  getInfo: (id: number) => request.get(`/oa/attendance/appeal/${id}`) as Promise<AttendanceAppeal>,
  add: (data: AttendanceAppeal) => request.post('/oa/attendance/appeal', data),
  edit: (data: AttendanceAppeal) => request.put('/oa/attendance/appeal', data),
  remove: (ids: number[]) => request.delete(`/oa/attendance/appeal/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/attendance/appeal/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/attendance/appeal/cancel/${id}`),
};
