import type { FileDownloadRequest } from '@/services/api/file';

type DownloadContext = Omit<FileDownloadRequest, 'fileId' | 'reference'>;

const businessTypes = new Map<string, DownloadContext['bizType']>([
  ['purchase_request', 'OA_PURCHASE_REQUEST'],
  ['payment_request', 'OA_PAYMENT_REQUEST'],
  ['business_trip', 'OA_BUSINESS_TRIP'],
  ['seal_application', 'OA_SEAL_APPLICATION'],
  ['seal_renewal', 'OA_SEAL_RENEWAL'],
  ['license_borrow', 'OA_LICENSE_BORROW'],
  ['license_renewal', 'OA_LICENSE_RENEWAL'],
  ['biz_contract', 'OA_CONTRACT'],
  ['KNOWLEDGE_DOCUMENT', 'OA_KNOWLEDGE'],
]);

/** Only use values returned for the current task and current signed-in user. */
export function getWorkflowBusinessAttachments(values?: Record<string, unknown>): {
  value?: string;
  downloadContext?: DownloadContext;
} {
  const value = typeof values?.attachmentUrl === 'string' ? values.attachmentUrl.trim() : '';
  if (!value) return {};
  const type = typeof values?.businessType === 'string' ? businessTypes.get(values.businessType) : undefined;
  const identifier = values?.businessId;
  const bizId = typeof identifier === 'string' ? identifier
    : typeof identifier === 'number' && Number.isSafeInteger(identifier) ? String(identifier) : '';
  if (!type || !/^[1-9]\d{0,18}$/.test(bizId) || BigInt(bizId) > 9223372036854775807n) return { value };
  return { value, downloadContext: { bizType: type, bizId, ...(type === 'OA_CONTRACT' ? { slot: 'attachment' as const } : {}) } };
}
