import request from './request';
import { PageResult } from '@/types';

export interface CrmCustomer {
  customerId?: number;
  customerCode?: string;
  customerName: string;
  customerType?: string;
  industry?: string;
  levelCode?: string;
  source?: string;
  customerTags?: string;
  ownerId?: number;
  ownerName?: string;
  deptId?: number;
  deptName?: string;
  phone?: string;
  email?: string;
  website?: string;
  province?: string;
  city?: string;
  address?: string;
  creditCode?: string;
  healthLevel?: string;
  healthReason?: string;
  lastFollowUpTime?: string;
  nextFollowUpTime?: string;
  remark?: string;
  status?: string;
}

export interface CrmOpportunity {
  opportunityId?: number;
  customerId: number;
  customerName?: string;
  opportunityName: string;
  stage?: string;
  source?: string;
  expectedAmount?: number;
  winRate?: number;
  expectedSignDate?: string;
  ownerId?: number;
  ownerName?: string;
  deptId?: number;
  deptName?: string;
  contactId?: number;
  contactName?: string;
  latestFollowUpTime?: string;
  stageChangedTime?: string;
  lostReason?: string;
  remark?: string;
  status?: string;
}

export interface CrmQuote {
  quoteId?: number;
  instanceId?: string;
  quoteNo?: string;
  customerId: number;
  customerName?: string;
  opportunityId?: number;
  opportunityName?: string;
  quoteName: string;
  totalAmount: number;
  taxAmount?: number;
  currency?: string;
  validUntil?: string;
  ownerId?: number;
  ownerName?: string;
  contractId?: number;
  contractNo?: string;
  attachmentUrl?: string;
  remark?: string;
  status?: string;
}

export interface CrmReceivable {
  receivableId?: number;
  receivableNo?: string;
  customerId: number;
  customerName?: string;
  contractId?: number;
  contractNo?: string;
  receivableName: string;
  plannedAmount: number;
  receivedAmount?: number;
  outstandingAmount?: number;
  dueDate?: string;
  receivedDate?: string;
  invoiceStatus?: string;
  ownerId?: number;
  ownerName?: string;
  remark?: string;
  status?: string;
}

export interface CrmRenewal {
  renewalId?: number;
  instanceId?: string;
  renewalNo?: string;
  customerId: number;
  customerName?: string;
  contractId?: number;
  contractNo?: string;
  renewalName: string;
  renewalAmount?: number;
  expectedSignDate?: string;
  currentExpireDate?: string;
  nextExpireDate?: string;
  ownerId?: number;
  ownerName?: string;
  summary?: string;
  remark?: string;
  riskLevel?: string;
  riskReason?: string;
  status?: string;
}

export interface CrmTicket {
  ticketId?: number;
  ticketNo?: string;
  customerId: number;
  customerName?: string;
  ticketTitle: string;
  severity?: string;
  issueType?: string;
  ownerId?: number;
  ownerName?: string;
  openedTime?: string;
  resolvedTime?: string;
  dueTime?: string;
  description?: string;
  solution?: string;
  attachmentUrl?: string;
  status?: string;
}

export interface CrmContact {
  contactId?: number;
  customerId: number;
  contactName: string;
  gender?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  position?: string;
  department?: string;
  primaryFlag?: number;
  wechat?: string;
  qq?: string;
  birthday?: string;
  remark?: string;
  status?: string;
}

export interface CrmFollowUp {
  followUpId?: number;
  customerId: number;
  opportunityId?: number;
  followUpType?: string;
  followUpTime?: string;
  nextFollowUpTime?: string;
  content: string;
  resultSummary?: string;
  attachmentUrl?: string;
  ownerId?: number;
  ownerName?: string;
}

export interface CrmHealthReasonItem {
  type?: string;
  code?: string;
  name?: string;
  level?: string;
  linkTarget?: string;
}

export interface CrmReceivableAgingBucket {
  bucketCode?: string;
  bucketName?: string;
  customerCount?: number;
  receivableCount?: number;
  outstandingAmount?: number;
}

export interface CrmOpportunityBoardCard {
  opportunityId?: number;
  customerId?: number;
  customerName?: string;
  opportunityName?: string;
  expectedAmount?: number;
  winRate?: number;
  stageStayDays?: number;
  ownerName?: string;
  expectedSignDate?: string;
}

