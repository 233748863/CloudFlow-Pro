import request from '@/services/api/request';
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

export const downloadCertificatePdf = (id: number) =>
  request.get<Blob>(`/hr/ess/certificates/${id}/pdf`, { responseType: 'blob' });
