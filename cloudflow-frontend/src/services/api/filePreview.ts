import request from './request';

export type FilePreviewBusiness = 'PUBLIC' | 'OA_CONTRACT' | 'OA_LICENSE' | 'OA_KNOWLEDGE'
  | 'OA_EXPENSE' | 'OA_INVOICE' | 'HR_RESUME' | 'OA_CONTRACT_EVIDENCE' | 'OA_CONTRACT_SIGNED'
  | 'OA_SUPPLIER_QUALIFICATION' | 'WORKFLOW_FORM';

export interface FilePreviewContext {
  bizType: FilePreviewBusiness;
  bizId?: string;
  slot?: 'attachment' | 'archive';
  childId?: number;
  versionNo?: number;
  definitionId?: string;
  instanceId?: string;
  taskId?: string;
  fieldPath?: string;
}

export interface FilePreviewRequest extends FilePreviewContext {
  fileId?: string | number;
  reference?: string;
}

export interface FilePreviewTicket {
  supported: boolean;
  fileName: string;
  size: number;
  mediaType?: string;
  streamUrl?: string;
  expiresAt?: number;
  message: string;
}

export const FILE_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

export function issueFilePreview(context: FilePreviewRequest, signal: AbortSignal): Promise<FilePreviewTicket> {
  return request.post('/auth/system/file/preview-ticket', context, { signal, silent: true });
}

export async function readFilePreview(ticket: FilePreviewTicket, controller: AbortController): Promise<Blob> {
  if (!ticket.supported || !ticket.streamUrl?.match(/^\/api\/auth\/system\/file\/preview-content\?previewToken=[A-Za-z0-9_-]{43}&signature=[A-Za-z0-9_-]{43}$/)
    || !ticket.mediaType || !['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ticket.mediaType)
    || ticket.size <= 0 || ticket.size > FILE_PREVIEW_MAX_BYTES) throw new Error('预览凭据无效，请重新打开附件');
  const blob = await request.get<Blob>(ticket.streamUrl.slice(4), {
    responseType: 'blob', signal: controller.signal, silent: true, timeout: 60000,
    headers: { 'Cache-Control': 'no-store' },
    onDownloadProgress: (progress) => { if (progress.loaded > FILE_PREVIEW_MAX_BYTES) controller.abort(); },
  });
  if (!(blob instanceof Blob) || blob.size !== ticket.size || blob.type.split(';')[0] !== ticket.mediaType) {
    throw new Error('附件内容或大小发生变化，请重新打开预览');
  }
  return blob;
}

export function readOriginalPreviewDownload(path: string, signal: AbortSignal): Promise<Blob> {
  return request.get(path, { responseType: 'blob', signal, silent: true, timeout: 60000 });
}
