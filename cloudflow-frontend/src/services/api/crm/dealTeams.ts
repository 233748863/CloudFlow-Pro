import request from '../request';
import type { Decimal } from './operations';

export type DealRole = 'OWNER' | 'CO_SELLER' | 'PRE_SALES' | 'SUPPORT' | 'MANAGER';
export type DealBusiness = 'OPPORTUNITY' | 'QUOTE' | 'CONTRACT' | 'RECEIVABLE';
export interface DealTeamMember {
  salesUserId: number;
  salesUserName: string;
  deptId: number;
  roleType: DealRole;
  allocatedPercentage: Decimal;
  allocatedAmount: Decimal;
  commissionRate?: Decimal;
  commissionAmount?: Decimal;
  remark?: string;
  createTime?: string;
}
export interface DealTeam {
  bizType: DealBusiness;
  bizId: number;
  businessVersion: number;
  teamVersion: number;
  currentTeamVersion: number;
  ownerId: number;
  amount: Decimal;
  currency: string;
  historical: boolean;
  members: DealTeamMember[];
  versions: number[];
}
export interface DealTeamInput {
  teamVersion: number;
  businessVersion: number;
  remark?: string;
  members: { salesUserId: number; roleType: DealRole; allocatedPercentage: string }[];
}
export const dealTeams = {
  read: (type: DealBusiness, id: number, teamVersion?: number) => request.get<DealTeam>(`/crm/deal-team/${type}/${id}`, { params: { teamVersion } }),
  save: (type: DealBusiness, id: number, input: DealTeamInput) => request.put<DealTeam>(`/crm/deal-team/${type}/${id}`, input),
};
