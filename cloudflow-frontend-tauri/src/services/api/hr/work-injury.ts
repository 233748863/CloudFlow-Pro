import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrRecord,
  HrWorkInjury,
  HrWorkInjuryPayload,
} from './types';

export const listInjuries = (params?: HrRecord) =>
  request.get<HrPagedResult<HrWorkInjury>>('/hr/labor/work-injuries', { params });

export const listMyInjuries = (params?: HrRecord) =>
  request.get<HrPagedResult<HrWorkInjury>>('/hr/labor/work-injuries/mine', { params });

export const getInjury = (id: number) =>
  request.get<HrWorkInjury>(`/hr/labor/work-injuries/${id}`);

export const createInjury = (data: HrWorkInjuryPayload) =>
  request.post<number>('/hr/labor/work-injuries', data);

export const updateInjury = (id: number, data: Partial<HrWorkInjuryPayload>) =>
  request.put<void>(`/hr/labor/work-injuries/${id}`, data);

export const submitInjuryDetermination = (id: number) =>
  request.post<string>(`/hr/labor/work-injuries/${id}/submit-determination`);

export const closeInjury = (id: number, reason?: string) =>
  request.post<void>(`/hr/labor/work-injuries/${id}/close`, null, {
    params: { reason },
  });
