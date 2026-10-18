import Decimal from 'decimal.js';
import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireDate, requireId, requireText, requireVersion, shanghaiDate } from './hr09Model';
import type { Hr09Page } from './hr09Types';
import type { AdvanceApprovalDetail, AdvanceDetail, AdvanceDraft, AdvanceProof, AdvanceQuery, AdvanceRepayment, AdvanceRepaymentInput, AdvanceSummary, AdvanceWriteoffInput } from './advanceTypes';

const root = '/hr/advance';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号超出安全精度，请重新读取。');
  return requireId(String(value));
};
const nullableId = (value: unknown) => value == null ? null : id(value);
const eventKey = (value: string) => {
  if (!/^[a-f0-9]{32}$/.test(value)) throw new Hr09Error('业务请求标识无效，请重新打开表单。', 400);
  return value;
};

export function advanceAmount(value: string, positive = true, negative = false): string {
  if (typeof value !== 'string' || !(negative ? /^-?\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}(?:\.\d{1,2})?$/).test(value.trim())) {
    throw new Hr09Error('金额须为十进制数字，整数最多12位、小数最多2位。', 400);
  }
  const amount = new Decimal(value.trim());
  if (positive && !amount.isPositive() || amount.abs().greaterThan('999999999999.99')) throw new Hr09Error('金额须大于0且不超过999999999999.99元。', 400);
  return amount.toFixed(2);
}

export function advanceDraft(input: AdvanceDraft, applicationDate = shanghaiDate()): AdvanceDraft {
  const amount = advanceAmount(input.amount);
  const purpose = requireText(input.purpose, '借款用途', 500);
  if (!['SALARY_DEDUCT', 'LUMP_SUM'].includes(input.repayMode)) throw new Hr09Error('请选择还款方式。', 400);
  const version = input.version == null ? {} : requireVersion(input.version);
  if (input.repayMode === 'LUMP_SUM') return { amount, purpose, repayMode: input.repayMode, repayStartMonth: null, repayMonths: null, monthlyDeductAmount: null, ...version };
  const month = input.repayStartMonth || '';
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month) || month < requireDate(applicationDate).slice(0, 7)) throw new Hr09Error('请选择不早于申请月份的扣还开始月份。', 400);
  const count = input.repayMonths;
  if (count == null || !Number.isSafeInteger(count) || count < 1 || count > 2147483647) throw new Hr09Error('期数须为1至2147483647的整数。', 400);
  const lastMonth = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + count - 1;
  if (lastMonth >= 10000 * 12) throw new Hr09Error('计划末期不能超过9999年12月。', 400);
  const monthly = advanceAmount(input.monthlyDeductAmount || '');
  const beforeLast = new Decimal(monthly).times(count - 1);
  if (beforeLast.greaterThanOrEqualTo(amount) || beforeLast.plus(monthly).lessThan(amount)) throw new Hr09Error('月扣金额与期数须覆盖本金，最后一期按剩余本金归还。', 400);
  return { amount, purpose, repayMode: input.repayMode, repayStartMonth: month, repayMonths: count, monthlyDeductAmount: monthly, ...version };
}

