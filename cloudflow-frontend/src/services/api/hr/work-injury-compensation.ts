import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrWorkInjuryCompensation,
  HrWorkInjuryCompensationPayload,
} from './types';

export const listCompensations = (injuryId: number) =>
  request.get<HrPagedResult<HrWorkInjuryCompensation>>(
    `/hr/labor/work-injuries/${injuryId}/compensations`,
  );

export const createCompensation = (
  injuryId: number,
  data: HrWorkInjuryCompensationPayload,
) =>
  request.post<number>(
    `/hr/labor/work-injuries/${injuryId}/compensations`,
    data,
  );

export const updateCompensation = (
  injuryId: number,
  compensationId: number,
  data: Partial<HrWorkInjuryCompensationPayload>,
) =>
  request.put<void>(
    `/hr/labor/work-injuries/${injuryId}/compensations/${compensationId}`,
    data,
  );

export const payCompensation = (injuryId: number, compensationId: number) =>
  request.post<void>(
    `/hr/labor/work-injuries/${injuryId}/compensations/${compensationId}/pay`,
  );
