import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTrainingSession,
  HrTrainingSessionPayload,
} from './types';

export const listTrainingSessions = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingSession>>('/hr/training/sessions', { params });

export const getTrainingSession = (id: number) =>
  request.get<HrTrainingSession>(`/hr/training/sessions/${id}`);

export const createTrainingSession = (data: HrTrainingSessionPayload) =>
  request.post<number>('/hr/training/sessions', data);

export const updateTrainingSession = (id: number, data: Partial<HrTrainingSessionPayload>) =>
  request.put<void>(`/hr/training/sessions/${id}`, data);

export const deleteTrainingSession = (id: number) =>
  request.delete<void>(`/hr/training/sessions/${id}`);

export const changeTrainingSessionStatus = (
  id: number,
  action: 'register' | 'start' | 'complete' | 'cancel' | 'reopen' | string,
) => request.post<{ status: string }>(`/hr/training/sessions/${id}/${action}`, {});
