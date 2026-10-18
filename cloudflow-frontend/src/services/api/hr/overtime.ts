import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, overtimeDraft, overtimeQuery, requireDecimal, requireId, requireText, requireVersion, resolutionPayload } from './hr09Model';
import type { Hr09Page, OvertimeDetailVO, OvertimeDraftDTO, OvertimeHoursReviewDTO, OvertimeListVO, OvertimeOptionsVO, OvertimePayReviewDTO, OvertimePreviewVO, OvertimeQuery, OvertimeResolutionDTO, OvertimeSettlementVO, OvertimeTypeDTO, OvertimeTypeVO, ReasonVersionDTO, VersionDTO } from './hr09Types';

const root = '/hr/attendance/overtime-requests';
const typesRoot = '/hr/attendance/overtime-types';
const reasonPayload = (data: ReasonVersionDTO) => ({ ...requireVersion(data.version), reason: requireText(data.reason, '原因', 500) });

export function requireCreationKey(key: string) {
  if (!/^[\x21-\x7e]{1,64}$/.test(key)) throw new Hr09Error('创建标识无效，请关闭后重新登记。', 400);
  return { 'Idempotency-Key': key };
}

export const hrOvertimeApi = {
  list: async (query: OvertimeQuery, mine: boolean, signal?: AbortSignal) => hr09Page(await hr09Request<Hr09Page<OvertimeListVO>>({ method: 'GET', url: `${root}${mine ? '/mine' : ''}`, params: overtimeQuery(query, mine), signal })),
  detail: (id: string, signal?: AbortSignal) => hr09Request<OvertimeDetailVO>({ method: 'GET', url: `${root}/${requireId(id)}`, signal }),
  options: (signal?: AbortSignal) => hr09Request<OvertimeOptionsVO>({ method: 'GET', url: `${root}/options`, signal }),
  preview: (data: OvertimeDraftDTO, signal?: AbortSignal) => hr09Request<OvertimePreviewVO>({ method: 'POST', url: `${root}/preview`, data: overtimeDraft(data), signal }),
  create: (data: OvertimeDraftDTO, key: string) => hr09Request<OvertimeDetailVO>({ method: 'POST', url: root, data: overtimeDraft(data), headers: requireCreationKey(key) }),
  update: (id: string, data: OvertimeDraftDTO & VersionDTO) => hr09Request<OvertimeDetailVO>({ method: 'PUT', url: `${root}/${requireId(id)}`, data: { ...overtimeDraft(data), ...requireVersion(data.version) } }),
  remove: (id: string, version: number) => hr09Request<void>({ method: 'DELETE', url: `${root}/${requireId(id)}`, params: requireVersion(version) }),
  submit: (id: string, version: number) => hr09Request<OvertimeDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/submit`, data: requireVersion(version) }),
  cancel: (id: string, data: ReasonVersionDTO) => hr09Request<OvertimeDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/cancel`, data: reasonPayload(data) }),
  reviewHours: (id: string, data: OvertimeHoursReviewDTO) => {
    if (!Number.isInteger(data.approvedMinutes) || data.approvedMinutes <= 0) throw new Hr09Error('核定分钟须为正整数。', 400);
    return hr09Request<OvertimeDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/review-hours`, data: { ...requireVersion(data.version), approvedMinutes: data.approvedMinutes, note: requireText(data.note, '核定依据', 500) } });
  },
  reviewPay: (id: string, data: OvertimePayReviewDTO) => hr09Request<OvertimeDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/review-pay`, data: { ...requireVersion(data.version), hourlyRate: requireDecimal(data.hourlyRate, '基础时薪', 18), payrollPeriodId: requireId(data.payrollPeriodId), note: requireText(data.note, '核价依据', 500) } }),
  reviewReject: (id: string, data: ReasonVersionDTO) => hr09Request<OvertimeDetailVO>({ method: 'POST', url: `${root}/${requireId(id)}/review-reject`, data: reasonPayload(data) }),
  settlement: (id: string, signal?: AbortSignal) => hr09Request<OvertimeSettlementVO>({ method: 'GET', url: `${root}/${requireId(id)}/settlement`, signal }),
  retry: (id: string, data: ReasonVersionDTO) => hr09Request<OvertimeSettlementVO>({ method: 'POST', url: `${root}/${requireId(id)}/settlement/retry`, data: reasonPayload(data) }),
  resolve: (id: string, data: OvertimeResolutionDTO) => hr09Request<OvertimeSettlementVO>({ method: 'POST', url: `${root}/${requireId(id)}/settlement/resolve`, data: resolutionPayload(data) }),
  export: (query: OvertimeQuery, mine: boolean) => hr09Request<Blob>({ method: 'GET', url: `${root}${mine ? '/mine' : ''}/export`, params: overtimeQuery(query, mine), responseType: 'blob' }),
};

function typePayload(data: OvertimeTypeDTO): OvertimeTypeDTO {
  if (!['WORKDAY', 'REST_DAY', 'HOLIDAY'].includes(data.applicableDayType) || ![0, 1].includes(data.compensatoryFlag)) throw new Hr09Error('类型规则无效，请重新选择。', 400);
  if (data.remark && data.remark.trim().length > 500) throw new Hr09Error('备注不能超过 500 个字符。', 400);
  return {
    typeCode: requireText(data.typeCode, '类型编码', 50), typeName: requireText(data.typeName, '类型名称', 100), applicableDayType: data.applicableDayType,
    rateMultiplier: data.rateMultiplier ? requireDecimal(data.rateMultiplier, '加班费倍率', 4) : null,
    salaryComponentId: data.salaryComponentId ? requireId(data.salaryComponentId) : null,
    compensatoryFlag: data.compensatoryFlag,
    compensatoryRatio: data.compensatoryFlag && data.compensatoryRatio ? requireDecimal(data.compensatoryRatio, '调休比例', 4) : null,
    compensatoryLeaveTypeId: data.compensatoryFlag && data.compensatoryLeaveTypeId ? requireId(data.compensatoryLeaveTypeId) : null,
    maxHoursPerDay: data.maxHoursPerDay ? requireDecimal(data.maxHoursPerDay, '每日上限', 8) : null,
    maxHoursPerMonth: data.maxHoursPerMonth ? requireDecimal(data.maxHoursPerMonth, '每月上限', 8) : null,
    needApprovalFlag: 1, remark: data.remark?.trim() || '',
  };
}

export const hrOvertimeTypeApi = {
  list: (signal?: AbortSignal) => hr09Request<OvertimeTypeVO[]>({ method: 'GET', url: typesRoot, signal }),
  detail: (id: string, signal?: AbortSignal) => hr09Request<OvertimeTypeVO>({ method: 'GET', url: `${typesRoot}/${requireId(id)}`, signal }),
  create: (data: OvertimeTypeDTO) => hr09Request<OvertimeTypeVO>({ method: 'POST', url: typesRoot, data: typePayload(data) }),
  update: (id: string, data: OvertimeTypeDTO & VersionDTO) => hr09Request<OvertimeTypeVO>({ method: 'PUT', url: `${typesRoot}/${requireId(id)}`, data: { ...typePayload(data), ...requireVersion(data.version) } }),
  status: (id: string, data: ReasonVersionDTO & { status: 0 | 1 }) => hr09Request<OvertimeTypeVO>({ method: 'POST', url: `${typesRoot}/${requireId(id)}/status`, data: { ...reasonPayload(data), status: data.status } }),
};
