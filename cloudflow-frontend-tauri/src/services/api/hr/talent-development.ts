import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTalentDevelopmentAction,
  HrTalentDevelopmentActionPayload,
} from './types';

export const listDevelopmentActions = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTalentDevelopmentAction>>('/hr/talent/development', { params });

export const createDevelopmentAction = (data: HrTalentDevelopmentActionPayload) =>
  request.post<number>('/hr/talent/development', data);

export const updateDevelopmentAction = (
  id: number,
  data: Partial<HrTalentDevelopmentActionPayload>,
) => request.put<void>(`/hr/talent/development/${id}`, data);

export const deleteDevelopmentAction = (id: number) =>
  request.delete<void>(`/hr/talent/development/${id}`);

export const completeDevelopmentAction = (
  id: number,
  data: { evaluationScore?: number | string; evaluationNotes?: string },
) => request.post<void>(`/hr/talent/development/${id}/complete`, data);
