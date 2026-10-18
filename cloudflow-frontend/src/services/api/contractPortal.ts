import request from './request';
import type { PortalContractTerm, PortalContractMilestone, PortalContractPayment } from '@/services/portalContractTypes';

export interface ContractPortalSelection { termIds: string[]; milestoneIds: string[]; paymentScheduleIds: string[] }
export interface ContractPortalPublication extends ContractPortalSelection {
  contractId: string;
  contractNo: string;
  version: number;
  contractReady: boolean;
  terms: PortalContractTerm[];
  milestones: PortalContractMilestone[];
  paymentSchedules: PortalContractPayment[];
}

export const contractPortalApi = {
  read: (id: number, signal?: AbortSignal) => request.get(`/oa/contract/${id}/portal-publication`, { signal }) as Promise<ContractPortalPublication>,
  save: (id: number, data: ContractPortalSelection & { version: number }) =>
    request.put(`/oa/contract/${id}/portal-publication`, data) as Promise<ContractPortalPublication>,
};
