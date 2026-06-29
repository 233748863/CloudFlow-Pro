import { PageResult } from '@/types';
import {
  assertCurrentEmployeeCanStartSelfService,
  cancelHrLeaveApplication,
  createHrLeaveApplication,
  getHrLeaveApplication,
  HrLeaveApplicationVO,
  HrLeaveTypeOption,
  listHrLeaveApplications,
  listHrLeaveTypes,
  resolveCurrentEmployeeId,
  submitHrLeaveApplication,
} from './hr';

export interface LeaveApplication {
  id?: number;
  applicationNo?: string;
  employeeId?: number;
  employeeName?: string;
  leaveTypeId: number;
  leaveTypeName?: string;
  startTime: string;
  endTime: string;
  duration: number;
  unit: string;
  periodType?: string;
  reason: string;
  status?: string;
  processInstanceId?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface LeaveApplicationForm {
  leaveTypeId: number;
  startTime: string;
  endTime: string;
  duration: number;
  unit: string;
  periodType?: string;
  reason: string;
}

const normalizeOptionalFilter = (value?: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const mapRecord = (item: HrLeaveApplicationVO): LeaveApplication => ({
  id: item.id,
  applicationNo: item.applicationNo,
  employeeId: item.employeeId,
  employeeName: item.employeeName,
  leaveTypeId: item.leaveTypeId,
  leaveTypeName: item.leaveTypeName,
  startTime: item.startTime,
  endTime: item.endTime,
  duration: Number(item.duration || 0),
  unit: item.unit,
  periodType: item.periodType,
  reason: item.reason || '',
  status: item.status,
  processInstanceId: item.processInstanceId,
  createTime: item.createTime,
  updateTime: item.updateTime,
});

export const leaveApplicationApi = {
  listLeaveTypes: () => listHrLeaveTypes(),

  list: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    leaveTypeId?: number;
    userId?: number;
  }) => {
    const employeeId = await resolveCurrentEmployeeId(params.userId);
    const pageData = await listHrLeaveApplications({
      employeeId,
      leaveTypeId: params.leaveTypeId,
      status: normalizeOptionalFilter(params.status),
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    }) as unknown;
    const pageObject = pageData && typeof pageData === 'object' && !Array.isArray(pageData)
      ? pageData as { records?: HrLeaveApplicationVO[]; rows?: HrLeaveApplicationVO[]; total?: number }
      : null;
    const sourceRows = Array.isArray(pageData)
      ? pageData
      : pageObject?.records || pageObject?.rows || [];
    const records = sourceRows.map(mapRecord);
    return {
      total: pageObject?.total || records.length,
      rows: records,
      records,
    } as PageResult<LeaveApplication>;
  },

  getInfo: async (id: number) => mapRecord(await getHrLeaveApplication(id)),

  add: async (data: LeaveApplicationForm) => {
    const employee = await assertCurrentEmployeeCanStartSelfService('新建请假申请');
    const id = await createHrLeaveApplication({
      employeeId: employee.id,
      leaveTypeId: data.leaveTypeId,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: Number(data.duration),
      unit: data.unit,
      reason: data.reason.trim(),
    });
    return { id };
  },

  remove: async (ids: number[]) => {
    await Promise.all(ids.map((id) => cancelHrLeaveApplication(id)));
    return true;
  },

  submit: async (id: number) => {
    await assertCurrentEmployeeCanStartSelfService('提交请假申请');
    await submitHrLeaveApplication(id);
    return true;
  },

  cancel: async (id: number) => cancelHrLeaveApplication(id),

  export: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    leaveTypeId?: number;
    userId?: number;
  }) => {
    const page = await leaveApplicationApi.list(params);
    const rows = (page.records || page.rows || []).map((item) => ({
      applicationNo: item.applicationNo || '',
      employeeName: item.employeeName || '',
      leaveTypeName: item.leaveTypeName || '',
      startTime: item.startTime,
      endTime: item.endTime,
      duration: item.duration,
      status: item.status || '',
      reason: item.reason || '',
    }));
    return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
  },
};

export type { HrLeaveTypeOption };
