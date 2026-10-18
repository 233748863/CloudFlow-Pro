import Decimal from 'decimal.js';
import { hr09Page, hr09Request } from './hr09Request';
import { Hr09Error, requireDate, requireId, requireText, requireVersion, shanghaiDate } from './hr09Model';

export interface SettlementSampling { months: string[]; averagingMonths: string; reason: string }
export interface SettlementReview extends SettlementSampling { reviewedBy: string; reviewedTime: string; joinDate: string; relievingDate: string }
export interface SettlementItem {
  itemId: string; itemType: 'PAYABLE' | 'RECEIVABLE' | 'ASSET' | 'SEVERANCE'; itemName: string; sourceBizType: string; sourceBizId: string;
  amount: string; confirmed: boolean; posted: boolean; evidence: Record<string, unknown>;
}
export interface FinalSettlement {
  settlementId: string; settlementNo: string; employeeId: string; employeeName: string; lifecycleApplicationId: string;
  joinDate: string; relievingDate: string; ruleId: string | null; ruleName: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'PAID' | 'CLOSED'; approvalStatus: string; version: number; remark: string | null;
  totalPayable: string; totalReceivable: string; assetRecoveryCost: string; severanceAmount: string; netAmount: string;
  sampling: SettlementReview | null; calculated: boolean; editable: boolean; missingRequirements: string[]; items: SettlementItem[];
  approval: { revision: number; cancelPending: boolean; canWithdraw: boolean; cancelOutcome: string | null } | null;
  funds: SettlementFunds;
  settlementKind: 'NORMAL' | 'REVERSAL'; canSubmit: boolean; canRemindAssets: boolean;
  reversal: { originalSettlementId: string | null; originalSettlementNo: string | null; reversalSettlementId: string | null; completed: boolean; canCreate: boolean };
}
export interface SettlementFunds {
  direction: 'PAYMENT' | 'RECEIPT' | 'NETTING'; confirmedTime: string | null; paidTime: string | null;
  paymentRequestId: string | null; proofFileId: string | null; actualDate: string | null; closedTime: string | null;
  canConfirm: boolean; canReceipt: boolean; canClose: boolean;
}
export interface SettlementProof { fileId: string; fileName: string; fileSize: number }
export interface SettlementOption { value: string; label: string; employeeId: string; relievingDate: string }
export interface SettlementPolicyOption { value: string; label: string }
export interface SettlementQuery { pageNum?: number; pageSize?: number; employeeId?: string; keyword?: string; status?: string }
export interface SettlementUpdate { ruleId: string | null; sampling: SettlementSampling | null; remark: string | null }
export interface AssetReviewInput { sourceFingerprint: string; resolution: 'LOSS_ASSESSED' | 'RELEASED_NO_LOSS' | 'CLEAR'; amount: string; reason: string }
export interface AssetReturnReminder {
  employeeId: string; userId: string; assetId: string; assetVersion: number; assetCode: string; assetName: string;
  canSend: boolean; blockedReason: string | null;
  latest: { id: string; reminderTime: string; operatorId: string; operatorName: string; content: string } | null;
}
const root = '/hr/settlement';
const id = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Hr09Error('记录编号无法完整读取，请重新读取。');
  return requireId(typeof value === 'string' || typeof value === 'number' ? String(value) : '');
};
const money = (value: unknown): string => {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d{0,11})\.\d{2}$/.test(value)) throw new Hr09Error('结算金额不完整，请重新读取。');
  return value;
};
export function settlementSampling(value: SettlementSampling): SettlementSampling {
  if (!value || !Array.isArray(value.months) || !value.months.length || value.months.length > 120
    || value.months.some(month => typeof month !== 'string' || !/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(month))
    || new Set(value.months).size !== value.months.length) throw new Hr09Error('请选择1至120个不重复的取样月份。', 400);
  if (typeof value.averagingMonths !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(value.averagingMonths.trim())
    || new Decimal(value.averagingMonths).lte(0) || new Decimal(value.averagingMonths).gt(120)) throw new Hr09Error('平均月份数须大于0且不超过120，最多4位小数。', 400);
  return { months: [...value.months].sort(), averagingMonths: value.averagingMonths.trim(), reason: requireText(value.reason, '核定原因', 2000) };
}
const record = (value: FinalSettlement): FinalSettlement => {
  if (!value || !['DRAFT', 'CONFIRMED', 'PAID', 'CLOSED'].includes(value.status) || typeof value.approvalStatus !== 'string'
    || typeof value.calculated !== 'boolean' || typeof value.editable !== 'boolean' || typeof value.canRemindAssets !== 'boolean'
    || !Array.isArray(value.missingRequirements) || value.missingRequirements.some(item => typeof item !== 'string')
    || !Array.isArray(value.items) || typeof value.employeeName !== 'string') throw new Hr09Error('结算详情不完整，请重新读取。');
  requireVersion(value.version);
  if (!['NORMAL', 'REVERSAL'].includes(value.settlementKind) || typeof value.canSubmit !== 'boolean' || !value.reversal
    || typeof value.reversal.completed !== 'boolean' || typeof value.reversal.canCreate !== 'boolean'
    || (value.settlementKind === 'REVERSAL') !== (value.reversal.originalSettlementId != null)) throw new Hr09Error('结算冲正关系不完整，请重新读取。');
  if (value.approval != null && (!Number.isInteger(value.approval.revision) || value.approval.revision < 1
    || typeof value.approval.cancelPending !== 'boolean' || typeof value.approval.canWithdraw !== 'boolean')) throw new Hr09Error('审批进度不完整，请重新读取。');
  const funds = value.funds;
  if (!funds || !['PAYMENT', 'RECEIPT', 'NETTING'].includes(funds.direction)
    || typeof funds.canConfirm !== 'boolean' || typeof funds.canReceipt !== 'boolean' || typeof funds.canClose !== 'boolean'
    || [funds.confirmedTime, funds.paidTime, funds.closedTime].some(time => time != null && (typeof time !== 'string' || !time))) throw new Hr09Error('结算收付进度不完整，请重新读取。');
  const items = value.items.map(item => {
    if (!item || !['PAYABLE', 'RECEIVABLE', 'ASSET', 'SEVERANCE'].includes(item.itemType) || typeof item.itemName !== 'string'
      || typeof item.sourceBizType !== 'string' || typeof item.sourceBizId !== 'string' || typeof item.confirmed !== 'boolean' || typeof item.posted !== 'boolean'
      || !item.evidence || typeof item.evidence !== 'object' || Array.isArray(item.evidence)) throw new Hr09Error('结算来源明细不完整，请重新读取。');
    return { ...item, itemId: id(item.itemId), amount: money(item.amount) };
  });
  const totals = { totalPayable: money(value.totalPayable), totalReceivable: money(value.totalReceivable), assetRecoveryCost: money(value.assetRecoveryCost), severanceAmount: money(value.severanceAmount), netAmount: money(value.netAmount) };
  if (!new Decimal(totals.totalPayable).plus(totals.severanceAmount).minus(totals.totalReceivable).minus(totals.assetRecoveryCost).eq(totals.netAmount)) throw new Hr09Error('结算合计与明细不一致，请重新读取。');
  let sampling: SettlementReview | null = null;
  if (value.sampling != null) {
    const reviewed = value.sampling;
    if (typeof reviewed.reviewedTime !== 'string' || !reviewed.reviewedTime) throw new Hr09Error('取样核定时间缺失，请重新读取。');
    sampling = { ...settlementSampling(reviewed), reviewedBy: id(reviewed.reviewedBy), reviewedTime: reviewed.reviewedTime, joinDate: requireDate(reviewed.joinDate), relievingDate: requireDate(reviewed.relievingDate) };
  }
  return { ...value, ...totals, settlementId: id(value.settlementId), settlementNo: requireText(value.settlementNo, '结算单号', 64),
    employeeId: id(value.employeeId), lifecycleApplicationId: id(value.lifecycleApplicationId), joinDate: requireDate(value.joinDate), relievingDate: requireDate(value.relievingDate),
    ruleId: value.ruleId == null ? null : id(value.ruleId), sampling, items,
    reversal: { ...value.reversal, originalSettlementId: value.reversal.originalSettlementId == null ? null : id(value.reversal.originalSettlementId),
      reversalSettlementId: value.reversal.reversalSettlementId == null ? null : id(value.reversal.reversalSettlementId),
      originalSettlementNo: value.reversal.originalSettlementNo == null ? null : requireText(value.reversal.originalSettlementNo, '原结算单号', 64) },
    funds: { ...funds, paymentRequestId: funds.paymentRequestId == null ? null : id(funds.paymentRequestId), proofFileId: funds.proofFileId == null ? null : id(funds.proofFileId), actualDate: funds.actualDate == null ? null : requireDate(funds.actualDate) } };
};
const option = (value: SettlementPolicyOption): SettlementPolicyOption => {
  if (!value || typeof value.label !== 'string') throw new Hr09Error('可选记录名称不完整，请重新读取。');
  return { value: id(value.value), label: value.label };
};
const assetReminder = (value: AssetReturnReminder, row: FinalSettlement, item: SettlementItem): AssetReturnReminder => {
  if (!value || id(value.employeeId) !== row.employeeId || id(value.assetId) !== item.sourceBizId
    || typeof value.assetCode !== 'string' || typeof value.assetName !== 'string' || typeof value.canSend !== 'boolean'
    || (!value.canSend && (typeof value.blockedReason !== 'string' || !value.blockedReason))) throw new Hr09Error('归还提醒记录不完整，请重新读取。');
  requireVersion(value.assetVersion);
  if (value.latest != null && (typeof value.latest.reminderTime !== 'string' || !value.latest.reminderTime
    || typeof value.latest.operatorName !== 'string' || !value.latest.operatorName || typeof value.latest.content !== 'string' || !value.latest.content)) throw new Hr09Error('最近提醒记录不完整，请重新读取。');
  return { ...value, employeeId: id(value.employeeId), userId: id(value.userId), assetId: id(value.assetId),
    latest: value.latest == null ? null : { ...value.latest, id: id(value.latest.id), operatorId: id(value.latest.operatorId) } };
};
export const finalSettlementApi = {
  assetReminder: async (row: FinalSettlement, item: SettlementItem, signal?: AbortSignal): Promise<AssetReturnReminder> =>
    assetReminder(await hr09Request({ method: 'GET', url: `${root}/${id(row.settlementId)}/assets/${id(item.itemId)}/reminder`, signal }), row, item),
  sendAssetReminder: async (row: FinalSettlement, item: SettlementItem, observed: AssetReturnReminder): Promise<AssetReturnReminder> => {
    const current = assetReminder(observed, row, item);
    if (!current.canSend || !row.canRemindAssets) throw new Hr09Error(current.blockedReason || '当前结算不能发送归还提醒。', 400);
    const result = assetReminder(await hr09Request({ method: 'POST', url: `${root}/${id(row.settlementId)}/assets/${id(item.itemId)}/reminder`,
      data: { ...requireVersion(row.version), assetVersion: current.assetVersion, lastReminderId: current.latest?.id || '0' } }), row, item);
    if (!result.latest || BigInt(result.latest.id) <= BigInt(current.latest?.id || '0')) throw new Hr09Error('发送结果尚待核实，请读取最近提醒。');
    return result;
  },
  reverse: async (row: FinalSettlement, reason: string): Promise<string> => id(await hr09Request({ method: 'POST', url: `${root}/${id(row.settlementId)}/reverse`, data: { ...requireVersion(row.version), reason: requireText(reason, '冲正原因', 500) } })),
  confirm: (row: FinalSettlement) => hr09Request<void>({ method: 'POST', url: `${root}/${id(row.settlementId)}/confirm`, data: requireVersion(row.version) }),
  close: (row: FinalSettlement) => hr09Request<void>({ method: 'POST', url: `${root}/${id(row.settlementId)}/close`, data: requireVersion(row.version) }),
  receipt: (row: FinalSettlement, proofFileId: string, date: string) => {
    const actualDate = requireDate(date);
    if (!row.funds.confirmedTime || actualDate < row.funds.confirmedTime.slice(0, 10) || actualDate > shanghaiDate()) throw new Hr09Error('实际收款日期须在结算确认日期至今日之间。', 400);
    return hr09Request<void>({ method: 'POST', url: `${root}/${id(row.settlementId)}/receipt`, data: { ...requireVersion(row.version), proofFileId: id(proofFileId), actualDate } });
  },
  uploadProof: async (row: FinalSettlement, file: File): Promise<SettlementProof> => {
    if (!file || !file.size || file.size > 10485760 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Hr09Error('请选择不超过10MiB的PDF、PNG或JPEG收款凭据。', 400);
    const data = new FormData(); data.append('file', file);
    const result = await hr09Request<SettlementProof>({ method: 'POST', url: `${root}/${id(row.settlementId)}/proof`, data, headers: { 'Content-Type': undefined } });
    if (!result || typeof result.fileName !== 'string' || !Number.isSafeInteger(result.fileSize) || result.fileSize <= 0 || result.fileSize !== file.size) throw new Hr09Error('凭据上传结果不完整，请重新上传。');
    return { ...result, fileId: id(result.fileId) };
  },
  downloadProof: async (row: FinalSettlement): Promise<Blob> => {
    const result = await readHrAuthorizedFile({ bizType: 'HR_SETTLEMENT_PROOF', bizId: id(row.settlementId), fileId: id(row.funds.proofFileId) });
    if (!(result instanceof Blob) || !result.size) throw new Hr09Error('未取得有效收款凭据。');
    const contentType = result.type.split(';', 1)[0].trim().toLowerCase();
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(contentType)) throw new Hr09Error('未取得有效收款凭据。');
    return result.type === contentType ? result : result.slice(0, result.size, contentType);
  },
  approvalDetail: async (taskId: string, signal?: AbortSignal) => record(await hr09Request({ method: 'GET', url: `${root}/approval-task/${encodeURIComponent(requireText(taskId, '任务编号', 64))}`, signal })),
  submit: (row: FinalSettlement) => hr09Request<void>({ method: 'POST', url: `${root}/${id(row.settlementId)}/${row.settlementKind === 'REVERSAL' ? 'reversal-submit' : 'submit'}`, data: requireVersion(row.version) }),
  withdraw: (row: FinalSettlement, reason: string) => hr09Request<void>({ method: 'POST', url: `${root}/${id(row.settlementId)}/${row.settlementKind === 'REVERSAL' ? 'reversal-withdraw' : 'withdraw'}`, data: { ...requireVersion(row.version), reason: requireText(reason, '撤回原因', 500) } }),
  list: async (query: SettlementQuery, signal?: AbortSignal) => {
    const page = hr09Page<FinalSettlement>(await hr09Request({ method: 'GET', url: `${root}/list`, params: query, signal }));
    return { ...page, rows: page.rows.map(record) };
  },
  detail: async (identifier: string, signal?: AbortSignal) => record(await hr09Request({ method: 'GET', url: `${root}/${id(identifier)}`, signal })),
  applications: async (query: SettlementQuery, signal?: AbortSignal) => {
    const page = hr09Page<SettlementOption>(await hr09Request({ method: 'GET', url: `${root}/applications`, params: query, signal }));
    return { ...page, rows: page.rows.map(value => ({ ...option(value), employeeId: id(value.employeeId), relievingDate: requireDate(value.relievingDate) })) };
  },
  policies: async (identifier: string, query: SettlementQuery, signal?: AbortSignal) => {
    const page = hr09Page<SettlementPolicyOption>(await hr09Request({ method: 'GET', url: `${root}/${id(identifier)}/policies`, params: query, signal }));
    return { ...page, rows: page.rows.map(option) };
  },
  create: async (applicationId: string, remark: string) => id(await hr09Request({ method: 'POST', url: root, data: { lifecycleApplicationId: id(applicationId), remark: remark.trim() || null } })),
  update: async (row: FinalSettlement, value: SettlementUpdate) => {
    const sampling = value.sampling ? settlementSampling(value.sampling) : null;
    if (sampling?.months.some(month => month < row.joinDate.slice(0, 7) || month > row.relievingDate.slice(0, 7))) throw new Hr09Error('取样月份须位于本次入职和离职月份之间。', 400);
    await hr09Request({ method: 'PUT', url: `${root}/${id(row.settlementId)}`, data: { ...requireVersion(row.version), ruleId: value.ruleId ? id(value.ruleId) : null, sampling, remark: value.remark ? requireText(value.remark, '备注', 500) : null } });
  },
  calculate: async (row: FinalSettlement) => record(await hr09Request({ method: 'POST', url: `${root}/${id(row.settlementId)}/calculate`, data: requireVersion(row.version) })),
  refreshSource: async (row: FinalSettlement) => record(await hr09Request({ method: 'POST', url: `${root}/${id(row.settlementId)}/refresh-source`, data: requireVersion(row.version) })),
  assetObservation: async (row: FinalSettlement, item: SettlementItem, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    const value = await hr09Request<Record<string, unknown>>({ method: 'GET', url: `${root}/${id(row.settlementId)}/assets/${id(item.itemId)}`, signal });
    if (!value || value.sourceVerified !== true || typeof value.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceFingerprint)
      || typeof value.responsibilityReleased !== 'boolean' || typeof value.ownershipConsistent !== 'boolean') throw new Hr09Error('资产责任核实结果不完整，请重新读取。');
    return value;
  },
  reviewAsset: async (row: FinalSettlement, item: SettlementItem, input: AssetReviewInput) => {
    if (!['LOSS_ASSESSED', 'RELEASED_NO_LOSS', 'CLEAR'].includes(input.resolution) || !/^[a-f0-9]{64}$/.test(input.sourceFingerprint)) throw new Hr09Error('请重新读取资产并选择处理方式。', 400);
    if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(input.amount.trim()) || new Decimal(input.amount).gt('999999999999.99')
      || (input.resolution === 'LOSS_ASSESSED' ? new Decimal(input.amount).lte(0) : !new Decimal(input.amount).isZero())) throw new Hr09Error('损失须填写正金额，最多6位小数且不超过999999999999.99元；其他处理金额须为0。', 400);
    return record(await hr09Request({ method: 'POST', url: `${root}/${id(row.settlementId)}/assets/${id(item.itemId)}/review`, data: { ...requireVersion(row.version), ...input, amount: input.amount.trim(), reason: requireText(input.reason, '处理原因', 2000) } }));
  },
};
import { readHrAuthorizedFile } from './fileDownload';
