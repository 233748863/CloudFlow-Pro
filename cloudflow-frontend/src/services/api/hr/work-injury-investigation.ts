import request from '@/services/api/request';
import type {
  HrPagedResult,
  HrWorkInjuryInvestigation,
  HrWorkInjuryInvestigationPayload,
} from './types';

export const listInvestigations = (injuryId: number) =>
  request.get<HrPagedResult<HrWorkInjuryInvestigation>>(
    `/hr/labor/work-injuries/${injuryId}/investigations`,
  );

export const createInvestigation = (
  injuryId: number,
  data: HrWorkInjuryInvestigationPayload,
) =>
  request.post<number>(
    `/hr/labor/work-injuries/${injuryId}/investigations`,
    data,
  );

export const updateInvestigation = (
  injuryId: number,
  investigationId: number,
  data: Partial<HrWorkInjuryInvestigationPayload>,
) =>
  request.put<void>(
    `/hr/labor/work-injuries/${injuryId}/investigations/${investigationId}`,
    data,
  );
