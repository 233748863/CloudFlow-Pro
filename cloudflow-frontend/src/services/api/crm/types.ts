// ============================================================================
// CRM 模块所有业务类型
// ============================================================================

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
  poolFlag?: string;
  pooledTime?: string;
  originalOwnerId?: number;
  originalOwnerName?: string;
  remark?: string;
  status?: string;
}

export interface CrmLead {
  leadId?: number;
  leadNo?: string;
  leadName: string;
  companyName?: string;
  contactName?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  source?: string;
  industry?: string;
  status?: string;
  ownerId?: number;
  ownerName?: string;
  deptId?: number;
  deptName?: string;
  nextFollowUpTime?: string;
  lastFollowUpTime?: string;
  convertedCustomerId?: number;
  convertedTime?: string;
  remark?: string;
}

export interface CrmLeadConvertRequest {
  leadId: number;
  customerName?: string;
  customerType?: string;
  industry?: string;
  source?: string;
  customerTags?: string;
  ownerId?: number;
  ownerName?: string;
  phone?: string;
  email?: string;
  website?: string;
  province?: string;
  city?: string;
  address?: string;
  creditCode?: string;
  remark?: string;
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
  quoteLines?: CrmQuoteLine[];
}

export interface CrmProduct {
  productId?: number;
  productNo?: string;
  productName: string;
  category?: string;
  spec?: string;
  unit?: string;
  standardPrice?: number;
  currency?: string;
  status?: string;
  ownerId?: number;
  ownerName?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CrmPriceBook {
  priceBookId?: number;
  priceBookNo?: string;
  priceBookName: string;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  ownerId?: number;
  ownerName?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CrmSalesTarget {
  salesTargetId?: number;
  targetNo?: string;
  targetName: string;
  dimensionType: 'OWNER' | 'DEPT' | string;
  periodType: 'MONTH' | 'QUARTER' | 'YEAR' | string;
  targetYear: number;
  targetPeriod?: number;
  deptId?: number;
  deptName?: string;
  ownerId?: number;
  ownerName?: string;
  targetAmount: number;
  achievedAmount?: number;
  completionRate?: number;
  gapAmount?: number;
  periodLabel?: string;
  status?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CrmQuoteLine {
  quoteLineId?: number;
  sortNo?: number;
  productId?: number;
  productNo?: string;
  productName?: string;
  category?: string;
  spec?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  discountRate?: number;
  taxRate?: number;
  lineAmount?: number;
  taxAmount?: number;
  remark?: string;
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

export interface CrmAssignmentRule {
  ruleId?: number;
  ruleName: string;
  ruleType: 'AUTO_RELEASE' | 'CLAIM_LIMIT' | 'ASSIGN';
  priority?: number;
  status?: string;
  inactiveDays?: number;
  maxPerOwner?: number;
  deptId?: number;
  deptName?: string;
  customerLevel?: string;
  customerTags?: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CrmCustomerPoolLog {
  logId?: number;
  customerId?: number;
  customerName?: string;
  actionType?: string;
  fromOwnerId?: number;
  fromOwnerName?: string;
  toOwnerId?: number;
  toOwnerName?: string;
  ruleId?: number;
  reason?: string;
  createTime?: string;
  createBy?: string;
}

export interface CrmCustomerAssignRequest {
  customerId: number;
  ownerId: number;
  ownerName: string;
  deptId?: number;
  deptName?: string;
  reason?: string;
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

// ===== 客户工作台草稿请求载荷 =====

export interface CrmWorkspaceContractDraftPayload {
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
}

export interface CrmWorkspaceProjectDraftPayload {
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
}

export interface CrmWorkspaceBudgetDraftLine {
  subjectCode: string;
  subjectName: string;
  amount?: number;
}

export interface CrmWorkspaceBudgetDraftPayload {
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
  lines: CrmWorkspaceBudgetDraftLine[];
}

export interface CrmWorkspaceInvoiceDraftPayload {
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
}

export interface CrmWorkspaceInvoiceBindPayload {
  receivableId?: number;
  customerId?: number;
  customerName?: string;
  contractId?: number;
  contractNo?: string;
}
