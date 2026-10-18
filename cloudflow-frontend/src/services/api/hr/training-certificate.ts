import request from '@/services/api/request';
import { readHrAuthorizedFile } from './fileDownload';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTrainingCertificate,
  HrTrainingCertificateIssuePayload,
} from './types';

export const listTrainingCertificates = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingCertificate>>('/hr/training/certificates', { params });

export const listMyTrainingCertificates = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingCertificate>>('/hr/training/certificates/mine', { params });

export const getTrainingCertificate = (id: number) =>
  request.get<HrTrainingCertificate>(`/hr/training/certificates/${id}`);

export const issueTrainingCertificate = (data: HrTrainingCertificateIssuePayload) =>
  request.post<number>('/hr/training/certificates/issue', data);

export const revokeTrainingCertificate = (id: number, reason?: string) =>
  request.post<void>(`/hr/training/certificates/${id}/revoke`, { reason });

export const regenerateTrainingCertificatePdf = (id: number) =>
  request.post<void>(`/hr/training/certificates/${id}/regenerate`, {});

export const downloadTrainingCertificatePdf = async (id: number) => {
  const record = await getTrainingCertificate(id);
  return readHrAuthorizedFile({ bizType: 'HR_TRAINING_CERTIFICATE', bizId: String(id), fileId: record.pdfFileId ?? undefined });
};
