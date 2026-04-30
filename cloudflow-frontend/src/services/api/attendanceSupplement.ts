import request from './request';
import { PageResult } from '@/types';
import {
  assertCurrentEmployeeCanStartSelfService,
  resolveCurrentEmployeeId,
} from './hr';

export interface AttendanceSupplement {
  id?: number;
  supplementNo?: string;
  employeeId?: number;
  employeeName?: string;
  attendanceDate: string;
  checkType: string;
  checkTime: string;
  reason: string;
  status?: string;
  processInstanceId?: string;
  createTime?: string;
  updateTime?: string;
}

interface AttendanceSupplementRecord {
  id?: number;
  employeeId?: number;
  employeeName?: string;
  employeeNo?: string;
  deptName?: string;
  attendanceDate: string;
  checkType: string;
  checkTime: string;
  checkMethod?: string;
  location?: string;
  status?: string;
  processInstanceId?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface AttendanceSupplementForm {
  id?: number;
  attendanceDate: string;
  checkType: string;
  checkTime: string;
  reason: string;
}

const normalizeCheckTime = (attendanceDate: string, checkTime: string) => {
  const normalizedTime = checkTime.length === 5 ? `${checkTime}:00` : checkTime;
  return normalizedTime.includes(' ')
    ? normalizedTime
    : `${attendanceDate} ${normalizedTime}`;
};

const normalizePayload = async (data: AttendanceSupplementForm) => {
  const employee = await assertCurrentEmployeeCanStartSelfService('考勤补录');
  return {
    ...data,
    employeeId: employee.id,
    checkTime: normalizeCheckTime(data.attendanceDate, data.checkTime),
    reason: data.reason.trim(),
  };
};

const mapRecord = (item: AttendanceSupplementRecord): AttendanceSupplement => ({
  id: item.id,
  supplementNo: item.id ? `ATTENDANCE-${item.id}` : undefined,
  employeeId: item.employeeId,
  employeeName: item.employeeName,
  attendanceDate: item.attendanceDate,
  checkType: item.checkType,
  checkTime: item.checkTime,
  reason: item.remark || '',
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

const normalizeOptionalFilter = (value?: string) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export const attendanceSupplementApi = {
  list: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    checkType?: string;
    userId?: number;
  }) => {
    const employeeId = await resolveCurrentEmployeeId(params.userId);
    const records = (await request.get<AttendanceSupplementRecord[]>('/hr/attendance/supplement/list', {
      params: {
        employeeId,
        status: normalizeOptionalFilter(params.status),
        checkType: normalizeOptionalFilter(params.checkType),
      },
    })).map(mapRecord);

    return paginate(records, params.pageNum, params.pageSize);
  },

  export: async (params: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    checkType?: string;
  }) => {
    const page = await attendanceSupplementApi.list({ ...params, pageNum: 1, pageSize: Number.MAX_SAFE_INTEGER });
    const rows = (page.records || page.rows || []).map((item) => ({
      supplementNo: item.supplementNo || '',
      employeeName: item.employeeName || '',
      attendanceDate: item.attendanceDate,
      checkType: item.checkType,
      checkTime: item.checkTime,
      status: item.status || '',
      reason: item.reason || '',
    }));
    return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
  },

  getInfo: async (id: number) =>
    mapRecord(await request.get<AttendanceSupplementRecord>(`/hr/attendance/supplement/${id}`)),

  add: async (data: AttendanceSupplementForm) =>
    request.post<number>('/hr/attendance/supplement', await normalizePayload(data)),

  edit: async (data: AttendanceSupplementForm) => {
    if (!data.id) {
      throw new Error('缺少考勤补录申请 ID');
    }
    await request.put<void>(`/hr/attendance/supplement/${data.id}`, await normalizePayload(data));
    return true;
  },

  remove: async (ids: number[]) => {
    await Promise.all(ids.map((id) => request.delete<void>(`/hr/attendance/supplement/${id}`)));
    return true;
  },

  submit: async (id: number) => {
    await assertCurrentEmployeeCanStartSelfService('提交考勤补录');
    await request.post<void>(`/hr/attendance/supplement/${id}/submit`);
    return true;
  },
};
