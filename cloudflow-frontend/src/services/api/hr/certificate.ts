import request from '@/services/api/request';
import { readHrAuthorizedFile } from './fileDownload';
import type {
  HrCertificateRequest,
  HrCertificateRequestPayload,
  HrPagedResult,
  HrPageQuery,
} from './types';

export const listCertificateRequests = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrCertificateRequest>>('/hr/ess/certificates', { params });

export const getCertificateRequest = (id: number) =>
  request.get<HrCertificateRequest>(`/hr/ess/certificates/${id}`);

export const submitCertificateRequest = (data: HrCertificateRequestPayload) =>
  request.post<number>('/hr/ess/certificates', data);

export const cancelCertificateRequest = (id: number) =>
  request.post<void>(`/hr/ess/certificates/${id}/cancel`, {});

export const downloadCertificatePdf = async (id: number) => {
  const record = await getCertificateRequest(id);
  return readHrAuthorizedFile({ bizType: 'HR_EMPLOYEE_CERTIFICATE', bizId: String(id), fileId: record.pdfFileId ?? undefined });
};
