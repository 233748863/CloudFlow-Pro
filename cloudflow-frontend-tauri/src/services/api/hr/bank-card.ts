import request from '@/services/api/request';
import type { HrBankCard, HrBankCardPayload, HrPagedResult, HrPageQuery } from './types';

export const listBankCards = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrBankCard>>('/hr/ess/bank-cards', { params });

export const createBankCard = (data: HrBankCardPayload) =>
  request.post<number>('/hr/ess/bank-cards', data);

export const updateBankCard = (id: number, data: Partial<HrBankCardPayload>) =>
  request.put<void>(`/hr/ess/bank-cards/${id}`, data);

export const deleteBankCard = (id: number) =>
  request.delete<void>(`/hr/ess/bank-cards/${id}`);
