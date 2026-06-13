import { PageResult } from '@/types';
import {
  assertCurrentEmployeeCanStartSelfService,
  cancelHrOvertimeApplication,
  createHrOvertimeApplication,
  deleteHrOvertimeApplication,
  getHrOvertimeApplication,
  HrOvertimeApplicationVO,
  listHrOvertimeApplications,
  resolveCurrentEmployeeId,
  submitHrOvertimeApplication,
  updateHrOvertimeApplication,
} from './hr';

export interface OvertimeApplication {
  id?: number;
  applicationNo?: string;
  employeeId?: number;
  employeeName?: string;
  startTime: string;
  endTime: string;
  duration?: number;
  overtimeType: string;
  compensationType: string;
  quotaAmount?: number | null;
  matchedSlots?: string | null;
  reason: string;
  status?: string;
  processInstanceId?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface OvertimeApplicationForm {
  id?: number;
  startTime: string;
  endTime: string;
  overtimeType: string;
  compensationType: string;
  reason: string;
}

const normalizeOptionalFilter = (value?: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const mapRecord = (item: HrOvertimeApplicationVO): OvertimeApplication => ({
  id: item.id,
  applicationNo: item.applicationNo,
  employeeId: item.employeeId,
  employeeName: item.employeeName,
  startTime: item.startTime,
  endTime: item.endTime,
  duration: Number(item.duration || 0),
  overtimeType: item.overtimeType,
  compensationType: item.compensationType,
  quotaAmount: item.quotaAmount == null ? null : Number(item.quotaAmount),
  matchedSlots: item.matchedSlots || null,
  reason: item.reason || '',
  status: item.status,
  processInstanceId: item.processInstanceId,
  createTime: item.createTime,
  updateTime: item.updateTime,
});

const paginate = <T>(items: T[], pageNum = 1, pageSize = 10): PageResult<T> => {
  const start = Math.max(pageNum - 1, 0) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    total: items.length,
    rows,
    records: rows,
  };
};

export const overtimeApplicationApi = {
  list: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    overtimeType?: string;
  }) => {
    const employeeId = await resolveCurrentEmployeeId();
    const records = (await listHrOvertimeApplications({
      employeeId,
      status: normalizeOptionalFilter(params.status),
      overtimeType: normalizeOptionalFilter(params.overtimeType),
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    })).map(mapRecord);

    return paginate(records, params.pageNum, params.pageSize);
  },

  getInfo: async (id: number) => mapRecord(await getHrOvertimeApplication(id)),

  add: async (data: OvertimeApplicationForm) => {
    const employee = await assertCurrentEmployeeCanStartSelfService('新建加班申请');
    const id = await createHrOvertimeApplication({
      employeeId: employee.id,
      startTime: data.startTime,
      endTime: data.endTime,
      overtimeType: data.overtimeType,
      compensationType: data.compensationType,
      reason: data.reason.trim(),
    });
    return { id };
  },

  edit: async (data: OvertimeApplicationForm) => {
    if (!data.id) {
      throw new Error('缺少加班申请 ID');
    }
    const employee = await assertCurrentEmployeeCanStartSelfService('编辑加班申请');
    await updateHrOvertimeApplication(data.id, {
      employeeId: employee.id,
      startTime: data.startTime,
      endTime: data.endTime,
      overtimeType: data.overtimeType,
      compensationType: data.compensationType,
      reason: data.reason.trim(),
    });
    return true;
  },

  remove: async (ids: number[]) => {
    await Promise.all(ids.map((id) => deleteHrOvertimeApplication(id)));
    return true;
  },

  submit: async (id: number) => {
    await assertCurrentEmployeeCanStartSelfService('提交加班申请');
    await submitHrOvertimeApplication(id);
    return true;
  },

  cancel: async (id: number) => {
    await assertCurrentEmployeeCanStartSelfService('撤销加班申请');
    await cancelHrOvertimeApplication(id);
    return true;
  },

  export: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    overtimeType?: string;
  }) => {
    const page = await overtimeApplicationApi.list(params);
    const rows = (page.records || page.rows || []).map((item) => ({
      applicationNo: item.applicationNo || '',
      employeeName: item.employeeName || '',
      overtimeType: item.overtimeType,
      startTime: item.startTime,
      endTime: item.endTime,
      duration: item.duration || 0,
      status: item.status || '',
      reason: item.reason || '',
    }));
    return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
  },
};
