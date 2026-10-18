import request from '../request';
import type { PageResult } from '@/types';

export interface CrmRefundReceipt {
  receiptEventId: number;
  occurredTime: string;
  source: 'CRM' | 'INVOICE';
  currency: string;
  teamVersion: number;
  amount: number | string;
  refundedAmount: number | string;
  remainingAmount: number | string;
}

export interface CrmRefundSources {
  receivableId: number;
  version: number;
  currency: string;
  receivedAmount: number | string;
  untrackedAmount: number | string;
  pendingApprovalId?: number | null;
  workflowConfigured: boolean;
  workflowMessage: string;
  businessOwnerName: string | null;
  financeReviewerCount: number;
  receipts: PageResult<CrmRefundReceipt> & { pageNum: number; pageSize: number };
}

export const listRefundReceipts = (receivableId: number, params: { pageNum: number; pageSize: number; receiptEventId?: number }) =>
  request.get(`/crm/approval/refund/${receivableId}/receipts`, { params }) as Promise<CrmRefundSources>;

export const submitCustomerClaim = (data: {
  customerId: number;
  action: 'CLAIM' | 'RELEASE';
  remark?: string;
}) => request.post('/crm/approval/customer-claim', data) as Promise<number>;

export const submitCustomerLevelChange = (data: {
  customerId: number;
  action: 'LEVEL_UP' | 'LEVEL_DOWN';
  targetLevel: string;
  remark?: string;
}) => request.post('/crm/approval/customer-level', data) as Promise<number>;

export const submitOpportunityDowngrade = (data: {
  opportunityId: number;
  version: number;
  action: 'DOWNGRADE' | 'CLOSE';
  targetStage?: string;
  lostReason?: string;
}) => request.post('/crm/approval/opportunity-downgrade', data) as Promise<number>;

export const submitRefund = (data: {
  receivableId: number;
  receiptEventId: number;
  version: number;
  refundAmount: number | string;
  reason?: string;
}) => request.post('/crm/approval/refund', data) as Promise<number>;
