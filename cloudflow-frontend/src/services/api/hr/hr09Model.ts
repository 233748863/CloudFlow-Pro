import type { OvertimeDraftDTO, OvertimeQuery, OvertimeResolutionDTO, ShiftDraftDTO, ShiftRequestQuery, VersionDTO } from './hr09Types';

export class Hr09Error extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message);
    this.name = 'Hr09Error';
  }
}

export function hr09Message(error: unknown) {
  return error instanceof Hr09Error ? error.message : '操作未完成，请刷新数据后重试。';
}

export function requireText(value: string, label: string, maximum: number) {
  const result = value.trim();
  if (!result || result.length > maximum) throw new Hr09Error(`${label}须填写 1—${maximum} 个字符。`, 400);
  return result;
}

export function requireId(value: string) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || (value.length === 19 && value > '9223372036854775807')) {
    throw new Hr09Error('记录标识无效，请重新选择。', 400);
  }
  return value;
}

export function requireVersion(value: number): VersionDTO {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new Hr09Error('缺少有效版本，请刷新记录。', 409);
  return { version: value };
}

export function requireDecimal(value: string, label: string, precision: number) {
  const result = value.trim();
  if (!new RegExp(`^(?:0|[1-9]\\d{0,${precision - 3}})(?:\\.\\d{1,2})?$`).test(result) || !/[1-9]/.test(result)) {
    throw new Hr09Error(`${label}须为正数，最多 ${precision - 2} 位整数、2 位小数。`, 400);
  }
  return result;
}

export function requireDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Hr09Error('请选择有效日期。', 400);
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(parsed.getTime()) || shanghaiDate(parsed) !== value) throw new Hr09Error('请选择有效日期。', 400);
  return value;
}

export function shanghaiDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function requireDateTime(value: string) {
  const normalized = value.length === 16 ? `${value}:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00$/.test(normalized)) {
    throw new Hr09Error('请选择精确到分钟的北京时间，秒须为 00。', 400);
  }
  requireDate(normalized.slice(0, 10));
  return normalized;
}

export function overtimeDraft(data: OvertimeDraftDTO): OvertimeDraftDTO {
  const startTime = requireDateTime(data.startTime);
  const endTime = requireDateTime(data.endTime);
  if (endTime <= startTime) throw new Hr09Error('结束时间须晚于开始时间。', 400);
  const duration = new Date(`${endTime}+08:00`).getTime() - new Date(`${startTime}+08:00`).getTime();
  if (duration > 86400000 || startTime.slice(0, 10) !== endTime.slice(0, 10) && !endTime.endsWith('T00:00:00')) {
    throw new Hr09Error('一张申请只覆盖一个自然日，请按午夜分开登记。', 400);
  }
  if (!['PAY', 'COMPENSATORY'].includes(data.settleMode)) throw new Hr09Error('请选择已开放的补偿方式。', 400);
  return { startTime, endTime, settleMode: data.settleMode, reason: requireText(data.reason, '加班事由', 800) };
}

export function shiftDraft(data: ShiftDraftDTO): ShiftDraftDTO {
  const common = { attendanceDate: requireDate(data.attendanceDate), reason: requireText(data.reason, '调班事由', 800) };
  if (data.requestMode === 'SWAP') return { ...common, requestMode: 'SWAP', swapEmployeeId: requireId(data.swapEmployeeId || '') };
  if (data.requestMode !== 'SINGLE') throw new Hr09Error('请选择调班方式。', 400);
  return { ...common, requestMode: 'SINGLE', targetShiftId: requireId(data.targetShiftId || ''), targetRuleId: requireId(data.targetRuleId || '') };
}

export function resolutionPayload(data: OvertimeResolutionDTO): OvertimeResolutionDTO {
  const common = { ...requireVersion(data.version), reason: requireText(data.reason, '处置原因', 500) };
  if (data.action === 'REJECT') return { ...common, action: 'REJECT' };
  if (data.action === 'COMPENSATORY_ADJUSTMENT') return { ...common, action: data.action, targetPeriodId: requireId(data.targetPeriodId || '') };
  if (data.action === 'PAY_CORRECTION') return { ...common, action: data.action, targetPeriodId: requireId(data.targetPeriodId || ''), originalSlipId: requireId(data.originalSlipId || '') };
  throw new Hr09Error('请选择有效处置方式。', 400);
}

function dateRange(from?: string, to?: string) {
  if (Boolean(from) !== Boolean(to)) throw new Hr09Error('筛选起止日期须同时填写。', 400);
  if (from && to && (requireDate(from) > requireDate(to))) throw new Hr09Error('筛选结束日期不能早于开始日期。', 400);
}

function pageQuery(pageNum: number, pageSize: number) {
  if (!Number.isInteger(pageNum) || pageNum < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Hr09Error('分页参数无效，每页须为 1—100 条。', 400);
  }
  return { pageNum, pageSize };
}

export function overtimeQuery(query: OvertimeQuery, mine: boolean): OvertimeQuery {
  dateRange(query.workDateFrom, query.workDateTo);
  return { ...pageQuery(query.pageNum, query.pageSize), workDateFrom: query.workDateFrom || undefined, workDateTo: query.workDateTo || undefined,
    status: query.status || undefined, settlementStatus: query.settlementStatus || undefined, settleMode: query.settleMode || undefined,
    ...(!mine ? { employeeId: query.employeeId ? requireId(query.employeeId) : undefined, deptId: query.deptId ? requireId(query.deptId) : undefined } : {}) };
}

export function shiftQuery(query: ShiftRequestQuery, managed: boolean): ShiftRequestQuery {
  dateRange(query.dateFrom, query.dateTo);
  return { ...pageQuery(query.pageNum, query.pageSize), dateFrom: query.dateFrom || undefined, dateTo: query.dateTo || undefined,
    status: query.status || undefined, applicationStatus: query.applicationStatus || undefined,
    ...(managed ? { employeeId: query.employeeId ? requireId(query.employeeId) : undefined, deptId: query.deptId ? requireId(query.deptId) : undefined } : {}) };
}

export function hasHr09Action(record: { allowedActions?: string[] }, action: string) {
  const actions: Record<string, string> = { EDIT: 'edit', DELETE: 'delete', SUBMIT: 'submit', CANCEL: 'cancel', REVIEW_HOURS: 'reviewHours', REVIEW_PAY: 'reviewPay', REVIEW_REJECT: 'reviewReject', VIEW_SETTLEMENT: 'settlement', RETRY_SETTLEMENT: 'retry', RESOLVE_SETTLEMENT: 'resolve', RETRY_APPLICATION: 'retry', ACCEPT_INVITATION: 'accept', DECLINE_INVITATION: 'decline' };
  return Boolean(actions[action] && Array.isArray(record.allowedActions) && record.allowedActions.includes(actions[action]));
}

export function newHr09Key() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
