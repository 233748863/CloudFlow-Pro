import type { PortalContract, PortalContractPage } from './portalContractTypes';
import type { FinanceKind, PortalFinancePage, PortalFinanceRecord } from './portalFinanceTypes';

const storagePrefix = 'cloudflow.portal.session:';
const sessions = new Map<string, { token: string; expiresAt: number }>();
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export interface PortalSession { loginAccount: string; customerName: string; contactName: string }
export interface PortalKnowledge { documentId: number; versionId: number; versionNo: number; title: string; content?: string; attachments: { fileId: number; fileName: string; fileSize: number }[] }
export interface PortalKnowledgePage { rows: PortalKnowledge[]; total: number; pageNum: number; pageSize: number }
export interface PortalFile { fileId: number; fileName: string; fileSize: number; extension: string }
export interface PortalTicket {
  ticketId: number; ticketNo: string; title: string; description?: string; status: string; slaStatus?: string;
  openedTime?: string; firstResponseDue?: string; firstResponseTime?: string; resolutionDue?: string; resolvedTime?: string;
  responseBreached: boolean; resolutionBreached: boolean; solution?: string; solutionPublishedTime?: string; attachments: PortalFile[];
}
export interface PortalTicketPage { rows: PortalTicket[]; total: number; pageNum: number; pageSize: number }
export interface PortalTicketRequest { requestKey: string; title: string; description: string; fileIds: number[] }
interface PortalLogin { portalToken: string; tokenHeader: string; expiresIn: number; idleSeconds: number; session: PortalSession }

export class PortalError extends Error {
  constructor(message: string, readonly code: number) { super(message); }
}

function credential(tenantCode: string) {
  let value = sessions.get(tenantCode);
  if (!value) {
    try { value = JSON.parse(sessionStorage.getItem(storagePrefix + tenantCode) || 'null'); } catch { value = undefined; }
  }
  if (!value || !/^p_[A-Za-z0-9_-]{43}$/.test(value.token) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) {
    clearPortalSession(tenantCode);
    return undefined;
  }
  return value.token;
}

export function clearPortalSession(tenantCode: string) {
  sessions.delete(tenantCode);
  try { sessionStorage.removeItem(storagePrefix + tenantCode); } catch { }
}

function save(tenantCode: string, result: PortalLogin) {
  if (!/^p_[A-Za-z0-9_-]{43}$/.test(result.portalToken) || result.tokenHeader !== 'portal-token'
    || result.expiresIn !== 28800 || result.idleSeconds !== 1800) throw new PortalError('无法确认客户门户登录结果', 502);
  const value = { token: result.portalToken, expiresAt: Date.now() + result.expiresIn * 1000 };
  sessions.set(tenantCode, value);
  try { sessionStorage.setItem(storagePrefix + tenantCode, JSON.stringify(value)); } catch { }
}

