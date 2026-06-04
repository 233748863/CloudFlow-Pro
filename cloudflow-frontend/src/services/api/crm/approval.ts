import request from '../request';

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
  action: 'DOWNGRADE' | 'CLOSE';
  targetStage?: string;
  lostReason?: string;
}) => request.post('/crm/approval/opportunity-downgrade', data) as Promise<number>;

export const submitRefund = (data: {
  receivableId: number;
  refundAmount: number;
  reason?: string;
}) => request.post('/crm/approval/refund', data) as Promise<number>;
