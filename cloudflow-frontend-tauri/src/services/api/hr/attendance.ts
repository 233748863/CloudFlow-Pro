import request from '@/services/api/request';
import { withList } from './internals';
import type {
  AttendanceRuleAssignment,
  EffectiveAttendanceRule,
  HrAttendanceMonthly,
  HrAttendanceRecord,
  HrLeaveApplicationVO,
  HrLeaveQuotaAdjustPayload,
  HrLeaveQuotaInitItem,
  HrLeaveQuotaInitResult,
  HrLeaveQuotaVO,
  HrLeaveTypeOption,
  HrOvertimeApplicationVO,
  HrPagedResult,
  HrRecord,
  HrScheduleRule,
  HrShift,
  WorkCalendarDay,
} from './types';

const normalizeScheduleRule = (item: HrScheduleRule): HrScheduleRule => ({
  ...item,
  ruleConfig: item.ruleConfig || item.configJson || '{}',
});

export const listHrLeaveTypes = () =>
  request.get<HrLeaveTypeOption[]>('/hr/attendance/leave-types');
export const createHrLeaveType = (data: HrRecord) =>
  request.post<number>('/hr/attendance/leave-types', { ...data, leaveCode: data.leaveCode || `LV${Date.now()}` });

export const getHrLeaveQuota = async (params: { employeeId: number; leaveTypeId: number; year: number }) =>
  (await listHrLeaveQuotas({ employeeId: params.employeeId, year: params.year }))
    .find((item) => item.leaveTypeId === params.leaveTypeId) as HrLeaveQuotaVO;

