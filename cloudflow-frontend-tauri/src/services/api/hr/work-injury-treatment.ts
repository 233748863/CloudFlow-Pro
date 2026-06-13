import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrWorkInjuryTreatment,
  HrWorkInjuryTreatmentPayload,
} from './types';

export const listTreatments = (injuryId: number) =>
  request.get<HrPagedResult<HrWorkInjuryTreatment>>(
    `/hr/labor/work-injuries/${injuryId}/treatments`,
  );

export const createTreatment = (
  injuryId: number,
  data: HrWorkInjuryTreatmentPayload,
) =>
  request.post<number>(
    `/hr/labor/work-injuries/${injuryId}/treatments`,
    data,
  );

export const updateTreatment = (
  injuryId: number,
  treatmentId: number,
  data: Partial<HrWorkInjuryTreatmentPayload>,
) =>
  request.put<void>(
    `/hr/labor/work-injuries/${injuryId}/treatments/${treatmentId}`,
    data,
  );
