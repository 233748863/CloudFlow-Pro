import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrWorkInjuryRehabilitation,
  HrWorkInjuryRehabilitationPayload,
} from './types';

export const listRehabilitation = (injuryId: number) =>
  request.get<HrPagedResult<HrWorkInjuryRehabilitation>>(
    `/hr/labor/work-injuries/${injuryId}/rehabilitation`,
  );

export const createRehabilitation = (
  injuryId: number,
  data: HrWorkInjuryRehabilitationPayload,
) =>
  request.post<number>(
    `/hr/labor/work-injuries/${injuryId}/rehabilitation`,
    data,
  );

export const updateRehabilitation = (
  injuryId: number,
  rehabilitationId: number,
  data: Partial<HrWorkInjuryRehabilitationPayload>,
) =>
  request.put<void>(
    `/hr/labor/work-injuries/${injuryId}/rehabilitation/${rehabilitationId}`,
    data,
  );
