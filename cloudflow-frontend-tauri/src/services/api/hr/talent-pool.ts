import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrPageQuery,
  HrTalentPool,
  HrTalentPoolMember,
  HrTalentPoolPayload,
} from './types';

export const listTalentPools = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrTalentPool>>('/hr/talent/pools', { params });

export const createTalentPool = (data: HrTalentPoolPayload) =>
  request.post<number>('/hr/talent/pools', data);

export const updateTalentPool = (id: number, data: Partial<HrTalentPoolPayload>) =>
  request.put<void>(`/hr/talent/pools/${id}`, data);

export const deleteTalentPool = (id: number) =>
  request.delete<void>(`/hr/talent/pools/${id}`);

export const listPoolMembers = (poolId: number) =>
  request.get<HrTalentPoolMember[]>(`/hr/talent/pools/${poolId}/members`);

export const joinTalentPool = (poolId: number, employeeId: number, sourceReviewId?: number) =>
  request.post<void>(`/hr/talent/pools/${poolId}/members`, { employeeId, sourceReviewId });

export const exitTalentPool = (poolId: number, employeeId: number, reason?: string) =>
  request.delete<void>(`/hr/talent/pools/${poolId}/members/${employeeId}`, {
    params: reason ? { reason } : undefined,
  });
