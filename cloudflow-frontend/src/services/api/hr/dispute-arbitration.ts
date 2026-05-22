import request from '@/services/api/request';
import type {
  HrDisputeArbitration,
  HrDisputeArbitrationPayload,
  HrPagedResult,
} from './types';

export const listArbitrations = (disputeId: number) =>
  request.get<HrPagedResult<HrDisputeArbitration>>(
    `/hr/labor/disputes/${disputeId}/arbitrations`,
  );

export const createArbitration = (
  disputeId: number,
  data: HrDisputeArbitrationPayload,
) =>
  request.post<number>(`/hr/labor/disputes/${disputeId}/arbitrations`, data);

export const updateArbitration = (
  disputeId: number,
  arbitrationId: number,
  data: Partial<HrDisputeArbitrationPayload>,
) =>
  request.put<void>(
    `/hr/labor/disputes/${disputeId}/arbitrations/${arbitrationId}`,
    data,
  );
