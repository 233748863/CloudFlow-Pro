import request from '@/services/api/request';
import type { HrPagedResult, HrPageQuery, HrTrainingPlan, HrTrainingPlanPayload } from './types';

export const listTrainingPlans = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTrainingPlan>>('/hr/training/plans', { params });

export const getTrainingPlan = (id: number) =>
  request.get<HrTrainingPlan>(`/hr/training/plans/${id}`);

export const createTrainingPlan = (data: HrTrainingPlanPayload) =>
  request.post<number>('/hr/training/plans', data);

export const updateTrainingPlan = (id: number, data: Partial<HrTrainingPlanPayload>) =>
  request.put<void>(`/hr/training/plans/${id}`, data);

export const deleteTrainingPlan = (id: number) =>
  request.delete<void>(`/hr/training/plans/${id}`);

export const changeTrainingPlanStatus = (id: number, action: 'submit' | 'approve' | 'archive' | string) =>
  request.post<void>(`/hr/training/plans/${id}/${action}`, {});
