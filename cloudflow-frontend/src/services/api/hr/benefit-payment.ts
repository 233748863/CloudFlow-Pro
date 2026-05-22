import request from '@/services/api/request';
import type { HrBenefitPayment, HrPagedResult, HrPageQuery } from './types';

export const listBenefitPayments = (params?: HrPageQuery) =>
  request.get<HrPagedResult<HrBenefitPayment>>('/hr/ess/benefit-payments', { params });

export const generateBenefitPayments = (periodMonth: string) =>
  request.post<number>('/hr/ess/benefit-payments/generate', { periodMonth });
