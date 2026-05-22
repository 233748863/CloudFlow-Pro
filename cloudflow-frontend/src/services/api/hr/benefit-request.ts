import request from '@/services/api/request';
import type {
  HrBenefitRequest,
  HrBenefitRequestPayload,
  HrPagedResult,
  HrRecord,
} from './types';

export const listBenefitRequests = (params?: HrRecord) =>
  request.get<HrPagedResult<HrBenefitRequest>>('/hr/benefit/requests', { params });

export const listMineBenefitRequests = (params?: HrRecord) =>
  request.get<HrPagedResult<HrBenefitRequest>>('/hr/benefit/requests/mine', { params });

export const getBenefitRequest = (id: number) =>
  request.get<HrBenefitRequest>(`/hr/benefit/requests/${id}`);

export const createBenefitRequest = (data: HrBenefitRequestPayload) =>
  request.post<number>('/hr/benefit/requests', data);

export const updateBenefitRequest = (
  id: number,
  data: Partial<HrBenefitRequestPayload>,
) => request.put<void>(`/hr/benefit/requests/${id}`, data);

export const submitBenefitRequest = (id: number) =>
  request.post<string>(`/hr/benefit/requests/${id}/submit`);

export const cancelBenefitRequest = (id: number, reason?: string) =>
  request.post<void>(`/hr/benefit/requests/${id}/cancel`, null, {
    params: { reason },
  });
