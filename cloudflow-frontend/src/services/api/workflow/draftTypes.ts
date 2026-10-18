import type { FormDefinition } from '@/types';
import type { FieldPermission, StartAssigneeNode } from '@/types/workflowSemantic';
import { getFormFieldErrors } from '@/utils/formFieldErrors';

export interface DraftLaunchContextVO {
  definitionId: string;
  processDefKey: string;
  definitionName: string;
  formId: string | null;
  formDefinition: FormDefinition | null;
  fieldPermissions: FieldPermission[];
  assigneeNodes: StartAssigneeNode[];
  contextHash: string;
}

export interface DraftContent {
  title: string;
  formData: Record<string, unknown>;
  nodeAssignees: Record<string, string[]>;
}

export interface DraftSaveRequest extends DraftContent {
  draftId?: string;
  definitionId: string;
  expectedVersion: number;
  loadedContextHash: string;
}

export interface DraftSaveResult {
  draftId: string;
  definitionId: string;
  lockVersion: number;
  lastSaveTime: string;
  expireTime: string;
  changed: boolean;
}

export interface DraftSummaryVO {
  draftId: string;
  definitionId: string;
  definitionName: string;
  title: string | null;
  lastSaveTime: string;
  expireTime: string;
  lockVersion: number;
  availability: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
  unavailableReason: string | null;
}

export interface DraftDetailVO extends DraftSummaryVO {
  formId: string | null;
  formData: Record<string, unknown>;
  nodeAssignees: Record<string, string[]> | null;
  contextHash: string;
}

export interface DraftListQuery {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  definitionId?: string;
}

export interface DraftPageResult {
  rows: DraftSummaryVO[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface DraftReferenceOption {
  id: string;
  label: string;
  departmentId?: string | null;
}

export interface DraftReferenceQuery {
  pageNum: number;
  pageSize: number;
}

export interface DraftReferencePageResult extends DraftReferenceQuery {
  rows: DraftReferenceOption[];
  total: number;
}

export interface DraftStartRequest {
  draftId: string;
  expectedVersion: number;
}

export interface DraftStartResult {
  instanceId: string;
  processInstanceId: string;
  processNo: string;
}

export const DRAFT_ERROR_MESSAGES: Record<string, string> = {
  DRAFT_NOT_FOUND: '草稿不存在或已不可访问，当前填写内容仍保留。',
  DRAFT_CONFLICT: '草稿已被其他窗口修改，已停止保存以防覆盖，当前填写内容仍保留。',
  DRAFT_EXPIRED: '草稿已到期，无法继续保存或提交；当前填写内容仍保留。',
  DRAFT_STALE: '流程、表单或审批范围已变化，已停止保存，当前填写内容仍保留。',
  DRAFT_UNAVAILABLE: '流程已不可发起，当前填写内容仍保留。',
  DRAFT_REFERENCE_UNAVAILABLE: '当前字段不可读取选项，请重新打开流程后重试。',
  DRAFT_TOO_LARGE: '草稿内容超过允许的大小，请减少填写内容后重试。',
  FORM_INVALID_DATA: '请修正提示的表单字段后重试，当前填写内容仍保留。',
  FORM_UNSUPPORTED_FIELD_TYPE: '表单包含本轮不支持的字段类型，无法继续发起。',
  BUSINESS_ENTRY_REQUIRED: '请从对应业务专页办理此申请，通用表单和草稿不支持此流程。',
  PERMISSION_DENIED: '当前账号没有此项草稿操作权限。',
  REQUEST_REJECTED: '操作未成功，请检查填写内容和审批人后重试；当前内容仍保留。',
  REQUEST_FAILED: '无法确认请求结果，请检查网络后重试；当前内容仍保留。',
  INVALID_RESPONSE: '返回的草稿信息不完整，已停止操作以保护当前内容。',
  SAVE_UNCONFIRMED: '上次保存结果尚未确认，请重试保存以核对服务端草稿。',
  SUBMIT_UNCONFIRMED: '提交结果尚未确认，请重试提交以查询原结果，当前内容仍保留。',
  ASSIGNEES_REQUIRED: '请为所有需要指定审批人的节点完成选择。',
};

export class WorkflowDraftError extends Error {
  constructor(public readonly code: string, public readonly uncertain = false, public readonly fieldErrors: Record<string, string> = {}) {
    super(DRAFT_ERROR_MESSAGES[code] || DRAFT_ERROR_MESSAGES.REQUEST_REJECTED);
    this.name = 'WorkflowDraftError';
  }
}

export function toWorkflowDraftError(error: unknown): WorkflowDraftError {
  if (error instanceof WorkflowDraftError) return error;
  return new WorkflowDraftError('REQUEST_FAILED', true);
}

export function decodeDraftResponse(raw: unknown, status?: number): unknown {
  let response: unknown = raw;
  if (typeof raw === 'string') {
    try {
      response = JSON.parse(raw);
    } catch {
      throw new WorkflowDraftError('REQUEST_FAILED', true);
    }
  }
  if (!response || typeof response !== 'object') throw new WorkflowDraftError('INVALID_RESPONSE', true);
  const envelope = response as Record<string, unknown>;
  if (status === 401 || envelope.code === 401) return { code: 401, msg: '登录已过期，请重新登录' };
  if (envelope.code === 200 && (!status || status < 400)) return response;
  const message = typeof envelope.msg === 'string' ? envelope.msg : typeof envelope.message === 'string' ? envelope.message : '';
  const businessCode = typeof envelope.code === 'string' && Object.hasOwn(DRAFT_ERROR_MESSAGES, envelope.code)
    ? envelope.code
    : Object.keys(DRAFT_ERROR_MESSAGES).find((code) => message.startsWith(code) || message.startsWith(`[${code}]`));
  if (businessCode) throw new WorkflowDraftError(businessCode, false, getFormFieldErrors(envelope));
  if (status === 403 || envelope.code === 403) throw new WorkflowDraftError('PERMISSION_DENIED');
  if (status && status >= 500) throw new WorkflowDraftError('REQUEST_FAILED', true);
  throw new WorkflowDraftError('REQUEST_REJECTED');
}

export function draftExpireTimestamp(expireTime: string): number {
  return Date.parse(expireTime.replace(' ', 'T'));
}

export function isDraftExpired(draft: Pick<DraftSummaryVO, 'expireTime'>, now = Date.now()): boolean {
  const expires = draftExpireTimestamp(draft.expireTime);
  return !Number.isFinite(expires) || expires <= now;
}

export function draftUnavailableMessage(draft: DraftSummaryVO, now = Date.now()): string | null {
  if (isDraftExpired(draft, now)) return '草稿已到期，无法继续填写。';
  if (draft.availability === 'STALE') return '流程、表单或审批范围已变化，请删除后重新发起。';
  if (draft.availability === 'UNAVAILABLE') return '当前无法发起此流程，仍可删除本人的草稿。';
  return null;
}
