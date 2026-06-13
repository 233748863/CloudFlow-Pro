import request from '@/services/api/request';
import type {
  HrDisputeEvidence,
  HrDisputeEvidencePayload,
  HrLaborDispute,
  HrLaborDisputePayload,
  HrPagedResult,
  HrRecord,
} from './types';

export const listDisputes = (params?: HrRecord) =>
  request.get<HrPagedResult<HrLaborDispute>>('/hr/labor/disputes', { params });

export const getDispute = (id: number) =>
  request.get<HrLaborDispute>(`/hr/labor/disputes/${id}`);

export const registerDispute = (data: HrLaborDisputePayload) =>
  request.post<number>('/hr/labor/disputes', data);

export const updateDispute = (id: number, data: Partial<HrLaborDisputePayload>) =>
  request.put<void>(`/hr/labor/disputes/${id}`, data);

export const submitDispute = (id: number) =>
  request.post<string>(`/hr/labor/disputes/${id}/submit`);

export const closeDispute = (id: number, reason?: string) =>
  request.post<void>(`/hr/labor/disputes/${id}/close`, null, {
    params: { reason },
  });

export const listEvidence = (id: number) =>
  request.get<HrPagedResult<HrDisputeEvidence>>(`/hr/labor/disputes/${id}/evidence`);

export const uploadEvidence = (id: number, data: HrDisputeEvidencePayload) =>
  request.post<number>(`/hr/labor/disputes/${id}/evidence`, data);
