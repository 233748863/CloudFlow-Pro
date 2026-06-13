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
  /** OA-P0-2 关联的合同模板 ID */
  templateId?: number;
  createTime?: string;
  updateTime?: string;
}

export interface OaContractTemplate {
  id?: number;
  tenantId?: number;
  templateCode?: string;
  templateName: string;
  category?: string;
  content?: string;
  /** 变量定义 JSON 字符串 [{key,label,required}] */
  variables?: string;
  status?: string;
  remark?: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
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

// OA-P0-2 合同模板 API
export const contractTemplateApi = {
  page: (params: {
    pageNum?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    status?: string;
  }) => request.get('/oa/contract/template/page', { params }) as Promise<PageResult<OaContractTemplate>>,
  listActive: (category?: string) =>
    request.get('/oa/contract/template/active', { params: { category } }) as Promise<OaContractTemplate[]>,
  getInfo: (id: number) => request.get(`/oa/contract/template/${id}`) as Promise<OaContractTemplate>,
  add: (data: OaContractTemplate) => request.post('/oa/contract/template', data),
  edit: (data: OaContractTemplate) => request.put('/oa/contract/template', data),
  remove: (id: number) => request.delete(`/oa/contract/template/${id}`),
  render: (id: number, variables: Record<string, unknown>) =>
    request.post(`/oa/contract/template/${id}/render`, variables) as Promise<string>,
};

// OA-P1-1 合同履约里程碑 + 付款计划
export type ContractMilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'OVERDUE' | 'CANCELLED';
export type ContractMilestoneType = 'DELIVERY' | 'PAYMENT' | 'ACCEPTANCE' | 'OTHER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface OaContractMilestone {
  id?: number;
  tenantId?: number;
  contractId: number;
  milestoneNo?: number;
  milestoneName: string;
  milestoneType: ContractMilestoneType;
  plannedDate: string;
  actualDate?: string;
  amount?: number;
  status: ContractMilestoneStatus;
  ownerId?: number;
  ownerName?: string;
  completionRemark?: string;
  attachmentUrl?: string;
  createTime?: string;
  updateTime?: string;
}

export interface OaContractPaymentSchedule {
  id?: number;
  tenantId?: number;
  contractId: number;
  milestoneId?: number;
  paymentNo?: number;
  paymentName: string;
  planDate: string;
  actualDate?: string;
  amount: number;
  actualAmount?: number;
  currency?: string;
  payeeId?: number;
  payeeName?: string;
  status: PaymentStatus;
  invoiceId?: number;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export const contractMilestoneApi = {
  page: (params: { pageNum?: number; pageSize?: number; contractId?: number; status?: string }) =>
    request.get('/oa/contract/milestone/page', { params }) as Promise<PageResult<OaContractMilestone>>,
  listByContract: (contractId: number) =>
    request.get('/oa/contract/milestone/list', { params: { contractId } }) as Promise<OaContractMilestone[]>,
  add: (data: OaContractMilestone) => request.post('/oa/contract/milestone', data),
  edit: (data: OaContractMilestone) => request.put('/oa/contract/milestone', data),
  remove: (id: number) => request.delete(`/oa/contract/milestone/${id}`),
  complete: (id: number, remark?: string) =>
    request.post(`/oa/contract/milestone/${id}/complete`, undefined, { params: { remark } }),
};

export const contractPaymentApi = {
  page: (params: { pageNum?: number; pageSize?: number; contractId?: number; status?: string }) =>
    request.get('/oa/contract/payment/page', { params }) as Promise<PageResult<OaContractPaymentSchedule>>,
  listByContract: (contractId: number) =>
    request.get('/oa/contract/payment/list', { params: { contractId } }) as Promise<OaContractPaymentSchedule[]>,
  add: (data: OaContractPaymentSchedule) => request.post('/oa/contract/payment', data),
  edit: (data: OaContractPaymentSchedule) => request.put('/oa/contract/payment', data),
  remove: (id: number) => request.delete(`/oa/contract/payment/${id}`),
  pay: (id: number, actualAmount?: number, remark?: string) =>
    request.post(`/oa/contract/payment/${id}/pay`, undefined, {
      params: { actualAmount, remark },
    }),
};

export const riskApi = {
  list: (params: { pageNum?: number; pageSize?: number; businessType?: string; businessId?: number; riskName?: string; riskCode?: string; riskLevel?: string; riskStatus?: string; riskSource?: string }) =>
    request.get('/oa/risk/list', { params }) as Promise<PageResult<OaRiskAlert>>,
  stats: () => request.get('/oa/risk/stats') as Promise<RiskStats>,
  manual: (data: OaRiskAlert) => request.post('/oa/risk/manual', data),
  updateStatus: (id: number, data: { riskStatus: RiskStatus; handleRemark?: string }) => request.put(`/oa/risk/${id}/status`, data),
  assign: (id: number, data: { ownerId: number; ownerName?: string }) => request.put(`/oa/risk/${id}/assign`, data),
};

// OA-P0-3 合同金额阈值
export type ContractAmountTier = 'T1' | 'T2' | 'T3';
export type ContractApproverRole = 'DEPT_MGR' | 'VP' | 'CEO';

export interface OaContractAmountThreshold {
  id?: number;
  tenantId?: number;
  businessUnit?: string;
  thresholdMin: number;
  thresholdMax?: number;
  amountTier: ContractAmountTier;
  approverRole: ContractApproverRole;
  status?: 'ACTIVE' | 'INACTIVE';
  remark?: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export const contractThresholdApi = {
  page: (params: { pageNum?: number; pageSize?: number; keyword?: string; businessUnit?: string; amountTier?: string; status?: string }) =>
    request.get('/oa/contract/threshold/page', { params }) as Promise<PageResult<OaContractAmountThreshold>>,
  listActive: () => request.get('/oa/contract/threshold/active') as Promise<OaContractAmountThreshold[]>,
  getInfo: (id: number) => request.get(`/oa/contract/threshold/${id}`) as Promise<OaContractAmountThreshold>,
  add: (data: OaContractAmountThreshold) => request.post('/oa/contract/threshold', data),
  edit: (data: OaContractAmountThreshold) => request.put('/oa/contract/threshold', data),
  remove: (id: number) => request.delete(`/oa/contract/threshold/${id}`),
};
