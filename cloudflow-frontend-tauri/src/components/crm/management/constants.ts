import type { CrmContact, CrmCustomer, CrmFollowUp, CrmOpportunity, CrmQuote, CrmQuoteLine, CrmReceivable, CrmRenewal, CrmTicket } from '@/services/api/crm';
import type { CrmTab } from './types';

export const crmTabPathMap: Record<CrmTab, string> = {
  dashboard: '/office/crm',
  customer: '/office/crm/customers',
  opportunity: '/office/crm/opportunities',
  quote: '/office/crm/quotes',
  receivable: '/office/crm/receivables',
  renewal: '/office/crm/renewals',
  ticket: '/office/crm/tickets',
};

export const crmPathTabMap: Record<string, CrmTab> = {
  '/office/crm': 'dashboard',
  '/office/crm/customers': 'customer',
  '/office/crm/opportunities': 'opportunity',
  '/office/crm/quotes': 'quote',
  '/office/crm/receivables': 'receivable',
  '/office/crm/renewals': 'renewal',
  '/office/crm/tickets': 'ticket',
};

export const tabPermissionMap: Record<CrmTab, string> = {
  dashboard: 'crm:dashboard:view',
  customer: 'crm:customer:list',
  opportunity: 'crm:opportunity:list',
  quote: 'crm:quote:list',
  receivable: 'crm:receivable:list',
  renewal: 'crm:renewal:list',
  ticket: 'crm:ticket:list',
};

export const tabLabelMap: Record<CrmTab, string> = {
  dashboard: '销售仪表盘',
  customer: '客户管理',
  opportunity: '商机管理',
  quote: '报价管理',
  receivable: '回款管理',
  renewal: '续约管理',
  ticket: '服务工单',
};

export const emptyCustomer: CrmCustomer = { customerName: '', customerType: 'ENTERPRISE', status: 'ACTIVE' };
export const emptyOpportunity: CrmOpportunity = { customerId: 0, opportunityName: '', stage: 'LEAD', status: 'OPEN', expectedAmount: 0, winRate: 0 };
export const emptyQuoteLine: CrmQuoteLine = { quantity: 1, unitPrice: 0, discountRate: 100, taxRate: 0, lineAmount: 0, taxAmount: 0 };
export const emptyQuote: CrmQuote = { customerId: 0, quoteName: '', totalAmount: 0, taxAmount: 0, currency: 'CNY', status: 'DRAFT', quoteLines: [emptyQuoteLine] };
export const emptyReceivable: CrmReceivable = { customerId: 0, receivableName: '', plannedAmount: 0, invoiceStatus: 'NONE', status: 'PLANNED' };
export const emptyRenewal: CrmRenewal = { customerId: 0, renewalName: '', renewalAmount: 0, status: 'PLANNED' };
export const emptyTicket: CrmTicket = { customerId: 0, ticketTitle: '', severity: 'LOW', issueType: 'OTHER', status: 'OPEN' };
export const emptyContact: CrmContact = { customerId: 0, contactName: '', status: 'ACTIVE', primaryFlag: 0 };
export const emptyFollowUp: CrmFollowUp = { customerId: 0, content: '', followUpType: 'VISIT' };

export const HEALTH_TONE: Record<string, string> = {
  GREEN: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  YELLOW: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  RED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

export const healthLabelMap: Record<string, string> = {
  GREEN: '健康',
  YELLOW: '关注',
  RED: '高风险',
};

export const stageLabelMap: Record<string, string> = {
  LEAD: '线索',
  QUALIFIED: '已确认',
  PROPOSAL: '方案报价',
  NEGOTIATION: '商务谈判',
  WON: '赢单',
  LOST: '输单',
};

export const statusLabelMap: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  SENT: '已发送',
  ACCEPTED: '已接受',
  EXPIRED: '已过期',
  PLANNED: '计划中',
  RECEIVED: '已回款',
  PARTIAL_RECEIVED: '部分回款',
  OPEN: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
  NEGOTIATING: '洽谈中',
  WON: '赢单',
  LOST: '输单',
  IN_PROGRESS: '执行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  ARCHIVED: '已归档',
};

export const invoiceStatusLabelMap: Record<string, string> = {
  NONE: '未关联合同发票',
  REGISTERED: '已登记',
  BOUND: '已绑定',
  WRITEOFF_PARTIAL: '部分核销',
  WRITEOFF_FULL: '全部核销',
  VOID: '已作废',
};

export const severityLabelMap: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  CRITICAL: '严重',
};

export const nativeSelectClassName = 'cf-control h-10 w-full rounded-xl px-4 py-2.5 text-sm appearance-auto';
