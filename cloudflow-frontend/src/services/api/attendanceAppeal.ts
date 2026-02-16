import request from './request';

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
  location?: string;
  address?: string;
  reason: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
}

/** 补卡/外勤申请 API */
export const attendanceAppealApi = {
  list: (params: { pageNum?: number; pageSize?: number; status?: string; appealType?: string }) =>
    request.get('/oa/attendance/appeal/list', { params }),
  getInfo: (id: number) => request.get(`/oa/attendance/appeal/${id}`),
  add: (data: AttendanceAppeal) => request.post('/oa/attendance/appeal', data),
  edit: (data: AttendanceAppeal) => request.put('/oa/attendance/appeal', data),
  remove: (ids: number[]) => request.delete(`/oa/attendance/appeal/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/attendance/appeal/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/attendance/appeal/cancel/${id}`),
};
