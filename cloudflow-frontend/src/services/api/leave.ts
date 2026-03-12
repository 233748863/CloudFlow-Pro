import request from './request';

/** 请假申请接口类型 */
export interface LeaveRequest {
  id?: number;
  tenantId?: number;
  instanceId?: string;
  userId?: number;
  userName?: string;
  leaveNo?: string;
  leaveType: string;
  startTime: string;
  endTime: string;
  leaveDays?: number;
  reason: string;
  attachmentUrl?: string;
  status?: string;
  deptId?: number;
  deptName?: string;
  createTime?: string;
  updateTime?: string;
}

/** 请假申请相关API */
export const leaveApi = {
  /** 分页查询请假申请列表 */
  list: (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    leaveType?: string;
    userId?: number;
  }) => request.get('/oa/leave/list', { params }),

  /** 导出请假申请 */
  export: (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    leaveType?: string;
    userId?: number;
  }) => request.get('/oa/leave/export', { params, responseType: 'blob' }) as Promise<Blob>,

  /** 查询请假申请详情 */
  getInfo: (id: number) => request.get(`/oa/leave/${id}`),

  /** 新增请假申请 */
  add: (data: LeaveRequest) => request.post('/oa/leave', data),

  /** 修改请假申请 */
  edit: (data: LeaveRequest) => request.put('/oa/leave', data),

  /** 删除请假申请 */
  remove: (ids: number[]) => request.delete(`/oa/leave/${ids.join(',')}`),

  /** 提交请假申请（启动审批） */
  submit: (id: number) => request.post(`/oa/leave/submit/${id}`),

  /** 取消请假申请 */
  cancel: (id: number) => request.put(`/oa/leave/cancel/${id}`),
};
