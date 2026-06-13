import request from '@/services/api/request';
import type { HrPagedResult, HrPageQuery, HrSalarySlip } from './types';

export const listSalarySlips = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrSalarySlip>>('/hr/ess/salary-slips', { params });

export const getSalarySlip = (id: number) =>
  request.get<HrSalarySlip>(`/hr/ess/salary-slips/${id}`);

export const generateSalarySlips = (periodMonth: string) =>
  request.post<number>('/hr/ess/salary-slips/generate', { periodMonth });

export const confirmSalarySlip = (id: number) =>
  request.post<void>(`/hr/ess/salary-slips/${id}/confirm`, {});
