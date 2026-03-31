import {
  cancelHrLeaveApplication,
  createHrLeaveApplication,
  getHrLeaveApplication,
  listHrLeaveApplications,
  listHrLeaveTypes,
  resolveCurrentEmployeeId,
  submitHrLeaveApplication,
} from './hr';

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

const buildCsvBlob = (rows: LeaveRequest[]) => {
  const header = ['单号', '请假类型', '开始时间', '结束时间', '天数', '状态', '原因'];
  const lines = rows.map((item) =>
    [
      item.leaveNo || '',
      item.leaveType || '',
      item.startTime || '',
      item.endTime || '',
      item.leaveDays ?? '',
      item.status || '',
      (item.reason || '').replace(/[\r\n]+/g, ' '),
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
  );
  return new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
};

const getLegacyStatus = (status?: string) => {
  if (status === 'APPROVING') {
    return 'PENDING';
  }
  return status || 'DRAFT';
};

const mapHrLeaveToLegacy = (item: {
  id: number;
  applicationNo: string;
  employeeName?: string;
  leaveTypeName?: string;
  startTime: string;
  endTime: string;
  duration: number;
  reason?: string | null;
  status: string;
  createTime?: string;
  updateTime?: string;
}): LeaveRequest => ({
  id: item.id,
  userName: item.employeeName,
  leaveNo: item.applicationNo,
  leaveType: item.leaveTypeName || '',
  startTime: item.startTime,
  endTime: item.endTime,
  leaveDays: Number(item.duration || 0),
  reason: item.reason || '',
  status: getLegacyStatus(item.status),
  createTime: item.createTime,
  updateTime: item.updateTime,
});

const resolveLeaveTypeId = async (leaveType: string) => {
  const types = await listHrLeaveTypes();
  const normalized = leaveType.trim().toUpperCase();
  const matched =
    types.find((item) => item.leaveCode === normalized) ??
    types.find((item) => item.leaveName === leaveType);

  if (!matched) {
    throw new Error(`未匹配到 HR 请假类型：${leaveType}`);
  }
  return matched;
};

/** 请假申请相关API */
export const leaveApi = {
  /** 分页查询请假申请列表 */
  list: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    leaveType?: string;
    userId?: number;
  }) => {
    const employeeId = await resolveCurrentEmployeeId(params.userId);
    const leaveType = params.leaveType ? await resolveLeaveTypeId(params.leaveType) : null;
    const page = await listHrLeaveApplications({
      employeeId,
      leaveTypeId: leaveType?.id,
      status: params.status === 'PENDING' ? 'APPROVING' : params.status,
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    });

    const records = (page.records || []).map(mapHrLeaveToLegacy);
    return {
      total: page.total || records.length,
      rows: records,
      records,
    };
  },

  /** 导出请假申请 */
  export: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    leaveType?: string;
    userId?: number;
  }) => {
    const page = await leaveApi.list({
      ...params,
      pageNum: params.pageNum ?? 1,
      pageSize: params.pageSize ?? 500,
    });
    return buildCsvBlob(page.records || page.rows || []);
  },

  /** 查询请假申请详情 */
  getInfo: async (id: number) => {
    const detail = await getHrLeaveApplication(id);
    return mapHrLeaveToLegacy(detail);
  },

  /** 新增请假申请 */
  add: async (data: LeaveRequest) => {
    const employeeId = await resolveCurrentEmployeeId(data.userId);
    const leaveType = await resolveLeaveTypeId(data.leaveType);
    const duration = Number(data.leaveDays ?? 0);
    const id = await createHrLeaveApplication({
      employeeId,
      leaveTypeId: leaveType.id,
      startTime: data.startTime,
      endTime: data.endTime,
      duration,
      unit: leaveType.unit || 'DAY',
      reason: data.attachmentUrl
        ? `${data.reason}\n【附件】${data.attachmentUrl}`
        : data.reason,
    });
    return { id };
  },

  /** 修改请假申请 */
  edit: async () => {
    throw new Error('HR 请假申请暂不支持在线编辑，请撤销后重新提交');
  },

  /** 删除请假申请 */
  remove: async (ids: number[]) => {
    await Promise.all(ids.map((id) => cancelHrLeaveApplication(id)));
    return true;
  },

  /** 提交请假申请 */
  submit: (id: number) => submitHrLeaveApplication(id),

  /** 取消请假申请 */
  cancel: (id: number) => cancelHrLeaveApplication(id),
};
