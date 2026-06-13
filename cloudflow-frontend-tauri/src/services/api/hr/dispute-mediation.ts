import request from '@/services/api/request';
import type {
  HrDisputeMediation,
  HrDisputeMediationPayload,
  HrPagedResult,
} from './types';

export const listMediations = (disputeId: number) =>
  request.get<HrPagedResult<HrDisputeMediation>>(
    `/hr/labor/disputes/${disputeId}/mediations`,
  );

export const createMediation = (
  disputeId: number,
  data: HrDisputeMediationPayload,
) =>
  request.post<number>(`/hr/labor/disputes/${disputeId}/mediations`, data);

export const updateMediation = (
  disputeId: number,
  mediationId: number,
  data: Partial<HrDisputeMediationPayload>,
) =>
  request.put<void>(
    `/hr/labor/disputes/${disputeId}/mediations/${mediationId}`,
    data,
  );