function summary(row: AdvanceSummary): AdvanceSummary {
  if (!row || !['APPLYING', 'APPROVED', 'PAID', 'REPAYING', 'CLEARED', 'WRITTEN_OFF'].includes(row.status)
      || !['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(row.approvalStatus)
      || !['SALARY_DEDUCT', 'LUMP_SUM'].includes(row.repayMode)) throw new Hr09Error('借款状态不完整，已停止展示，请重新读取。');
  requireVersion(row.version);
  return { ...row, advanceId: id(row.advanceId), employeeId: id(row.employeeId), amount: advanceAmount(row.amount),
    repaidAmount: advanceAmount(row.repaidAmount, false), outstandingAmount: advanceAmount(row.outstandingAmount, false),
    reservedAmount: advanceAmount(row.reservedAmount, false), writtenOffAmount: advanceAmount(row.writtenOffAmount, false),
    monthlyDeductAmount: row.monthlyDeductAmount == null ? null : advanceAmount(row.monthlyDeductAmount) };
}
function repayment(row: AdvanceRepayment): AdvanceRepayment {
  if (!row || !['SALARY', 'MANUAL', 'SETTLEMENT'].includes(row.repayType) || !['RESERVED', 'POSTED', 'RELEASED', 'REVERSED'].includes(row.status)) {
    throw new Hr09Error('还款流水状态不完整，已停止展示，请重新读取。');
  }
  return { ...row, repaymentId: id(row.repaymentId), amount: advanceAmount(row.amount, false, true),
    reversalOfId: nullableId(row.reversalOfId), proofFileId: nullableId(row.proofFileId) };
}
const page = <Row,>(value: Hr09Page<Row>, map: (row: Row) => Row): Hr09Page<Row> => ({ ...hr09Page(value), rows: value.rows.map(map) });
const get = <Result,>(path: string, params: AdvanceQuery, signal?: AbortSignal) => hr09Request<Result>({ method: 'GET', url: `${root}${path}`, params, signal });

export const hrAdvanceApi = {
  approvalDetail: async (taskId: string, signal?: AbortSignal): Promise<AdvanceApprovalDetail> => {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) throw new Hr09Error('审批任务编号无效。');
    const result = await get<AdvanceApprovalDetail>(`/approval-task/${encodeURIComponent(taskId)}`, {}, signal);
    if (!result || result.taskId !== taskId || !['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(result.approvalStatus)) throw new Hr09Error('借款审批详情返回不完整，请重新读取。');
    const plan = advanceDraft(result, result.applyDate);
    return { ...result, ...plan, advanceId: id(result.advanceId), advanceNo: requireText(result.advanceNo, '借款单号', 64),
      employeeName: requireText(result.employeeName, '员工姓名', 100), amount: advanceAmount(result.amount) };
  },
  list: async (query: AdvanceQuery, mine: boolean, signal?: AbortSignal) => page(await get<Hr09Page<AdvanceSummary>>(mine ? '/mine' : '/list', query, signal), summary),
  detail: async (advanceId: string, mine: boolean, signal?: AbortSignal): Promise<AdvanceDetail> => {
    const result = await get<AdvanceDetail>(`${mine ? '/mine' : ''}/${requireId(advanceId)}`, {}, signal);
    if (!result || [result.canEdit, result.canRepay, result.canWriteoff].some(value => typeof value !== 'boolean')) throw new Hr09Error('借款办理权限返回不完整，请重新读取。');
    return { ...result, advance: summary(result.advance), repayments: page(result.repayments, repayment) };
  },
  repayments: async (advanceId: string, mine: boolean, query: AdvanceQuery, signal?: AbortSignal) => page(await get<Hr09Page<AdvanceRepayment>>(`${mine ? '/mine' : ''}/${requireId(advanceId)}/repayments`, query, signal), repayment),
  create: async (input: AdvanceDraft, requestKey: string, applicationDate = shanghaiDate()) => id(await hr09Request<unknown>({ method: 'POST', url: root, headers: { 'Idempotency-Key': eventKey(requestKey) }, data: advanceDraft(input, applicationDate) })),
  update: async (advanceId: string, input: AdvanceDraft, applicationDate: string) => hr09Request<void>({ method: 'PUT', url: `${root}/${requireId(advanceId)}`, data: { ...advanceDraft(input, applicationDate), ...requireVersion(input.version as number) } }),
  submit: async (advanceId: string, version: number) => hr09Request<void>({ method: 'POST', url: `${root}/${requireId(advanceId)}/submit`, data: requireVersion(version) }),
  withdraw: async (advanceId: string, version: number, reason: string) => hr09Request<void>({ method: 'POST', url: `${root}/${requireId(advanceId)}/withdraw`, data: { ...requireVersion(version), reason: requireText(reason, '撤回原因', 500) } }),
  uploadProof: async (advanceId: string, file: File): Promise<AdvanceProof> => {
    if (!file || !file.size || file.size > 10485760 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Hr09Error('请选择不超过10MiB的PDF、PNG或JPEG凭据。', 400);
    const data = new FormData(); data.append('file', file);
    const result = await hr09Request<AdvanceProof>({ method: 'POST', url: `${root}/${requireId(advanceId)}/proof`, data, headers: { 'Content-Type': undefined } });
    if (!result || typeof result.fileName !== 'string' || !Number.isSafeInteger(result.fileSize) || result.fileSize <= 0) throw new Hr09Error('凭据上传结果不完整，请重新上传。');
    return { ...result, fileId: id(result.fileId) };
  },
  repay: async (advanceId: string, input: AdvanceRepaymentInput) => {
    const repayDate = requireDate(input.repayDate);
    if (repayDate > shanghaiDate()) throw new Hr09Error('实际还款日期不能晚于今天。', 400);
    return id(await hr09Request<unknown>({ method: 'POST', url: `${root}/${requireId(advanceId)}/repayment`, data: {
      ...requireVersion(input.version), amount: advanceAmount(input.amount), sourceEventKey: eventKey(input.sourceEventKey),
      proofFileId: requireId(input.proofFileId), repayDate, remark: requireText(input.remark, '还款说明', 500),
    } }));
  },
  writeoff: async (advanceId: string, input: AdvanceWriteoffInput) => {
    if (input.confirmed !== true) throw new Hr09Error('请再次确认核销。', 400);
    return hr09Request<void>({ method: 'POST', url: `${root}/${requireId(advanceId)}/writeoff`, data: {
      ...requireVersion(input.version), amount: advanceAmount(input.amount), sourceEventKey: eventKey(input.sourceEventKey),
      reason: requireText(input.reason, '核销原因', 500), confirmed: true,
    } });
  },
  downloadProof: async (advanceId: string, fileId: string): Promise<Blob> => {
    const result = await readHrAuthorizedFile({ bizType: 'HR_ADVANCE_PROOF', bizId: requireId(advanceId), fileId: requireId(fileId) });
    if (!(result instanceof Blob) || !result.size) throw new Hr09Error('未取得有效凭据，下载已停止。');
    const contentType = result.type.split(';', 1)[0].trim().toLowerCase();
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(contentType)) throw new Hr09Error('未取得有效凭据，下载已停止。');
    return result.type === contentType ? result : result.slice(0, result.size, contentType);
  },
};
import { readHrAuthorizedFile } from './fileDownload';