async function call<Result>(path: string, options: { tenantCode?: string; body?: unknown; method?: 'GET' | 'POST' | 'DELETE'; signal?: AbortSignal; download?: boolean; preview?: boolean } = {}): Promise<Result> {
  const token = options.tenantCode ? credential(options.tenantCode) : undefined;
  if (options.tenantCode && !token) throw new PortalError('门户登录状态已失效，请重新登录', 401);
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 30000);
  const multipart = options.body instanceof FormData;
  try {
    const response = await fetch(`${baseUrl}/portal${path}`, {
      method: options.method || (options.body === undefined ? 'GET' : 'POST'), credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { Accept: options.download ? 'application/octet-stream, application/json' : 'application/json', ...(options.body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'portal-token': token } : {}) },
      body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body), signal: controller.signal,
    });
    if (options.download && response.ok && response.headers.get('content-type')?.split(';')[0] === 'application/octet-stream') return await response.blob() as Result;
    if (options.preview && response.ok && ['image/png', 'image/jpeg', 'application/pdf'].includes(response.headers.get('content-type')?.split(';')[0] || '')) return await response.blob() as Result;
    const data = await response.json() as { code: number; msg?: string; data: Result };
    if (!response.ok || data.code !== 200) {
      if (options.tenantCode && (response.status === 401 || data.code === 401) && credential(options.tenantCode) === token) clearPortalSession(options.tenantCode);
      throw new PortalError(data.msg || '客户门户请求未成功', data.code || response.status);
    }
    if (options.download || options.preview) throw new PortalError('未收到可读取的附件内容，请重新核对', 502);
    return data.data;
  } catch (failure) {
    if (failure instanceof PortalError) throw failure;
    throw new PortalError('连接中断或等待超时，处理结果尚未确认，请核对后重试', 0);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export const portal = {
  financeList: (tenantCode: string, kind: FinanceKind, keyword: string, pageNum: number, signal?: AbortSignal) =>
    call<PortalFinancePage>(`/crm/${kind === 'RECEIVABLE' ? 'receivable' : 'invoice'}/list?${new URLSearchParams({ keyword, pageNum: String(pageNum), pageSize: '10' })}`, { tenantCode, signal }),
  financeDetail: (tenantCode: string, kind: FinanceKind, id: string, signal?: AbortSignal) =>
    call<PortalFinanceRecord>(`/crm/${kind === 'RECEIVABLE' ? 'receivable' : 'invoice'}/${encodeURIComponent(id)}`, { tenantCode, signal }),
  financeFile: async (tenantCode: string, kind: FinanceKind, recordId: string, fileId: string, preview: boolean, signal?: AbortSignal) => {
    const access = await call<{ downloadTicket: string; expiresIn: number }>('/crm/finance/file/access', { tenantCode, body: { kind, recordId, fileId }, signal });
    if (!/^ff_[A-Za-z0-9_-]{43}$/.test(access.downloadTicket) || access.expiresIn !== 60) throw new PortalError('无法确认财务票据访问权限，请重新核对', 502);
    return call<Blob>('/crm/finance/file/content', { tenantCode, body: { downloadTicket: access.downloadTicket, preview }, signal, download: !preview, preview });
  },
  contractList: (tenantCode: string, keyword: string, pageNum: number, signal?: AbortSignal) => call<PortalContractPage>(`/crm/contract/list?${new URLSearchParams({ keyword, pageNum: String(pageNum), pageSize: '10' })}`, { tenantCode, signal }),
  contractDetail: (tenantCode: string, contractId: string, signal?: AbortSignal) => call<PortalContract>(`/crm/contract/${encodeURIComponent(contractId)}`, { tenantCode, signal }),
  ticketList: (tenantCode: string, keyword: string, status: string, pageNum: number, signal?: AbortSignal) => call<PortalTicketPage>(`/crm/ticket/list?${new URLSearchParams({ keyword, status, pageNum: String(pageNum), pageSize: '10' })}`, { tenantCode, signal }),
  ticketDetail: (tenantCode: string, ticketId: number, signal?: AbortSignal) => call<PortalTicket>(`/crm/ticket/${ticketId}`, { tenantCode, signal }),
  ticketSubmission: (tenantCode: string, requestKey: string, signal?: AbortSignal) => call<PortalTicket>(`/crm/ticket/submission/${encodeURIComponent(requestKey)}`, { tenantCode, signal }),
  ticketCreate: (tenantCode: string, body: PortalTicketRequest) => call<PortalTicket>('/crm/ticket', { tenantCode, body }),
  ticketUpload: (tenantCode: string, requestKey: string, file: File) => {
    const body = new FormData(); body.append('file', file); body.append('requestKey', requestKey);
    return call<PortalFile>('/file/upload', { tenantCode, body });
  },
  ticketUploaded: (tenantCode: string, requestKey: string) => call<PortalFile>(`/file/upload/${encodeURIComponent(requestKey)}`, { tenantCode }),
  ticketRemoveUpload: (tenantCode: string, fileId: number) => call<void>(`/file/${fileId}`, { tenantCode, method: 'DELETE' }),
  ticketDownload: async (tenantCode: string, ticketId: number | undefined, fileId: number, signal?: AbortSignal) => {
    const access = await call<{ downloadTicket: string; expiresIn: number }>('/file/access', { tenantCode, body: { resourceType: ticketId === undefined ? 'UPLOAD' : 'TICKET', ticketId, fileId }, signal });
    if (!/^tf_[A-Za-z0-9_-]{43}$/.test(access.downloadTicket) || access.expiresIn !== 60) throw new PortalError('无法确认工单附件下载权限，请核对后重试', 502);
    return call<Blob>('/file/download', { tenantCode, body: { downloadTicket: access.downloadTicket }, signal, download: true });
  },
  knowledgeDownload: async (tenantCode: string, documentId: number, versionId: number, fileId: number, signal?: AbortSignal) => {
    const access = await call<{ downloadTicket: string; expiresIn: number }>('/file/access', { tenantCode, body: { documentId, versionId, fileId }, signal });
    if (!/^kf_[A-Za-z0-9_-]{43}$/.test(access.downloadTicket) || access.expiresIn !== 60) throw new PortalError('无法确认附件下载权限，请核对后重试', 502);
    return call<Blob>('/file/download', { tenantCode, body: { downloadTicket: access.downloadTicket }, signal, download: true });
  },
  knowledgeList: (tenantCode: string, keyword: string, pageNum: number, signal?: AbortSignal) => call<PortalKnowledgePage>(`/oa/knowledge/list?${new URLSearchParams({ keyword, pageNum: String(pageNum), pageSize: '10' })}`, { tenantCode, signal }),
  knowledgeDetail: (tenantCode: string, id: number, signal?: AbortSignal) => call<PortalKnowledge>(`/oa/knowledge/${id}`, { tenantCode, signal }),
  status: (tenantCode: string, signal?: AbortSignal) => call<string>(`/${encodeURIComponent(tenantCode)}/status`, { signal }),
  login: async (tenantCode: string, loginAccount: string, password: string) => {
    const result = await call<PortalLogin>(`/${encodeURIComponent(tenantCode)}/login`, { body: { loginAccount, password } });
    save(tenantCode, result);
    return result.session;
  },
  activate: (tenantCode: string, activationToken: string, password: string) => call<void>(`/${encodeURIComponent(tenantCode)}/activate`, { body: { activationToken, password } }),
  session: (tenantCode: string, signal?: AbortSignal) => call<PortalSession>('/session', { tenantCode, signal }),
  logout: async (tenantCode: string) => {
    try { await call<void>('/logout', { tenantCode, body: {} }); } finally { clearPortalSession(tenantCode); }
  },
};
