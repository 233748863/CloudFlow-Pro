import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTalentSuccessionPlan,
  HrTalentSuccessionPlanPayload,
} from './types';

export const listSuccessionPlans = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTalentSuccessionPlan>>('/hr/talent/succession-plans', { params });

export const getSuccessionPlan = (id: number) =>
  request.get<HrTalentSuccessionPlan>(`/hr/talent/succession-plans/${id}`);

export const createSuccessionPlan = (data: HrTalentSuccessionPlanPayload) =>
  request.post<number>('/hr/talent/succession-plans', data);

export const updateSuccessionPlan = (
  id: number,
  data: Partial<HrTalentSuccessionPlanPayload>,
) => request.put<void>(`/hr/talent/succession-plans/${id}`, data);

export const deleteSuccessionPlan = (id: number) =>
  request.delete<void>(`/hr/talent/succession-plans/${id}`);

export const addSuccessor = (
  planId: number,
  data: { employeeId: number; readiness?: string; rankOrder?: number; talentReviewParticipantId?: number; developmentGap?: string; retentionAction?: string },
) => request.post<number>(`/hr/talent/succession-plans/${planId}/successors`, data);

export const removeSuccessor = (successorId: number) =>
  request.delete<void>(`/hr/talent/succession-plans/successors/${successorId}`);

export const publishSuccessionPlan = (id: number) =>
  request.post<string>(`/hr/talent/succession-plans/${id}/publish`, {});
