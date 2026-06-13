import request from '@/services/api/request';
import type {
  HrContractSignature,
  HrContractSignaturePayload,
  HrPagedResult,
  HrPageQuery,
  HrRecord,
} from './types';

export const listMyContracts = (params?: HrPageQuery) =>
  request.get<HrRecord[]>('/hr/ess/contracts/mine', { params });

export const listMySignatures = (params?: HrPageQuery) =>
  request.get<HrContractSignature[] | HrPagedResult<HrContractSignature>>(
    '/hr/ess/contracts/signatures',
    { params },
  );

export const requestContractSign = (contractId: number, data?: HrContractSignaturePayload) =>
  request.post<number>(`/hr/ess/contracts/${contractId}/sign-request`, data ?? {});

export const cancelContractSign = (id: number) =>
  request.post<void>(`/hr/ess/contracts/signatures/${id}/cancel`, {});