export interface CrmOpportunityBoardColumn {
  stage?: string;
  stageLabel?: string;
  count?: number;
  totalAmount?: number;
  items: CrmOpportunityBoardCard[];
}

export interface CrmRemoteProjectLink {
  projectId?: number;
  projectNo?: string;
  projectName?: string;
  status?: string;
  riskLevel?: string;
  budgetAmount?: number;
  actualCostAmount?: number;
  sourceType?: string;
  sourceId?: number;
  sourceName?: string;
}

export interface CrmRemoteContractLink {
  contractId?: number;
  contractNo?: string;
  contractName?: string;
  status?: string;
  riskLevel?: string;
  amount?: number;
  invoiceStatus?: string;
  projectId?: number;
  projectName?: string;
}

export interface CrmRemoteInvoiceLink {
  invoiceId?: number;
  invoiceDirection?: string;
  invoiceCode?: string;
  invoiceNo?: string;
  invoiceType?: string;
  grossAmount?: number;
  status?: string;
  receivableId?: number;
  contractId?: number;
  contractNo?: string;
  externalLinkUrl?: string;
}

export interface CrmRemoteBudgetLink {
  budgetId?: number;
  budgetNo?: string;
  budgetName?: string;
  projectId?: number;
  projectName?: string;
  totalAmount?: number;
  reservedAmount?: number;
  actualAmount?: number;
  availableAmount?: number;
  status?: string;
  thresholdStatus?: string;
}

export interface CrmWorkspaceTodoItem {
  id?: string;
  module?: string;
  sourceLabel?: string;
  title?: string;
  description?: string;
  status?: string;
  path?: string;
  businessId?: number;
  businessType?: string;
}

export interface CrmWorkspaceRiskItem {
  id?: string;
  module?: string;
  sourceLabel?: string;
  title?: string;
  description?: string;
  level?: string;
  status?: string;
  path?: string;
  businessId?: number;
  businessType?: string;
}

export interface CrmLinkSummary {
  contractCount?: number;
  invoiceCount?: number;
  budgetCount?: number;
  projectCount?: number;
  openTodoCount?: number;
  openRiskCount?: number;
}

export interface CrmCustomerWorkspace {
  customer: CrmCustomer;
  healthReasons: CrmHealthReasonItem[];
  contacts: CrmContact[];
  followUps: CrmFollowUp[];
  opportunities: CrmOpportunity[];
  quotes: CrmQuote[];
  receivables: CrmReceivable[];
  renewals: CrmRenewal[];
  tickets: CrmTicket[];
  contracts: CrmRemoteContractLink[];
  invoices: CrmRemoteInvoiceLink[];
  budgets: CrmRemoteBudgetLink[];
  projects: CrmRemoteProjectLink[];
  crossModuleTodos: CrmWorkspaceTodoItem[];
  crossModuleRisks: CrmWorkspaceRiskItem[];
  linkSummary?: CrmLinkSummary;
}

export interface CrmDashboardSummary {
  funnel: CrmOpportunityBoardColumn[];
  pendingQuotes: CrmQuote[];
  agingBuckets: CrmReceivableAgingBucket[];
  renewalWindows: CrmRenewal[];
  highSeverityTickets: CrmTicket[];
  staleFollowCustomers: CrmCustomer[];
  stalledOpportunities: CrmOpportunity[];
  crossModuleTodos: CrmWorkspaceTodoItem[];
  crossModuleRisks: CrmWorkspaceRiskItem[];
  budgetAlerts: CrmRemoteBudgetLink[];
  invoiceExceptions: CrmRemoteInvoiceLink[];
}

