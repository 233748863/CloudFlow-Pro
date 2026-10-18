import request from './request';
import type { PageQuery } from './auth';
import type { TenantStorageSummary } from './tenant';
import type { FilePreviewRequest } from './filePreview';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { downloadBlob } from '@/utils/download';

interface FileDownloadAccess {
  url: string;
  expiresAt: number;
}

export type HrFileDownloadBusiness = 'HR_ATTENDANCE_PHOTO' | 'HR_GRIEVANCE_MINE'
  | 'HR_GRIEVANCE_MANAGE' | 'HR_GRIEVANCE_DISPUTE' | 'HR_LEAVE_PROOF_MINE' | 'HR_LEAVE_PROOF_MANAGE'
  | 'HR_ADVANCE_PROOF' | 'HR_SETTLEMENT_PROOF' | 'HR_EXIT_INTERVIEW' | 'HR_TRAINING_AGREEMENT' | 'HR_SEVERANCE_POLICY'
  | 'HR_REFERRAL_RESUME_MINE' | 'HR_REFERRAL_RESUME_MANAGE' | 'HR_TAX_PROOF_MINE' | 'HR_TAX_PROOF_MANAGE'
  | 'HR_EMPLOYEE_CERTIFICATE' | 'HR_TRAINING_CERTIFICATE';
export interface FileDownloadRequest extends Omit<FilePreviewRequest, 'bizType'> {
  bizType: FilePreviewRequest['bizType'] | HrFileDownloadBusiness | 'CRM_EMAIL_ATTACHMENT' | 'CRM_PORTAL_TICKET'
    | 'OA_MEETING_ROOM' | 'OA_RFQ_INVITATION' | 'OA_RFQ_QUOTATION' | 'OA_LICENSE_BORROW' | 'OA_SEAL_APPLICATION'
    | 'OA_SEAL' | 'OA_BUSINESS_TRIP' | 'OA_LICENSE_RENEWAL' | 'OA_SEAL_RENEWAL' | 'OA_LICENSE_HANDOVER' | 'OA_SEAL_HANDOVER' | 'OA_PAYMENT_REQUEST'
    | 'OA_PURCHASE_REQUEST' | 'OA_CONTRACT_MILESTONE'
    | 'HR_EMPLOYEE_CONTRACT' | 'HR_EMPLOYEE_DOCUMENT' | 'HR_ATTENDANCE_APPEAL'
    | 'HR_DISPUTE_MEDIATION' | 'HR_DISPUTE_ARBITRATION';
}

export async function saveAuthorizedFile(context: FileDownloadRequest, name: string): Promise<void> {
  const blob = await downloadAuthorizedFile(context, new AbortController().signal);
  downloadBlob(blob, name);
}

export async function downloadAuthorizedFile(context: FileDownloadRequest, signal: AbortSignal): Promise<Blob> {
  if (context.fileId != null ? !/^[1-9]\d*$/.test(String(context.fileId)) : !context.reference?.trim()) throw new Error('请选择有效文件');
  const session = getAuthSessionVersion();
  const ensureCurrent = () => {
    if (signal.aborted || session !== getAuthSessionVersion()) throw new DOMException('下载已取消', 'AbortError');
  };
  ensureCurrent();
  const endpoint = context.fileId == null ? '/auth/system/file/url' : `/auth/system/file/${context.fileId}/url`;
  const access = await request.get<FileDownloadAccess>(endpoint, {
    params: context, signal, silent: true, headers: { 'Cache-Control': 'no-store' },
  });
  ensureCurrent();
  if (!access || typeof access.url !== 'string' || !Number.isSafeInteger(access.expiresAt)
    || access.expiresAt !== 0 && access.expiresAt <= Date.now()) throw new Error('下载地址已失效，请重新申请');
  let blob: Blob;
  if (/^\/api\/auth\/system\/file\/download\?token=[A-Za-z0-9_-]{43}$/.test(access.url)) {
    blob = await request.get<Blob>(access.url.slice(4), { responseType: 'blob', signal, silent: true, timeout: 60000 });
  } else {
    let address: URL;
    try { address = new URL(access.url); } catch { throw new Error('下载地址无效，请重新申请'); }
    if (!['https:', 'http:'].includes(address.protocol) || address.username || address.password) throw new Error('下载地址无效，请重新申请');
    const response = await fetch(address.href, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('文件下载失败，请重新申请');
    blob = await response.blob();
  }
  ensureCurrent();
  if (!(blob instanceof Blob)) throw new Error('文件下载失败');
  return blob;
}

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/auth/system/file/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getFileList = (params?: PageQuery) => {
  return request.get('/auth/system/file/list', { params });
};

export const getFileStorageSummary = () => {
  return request.get('/auth/system/file/storage/summary') as Promise<TenantStorageSummary>;
};

export const refreshFileStorageSummary = () => {
  return request.post('/auth/system/file/storage/refresh') as Promise<TenantStorageSummary>;
};

export const deleteFile = (fileIds: number[]) => {
  return request.delete(`/auth/system/file/${fileIds.join(',')}`);
};
