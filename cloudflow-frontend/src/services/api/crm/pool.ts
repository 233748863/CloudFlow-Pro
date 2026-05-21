import request from '../request';
import type { PageResult } from '@/types';
import type {
  CrmAssignmentRule,
  CrmCustomer,
  CrmCustomerAssignRequest,
  CrmCustomerPoolLog,
} from './types';

// ===== 客户公海池 =====

export const listCustomerPool = (params: {
  pageNum?: number;
  pageSize?: number;
  customerName?: string;
  industry?: string;
  levelCode?: string;
  customerTags?: string;
}) => request.get('/crm/customer-pool/list', { params }) as Promise<PageResult<CrmCustomer>>;

export const listCustomerPoolLogs = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
}) => request.get('/crm/customer-pool/logs', { params }) as Promise<PageResult<CrmCustomerPoolLog>>;

export const releaseCustomer = (customerId: number, reason?: string) =>
  request.post(`/crm/customer-pool/${customerId}/release`, { reason });

export const claimCustomer = (customerId: number, reason?: string) =>
  request.post(`/crm/customer-pool/${customerId}/claim`, { reason });

export const assignCustomer = (data: CrmCustomerAssignRequest) =>
  request.post('/crm/customer-pool/assign', data);

export const triggerAutoRelease = () =>
  request.post('/crm/customer-pool/auto-release') as Promise<number>;

// ===== 分配规则 =====

export const listAssignmentRules = (params: {
  pageNum?: number;
  pageSize?: number;
  ruleName?: string;
  ruleType?: string;
  status?: string;
}) => request.get('/crm/assignment-rule/list', { params }) as Promise<PageResult<CrmAssignmentRule>>;

export const addAssignmentRule = (data: CrmAssignmentRule) =>
  request.post('/crm/assignment-rule', data);

export const editAssignmentRule = (data: CrmAssignmentRule) =>
  request.put('/crm/assignment-rule', data);

export const removeAssignmentRule = (ids: number[]) =>
  request.delete(`/crm/assignment-rule/${ids.join(',')}`);
