import request from '@/services/api/request';
import type { HrFamilyMember, HrFamilyMemberPayload, HrPagedResult, HrPageQuery } from './types';

export const listFamilyMembers = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrFamilyMember>>('/hr/ess/family-members', { params });

export const createFamilyMember = (data: HrFamilyMemberPayload) =>
  request.post<number>('/hr/ess/family-members', data);

export const updateFamilyMember = (id: number, data: Partial<HrFamilyMemberPayload>) =>
  request.put<void>(`/hr/ess/family-members/${id}`, data);

export const deleteFamilyMember = (id: number) =>
  request.delete<void>(`/hr/ess/family-members/${id}`);
