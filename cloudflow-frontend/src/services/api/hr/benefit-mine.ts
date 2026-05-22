import request from '@/services/api/request';
import type { HrBenefitMineSummary } from './types';

export const getMyBenefitSummary = () =>
  request.get<HrBenefitMineSummary>('/hr/benefit/mine');