export const listHrLeaveQuotaBuckets = (params: { employeeId: number; leaveTypeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO[]>('/hr/attendance/leave-quotas', { params });

export const listHrLeaveQuotas = (params: { employeeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO[]>('/hr/attendance/leave-quotas', { params });

export const initHrLeaveQuota = async (params: { employeeId: number; year: number; leaveTypeId?: number }) => {
  const types = await listHrLeaveTypes();
  const items = (params.leaveTypeId ? types.filter((item) => item.id === params.leaveTypeId) : types)
    .filter((item) => item.needQuota !== false);
  const created: HrLeaveQuotaInitItem[] = [];
  for (const item of items) {
    const totalQuota = item.leaveCode === 'COMP_TIME' ? 0 : 5;
    await request.post<number>('/hr/attendance/leave-quotas', {
      employeeId: params.employeeId,
      leaveTypeId: item.id,
      year: params.year,
      totalQuota,
      usedQuota: 0,
      frozenQuota: 0,
      availableQuota: totalQuota,
    });
    created.push({ leaveTypeId: item.id, leaveTypeName: item.leaveName, action: 'CREATED', totalQuota });
  }
  return {
    employeeId: params.employeeId,
    year: params.year,
    mode: params.leaveTypeId ? 'SINGLE' : 'BATCH',
    requestedCount: items.length,
    createdCount: created.length,
    refreshedCount: 0,
    skippedCount: 0,
    items: created,
  } as HrLeaveQuotaInitResult;
};

export const adjustHrLeaveQuota = async (data: HrLeaveQuotaAdjustPayload) => {
  const current = await getHrLeaveQuota(data);
  await request.put<void>(`/hr/attendance/leave-quotas/${current.id}`, {
    totalQuota: Number(current.totalQuota || 0) + Number(data.adjustmentAmount || 0),
    availableQuota: Number(current.availableQuota || 0) + Number(data.adjustmentAmount || 0),
    expiryDate: data.expiryDate,
  });
};

export const createHrLeaveApplication = (data: HrRecord) =>
  request.post<number>('/hr/attendance/time-requests', { ...data, requestType: 'LEAVE', requestNo: `HRTM${Date.now()}` });
export const submitHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/submit`);
export const approveHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/approve`);
export const rejectHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/reject`);
export const cancelHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/cancel`);
export const getHrLeaveApplication = async (id: number) =>
  (await request.get<HrLeaveApplicationVO[]>('/hr/attendance/time-requests', { params: { requestType: 'LEAVE' } })).find((item) => item.id === id) as HrLeaveApplicationVO;
export const listHrLeaveApplications = (params?: HrRecord) =>
  request.get<HrPagedResult<HrLeaveApplicationVO>>('/hr/attendance/time-requests', { params: { ...params, requestType: 'LEAVE' } });
export const listHrApprovedLeaveBoard = (params?: HrRecord) =>
  listHrLeaveApplications({ ...params, status: 'APPROVED' }).then((page) => withList(page));

export const createHrOvertimeApplication = (data: HrRecord) =>
  request.post<number>('/hr/attendance/time-requests', { ...data, requestType: 'OVERTIME', requestNo: `HRTM${Date.now()}` });
export const updateHrOvertimeApplication = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/attendance/time-requests/${id}`, data);
export const deleteHrOvertimeApplication = (id: number) =>
  request.delete<void>(`/hr/attendance/time-requests/${id}`);
export const submitHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/submit`);
export const approveHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/approve`);
export const rejectHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/reject`);
export const cancelHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/cancel`);
export const getHrOvertimeApplication = async (id: number) =>
  (await listHrOvertimeApplications()).find((item) => item.id === id) as HrOvertimeApplicationVO;
export const listHrOvertimeApplications = (params?: HrRecord) =>
  request.get<HrOvertimeApplicationVO[]>('/hr/attendance/time-requests', { params: { ...params, requestType: 'OVERTIME' } });

export const hrCheckIn = (data: HrRecord) => request.post<void>('/hr/attendance/records', { ...data, checkType: 'CHECK_IN', attendanceDate: new Date().toISOString().slice(0, 10), checkTime: new Date().toISOString(), requestNo: `HRAT${Date.now()}` });
export const hrCheckOut = (data: HrRecord) => request.post<void>('/hr/attendance/records', { ...data, checkType: 'CHECK_OUT', attendanceDate: new Date().toISOString().slice(0, 10), checkTime: new Date().toISOString(), requestNo: `HRAT${Date.now()}` });
export const listHrAttendanceRecords = (params?: HrRecord) => request.get<HrAttendanceRecord[]>('/hr/attendance/records', { params });
export const createHrAttendanceRecord = (data: HrRecord) =>
  request.post<number>('/hr/attendance/records', { ...data, attendanceDate: data.attendanceDate || String(data.checkTime || new Date().toISOString()).slice(0, 10) });
export const getHrAttendanceMonthly = async (employeeId: number, year: number, month: number) =>
  (await request.get<HrAttendanceMonthly[]>('/hr/attendance/monthly', { params: { employeeId, year, month } }))[0] as HrAttendanceMonthly;
export const listHrAttendanceMonthly = (params?: HrRecord) =>
  request.get<HrAttendanceMonthly[]>('/hr/attendance/monthly', { params });

export const listHrShifts = () => request.get<HrShift[]>('/hr/attendance/shifts');
export const createHrShift = (data: Omit<HrShift, 'id'> & HrRecord) => request.post<number>('/hr/attendance/shifts', data);
export const updateHrShift = (id: number, data: Partial<HrShift>) => request.put<void>(`/hr/attendance/shifts/${id}`, data);

export const listHrScheduleRules = async () => (await request.get<HrScheduleRule[]>('/hr/attendance/rules')).map(normalizeScheduleRule);
export const getHrScheduleRule = async (id: number) => (await listHrScheduleRules()).find((item) => item.id === id) as HrScheduleRule;
export const createHrScheduleRule = (data: Omit<HrScheduleRule, 'id'> & HrRecord) =>
  request.post<number>('/hr/attendance/rules', { ...data, ruleCode: data.ruleCode || `RULE${Date.now()}`, configJson: data.configJson || data.ruleConfig });
export const updateHrScheduleRule = (id: number, data: Partial<HrScheduleRule>) =>
  request.put<void>(`/hr/attendance/rules/${id}`, { ...data, configJson: data.configJson || data.ruleConfig });
export const deleteHrScheduleRule = (id: number) => request.delete<void>(`/hr/attendance/rules/${id}`);
export const listHrScheduleRuleAssignments = (ruleId: number) => request.get<AttendanceRuleAssignment[]>('/hr/attendance/schedules', { params: { ruleId } });
export const listHrScheduleAssignments = (params?: HrRecord) =>
  request.get<AttendanceRuleAssignment[]>('/hr/attendance/schedules', { params });
export const createHrScheduleRuleAssignment = (ruleId: number, data: Omit<AttendanceRuleAssignment, 'id' | 'ruleId'> & HrRecord) =>
  request.post<number>('/hr/attendance/schedules', { ...data, ruleId });
export const createHrScheduleAssignment = (data: HrRecord) =>
  request.post<number>('/hr/attendance/schedules', data);
export const deleteHrScheduleRuleAssignment = (assignmentId: number) => request.delete<void>(`/hr/attendance/schedules/${assignmentId}`);

export const listHrLeaveQuotaRecords = (params?: HrRecord) =>
  request.get<HrLeaveQuotaVO[]>('/hr/attendance/leave-quotas', { params });
export const createHrLeaveQuota = (data: HrRecord) =>
  request.post<number>('/hr/attendance/leave-quotas', data);
export const updateHrLeaveQuota = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/attendance/leave-quotas/${id}`, data);
export const listHrTimeRequests = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/attendance/time-requests', { params });
export const createHrTimeRequest = (data: HrRecord) =>
  request.post<number>('/hr/attendance/time-requests', { ...data, requestNo: data.requestNo || `HRTM${Date.now()}` });
export const changeHrTimeRequestStatus = (id: number, action: string) =>
  request.post<void>(`/hr/attendance/time-requests/${id}/${action}`);

export const getEffectiveAttendanceRule = async () => {
  const rules = await listHrScheduleRules();
  const rule = rules[0];
  if (!rule) return {} as EffectiveAttendanceRule;
  const shifts = await listHrShifts();
  const shift = shifts.find((item) => item.id === rule.shiftId) || shifts[0];
  return {
    ruleId: rule.id,
    ruleName: rule.ruleName,
    ruleType: rule.ruleType,
    sourceType: 'DEFAULT',
    sourceTargetName: '',
    dayType: 'WORKDAY',
    shiftId: shift?.id,
    shiftName: shift?.shiftName,
    checkInTime: shift?.startTime,
    checkOutTime: shift?.endTime,
    checkMethods: ['GPS', 'WIFI'],
  } as EffectiveAttendanceRule;
};

export const listWorkCalendarDays = async (_params?: HrRecord) => [] as WorkCalendarDay[];
export const createWorkCalendarDay = async (_data: Omit<WorkCalendarDay, 'id'> & HrRecord) => 0;
export const updateWorkCalendarDay = async (_id: number, _data: Partial<WorkCalendarDay> & HrRecord) => undefined;
export const deleteWorkCalendarDay = async (_id: number) => undefined;
