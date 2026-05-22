import request from '@/services/api/request';
import type { HrPagedResult, HrPageQuery, HrTrainingEnrollment } from './types';

export const listTrainingEnrollments = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingEnrollment>>('/hr/training/enrollments', { params });

export const listMyTrainingEnrollments = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingEnrollment>>('/hr/training/enrollments/mine', { params });

export const enrollTraining = (data: { sessionId: number; enrollType?: string; comment?: string }) =>
  request.post<number>('/hr/training/enrollments', data);

export const checkInTraining = (id: number) =>
  request.post<void>(`/hr/training/enrollments/${id}/check-in`, {});

export const completeTraining = (
  id: number,
  data: { completionStatus?: string; score?: number | string; comment?: string },
) => request.post<void>(`/hr/training/enrollments/${id}/complete`, data);

export const cancelTrainingEnrollment = (id: number) =>
  request.post<void>(`/hr/training/enrollments/${id}/cancel`, {});
