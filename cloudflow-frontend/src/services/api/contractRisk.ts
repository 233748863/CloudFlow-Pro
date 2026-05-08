import request from './request';
import { PageResult } from '@/types';

export type ContractStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SEALING'
  | 'SEALED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'TERMINATED'
  | 'CANCELLED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskStatus = 'OPEN' | 'HANDLING' | 'CLOSED' | 'IGNORED';
export type RiskSource = 'RULE' | 'MANUAL';

export interface OaContract {
  contractId?: number;
  contractNo?: string;
  contractName: string;
  counterpartyName: string;
  contractType: string;
  amount: number;
  currency?: string;
  ownerId?: number;
  ownerName?: string;
  deptId?: number;
  deptName?: string;
  projectId?: number;
  projectName?: string;
  customerId?: number;
  customerName?: string;
  budgetSubjectCode?: string;
  budgetSubjectName?: string;
  invoiceStatus?: string;
  startDate?: string;
  endDate?: string;
  attachmentUrl?: string;
  archiveAttachmentUrl?: string;
  instanceId?: string;
  sealApplicationId?: number;
  status?: ContractStatus;
  riskLevel?: RiskLevel;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface OaTraceEvent {
  id: number;
  businessType: string;
  businessId: number;
  relatedType?: string;
  relatedId?: number;
  eventType: string;
  eventTitle: string;
  eventContent?: string;
  operatorId?: number;
  operatorName?: string;
  eventTime?: string;
  snapshotJson?: string;
}

export interface OaRiskAlert {
  id?: number;
  businessType?: string;
  businessId: number;
  riskCode?: string;
  riskName: string;
  riskLevel?: RiskLevel;
  riskStatus?: RiskStatus;
  riskSource?: RiskSource;
  ownerId?: number;
  ownerName?: string;
  detectedTime?: string;
  handledTime?: string;
  handlerId?: number;
  handlerName?: string;
  handleRemark?: string;
}

export interface RiskStats {
  openCount: number;
  handlingCount: number;
  closedCount: number;
  ignoredCount: number;
  highRiskCount: number;
  manualCount: number;
  ruleCount: number;
  contractUnsealedCount: number;
  overdueReturnCount: number;
  unarchivedCount: number;
}

export const contractApi = {
  list: (params: { pageNum?: number; pageSize?: number; contractNo?: string; contractName?: string; counterpartyName?: string; contractType?: string; status?: string; riskLevel?: string }) =>
    request.get('/oa/contract/list', { params }) as Promise<PageResult<OaContract>>,
  getInfo: (id: number) => request.get(`/oa/contract/${id}`) as Promise<OaContract>,
  add: (data: OaContract) => request.post('/oa/contract', data),
  edit: (data: OaContract) => request.put('/oa/contract', data),
  remove: (ids: number[]) => request.delete(`/oa/contract/${ids.join(',')}`),
  submit: (id: number) => request.post(`/oa/contract/submit/${id}`),
  cancel: (id: number) => request.put(`/oa/contract/cancel/${id}`),
  linkSeal: (id: number, sealApplicationId: number) => request.put(`/oa/contract/${id}/link-seal/${sealApplicationId}`),
  timeline: (id: number) => request.get(`/oa/contract/${id}/timeline`) as Promise<OaTraceEvent[]>,
  risks: (id: number) => request.get(`/oa/contract/${id}/risks`) as Promise<OaRiskAlert[]>,
};

export const riskApi = {
  list: (params: { pageNum?: number; pageSize?: number; businessType?: string; businessId?: number; riskName?: string; riskCode?: string; riskLevel?: string; riskStatus?: string; riskSource?: string }) =>
    request.get('/oa/risk/list', { params }) as Promise<PageResult<OaRiskAlert>>,
  stats: () => request.get('/oa/risk/stats') as Promise<RiskStats>,
  manual: (data: OaRiskAlert) => request.post('/oa/risk/manual', data),
  updateStatus: (id: number, data: { riskStatus: RiskStatus; handleRemark?: string }) => request.put(`/oa/risk/${id}/status`, data),
  assign: (id: number, data: { ownerId: number; ownerName?: string }) => request.put(`/oa/risk/${id}/assign`, data),
};