export const crmApi = {
  listCustomers: (params: {
    pageNum?: number;
    pageSize?: number;
    customerName?: string;
    customerCode?: string;
    customerTags?: string;
    healthLevel?: string;
    status?: string;
  }) => request.get('/crm/customer/list', { params }) as Promise<PageResult<CrmCustomer>>,

  addCustomer: (data: CrmCustomer) => request.post('/crm/customer', data),

  editCustomer: (data: CrmCustomer) => request.put('/crm/customer', data),

  getCustomerWorkspace: (id: number) => request.get(`/crm/customer/${id}/workspace`) as Promise<CrmCustomerWorkspace>,

  getDashboardSummary: () => request.get('/crm/dashboard/summary') as Promise<CrmDashboardSummary>,

  getDashboardWorkplace: () => request.get('/crm/dashboard/workplace') as Promise<CrmDashboardSummary>,

  createWorkspaceContractDraft: (customerId: number, data: {
    contractName?: string;
    counterpartyName?: string;
    contractType?: string;
    amount?: number;
    currency?: string;
    ownerId?: number;
    ownerName?: string;
    deptId?: number;
    deptName?: string;
    remark?: string;
  }) => request.post(`/crm/customer/${customerId}/workspace/contract-draft`, data) as Promise<number>,

  createWorkspaceProjectDraft: (customerId: number, data: {
    projectName?: string;
    projectType?: string;
    contractId?: number;
    contractNo?: string;
    ownerId?: number;
    ownerName?: string;
    deptId?: number;
    deptName?: string;
    startDate?: string;
    endDate?: string;
    budgetAmount?: number;
    priority?: string;
    status?: string;
    riskLevel?: string;
    sourceType?: string;
    sourceId?: number;
    sourceName?: string;
    remark?: string;
  }) => request.post(`/crm/customer/${customerId}/workspace/project-draft`, data) as Promise<number>,

  createWorkspaceBudgetDraft: (customerId: number, data: {
    budgetName?: string;
    fiscalYear?: number;
    periodType?: string;
    targetType?: string;
    targetId?: number;
    targetName?: string;
    deptId?: number;
    deptName?: string;
    projectId?: number;
    projectName?: string;
    ownerId?: number;
    ownerName?: string;
    totalAmount?: number;
    remark?: string;
    lines: Array<{ subjectCode: string; subjectName: string; amount?: number }>;
  }) => request.post(`/crm/customer/${customerId}/workspace/budget-draft`, data),

  createWorkspaceInvoiceDraft: (customerId: number, data: {
    invoiceDirection?: string;
    thirdPartySystem?: string;
    externalBillNo?: string;
    externalLinkUrl?: string;
    invoiceCode: string;
    invoiceNo: string;
    invoiceType?: string;
    invoiceDate?: string;
    grossAmount?: number;
    taxAmount?: number;
    sellerName?: string;
    buyerName?: string;
    imageUrl?: string;
    contractId?: number;
    contractNo?: string;
    receivableId?: number;
    remark?: string;
  }) => request.post(`/crm/customer/${customerId}/workspace/invoice-draft`, data),

  bindWorkspaceInvoice: (customerId: number, invoiceId: number, data: {
    receivableId?: number;
    customerId?: number;
    customerName?: string;
    contractId?: number;
    contractNo?: string;
  }) => request.put(`/crm/customer/${customerId}/workspace/invoice/${invoiceId}/bind`, data),

  voidWorkspaceInvoice: (customerId: number, invoiceId: number, remark?: string) =>
    request.post(`/crm/customer/${customerId}/workspace/invoice/${invoiceId}/void`, { remark }),

  confirmWorkspaceReceivable: (customerId: number, receivableId: number) =>
    request.post(`/crm/customer/${customerId}/workspace/receivable/${receivableId}/confirm`),

  removeCustomer: (ids: number[]) => request.delete(`/crm/customer/${ids.join(',')}`),

  listContacts: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    contactName?: string;
    status?: string;
  }) => request.get('/crm/contact/list', { params }) as Promise<PageResult<CrmContact>>,

  addContact: (data: CrmContact) => request.post('/crm/contact', data),

  editContact: (data: CrmContact) => request.put('/crm/contact', data),

  removeContact: (ids: number[]) => request.delete(`/crm/contact/${ids.join(',')}`),

  listFollowUps: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    opportunityId?: number;
    ownerId?: number;
  }) => request.get('/crm/follow-up/list', { params }) as Promise<PageResult<CrmFollowUp>>,

  addFollowUp: (data: CrmFollowUp) => request.post('/crm/follow-up', data),

  editFollowUp: (data: CrmFollowUp) => request.put('/crm/follow-up', data),

  removeFollowUp: (ids: number[]) => request.delete(`/crm/follow-up/${ids.join(',')}`),

  listOpportunities: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    opportunityName?: string;
    stage?: string;
    ownerId?: number;
  }) => request.get('/crm/opportunity/list', { params }) as Promise<PageResult<CrmOpportunity>>,

  addOpportunity: (data: CrmOpportunity) => request.post('/crm/opportunity', data),

  editOpportunity: (data: CrmOpportunity) => request.put('/crm/opportunity', data),

  winOpportunity: (id: number) => request.post(`/crm/opportunity/${id}/win`),

  loseOpportunity: (id: number, lostReason?: string) => request.post(`/crm/opportunity/${id}/lose`, { lostReason }),

  getOpportunityBoard: () => request.get('/crm/opportunity/board') as Promise<CrmOpportunityBoardColumn[]>,

  updateOpportunityStage: (data: { opportunityId?: number; stage?: string; lostReason?: string }) => request.put('/crm/opportunity/stage', data),

  createProjectDraft: (id: number) => request.post(`/crm/opportunity/${id}/project-draft`) as Promise<number>,

  removeOpportunity: (ids: number[]) => request.delete(`/crm/opportunity/${ids.join(',')}`),

  listQuotes: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    opportunityId?: number;
    quoteName?: string;
    status?: string;
  }) => request.get('/crm/quote/list', { params }) as Promise<PageResult<CrmQuote>>,

  addQuote: (data: CrmQuote) => request.post('/crm/quote', data),

  editQuote: (data: CrmQuote) => request.put('/crm/quote', data),

  submitQuote: (id: number) => request.post(`/crm/quote/submit/${id}`),

  sendQuote: (id: number) => request.post(`/crm/quote/${id}/send`),

  acceptQuote: (id: number) => request.post(`/crm/quote/${id}/accept`),

  expireQuote: (id: number) => request.post(`/crm/quote/${id}/expire`),

  createContractDraft: (id: number) => request.post(`/crm/quote/${id}/contract-draft`) as Promise<number>,

  removeQuote: (ids: number[]) => request.delete(`/crm/quote/${ids.join(',')}`),

  listReceivables: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    contractId?: number;
    receivableName?: string;
    status?: string;
  }) => request.get('/crm/receivable/list', { params }) as Promise<PageResult<CrmReceivable>>,

  addReceivable: (data: CrmReceivable) => request.post('/crm/receivable', data),

  editReceivable: (data: CrmReceivable) => request.put('/crm/receivable', data),

  confirmReceivable: (id: number) => request.post(`/crm/receivable/${id}/confirm`),

  bindReceivableInvoice: (id: number, invoiceId: number) => request.post(`/crm/receivable/${id}/bind-invoice/${invoiceId}`),

  getReceivableAging: () => request.get('/crm/receivable/aging') as Promise<CrmReceivableAgingBucket[]>,

  removeReceivable: (ids: number[]) => request.delete(`/crm/receivable/${ids.join(',')}`),

  listRenewals: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    contractId?: number;
    renewalName?: string;
    status?: string;
  }) => request.get('/crm/renewal/list', { params }) as Promise<PageResult<CrmRenewal>>,

  addRenewal: (data: CrmRenewal) => request.post('/crm/renewal', data),

  editRenewal: (data: CrmRenewal) => request.put('/crm/renewal', data),

  submitRenewal: (id: number) => request.post(`/crm/renewal/submit/${id}`),

  removeRenewal: (ids: number[]) => request.delete(`/crm/renewal/${ids.join(',')}`),

  listTickets: (params: {
    pageNum?: number;
    pageSize?: number;
    customerId?: number;
    ticketTitle?: string;
    severity?: string;
    status?: string;
  }) => request.get('/crm/ticket/list', { params }) as Promise<PageResult<CrmTicket>>,

  addTicket: (data: CrmTicket) => request.post('/crm/ticket', data),

  editTicket: (data: CrmTicket) => request.put('/crm/ticket', data),

  resolveTicket: (id: number, solution?: string) => request.post(`/crm/ticket/${id}/resolve`, { solution }),

  closeTicket: (id: number) => request.post(`/crm/ticket/${id}/close`),

  removeTicket: (ids: number[]) => request.delete(`/crm/ticket/${ids.join(',')}`),
};
