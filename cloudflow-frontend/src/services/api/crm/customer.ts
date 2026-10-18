import request from '../request';
import type { PageResult } from '@/types';
import type {
  CrmCustomer,
  CrmCustomerWorkspace,
  CrmDashboardSummary,
} from './types';

export const listCustomers = (params: {
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  customerName?: string;
  customerCode?: string;
  customerTags?: string;
  healthLevel?: string;
  status?: string;
}) => request.get('/crm/customer/list', { params }) as Promise<PageResult<CrmCustomer>>;

export const addCustomer = (data: CrmCustomer, options?: { silent?: boolean }) => request.post('/crm/customer', data, options);
export const editCustomer = (data: CrmCustomer, options?: { silent?: boolean }) => request.put('/crm/customer', data, options);
export const removeCustomer = (ids: number[]) =>
  request.delete(`/crm/customer/${ids.join(',')}`);

export const getCustomerWorkspace = (id: number) =>
  request.get(`/crm/customer/${id}/workspace`) as Promise<CrmCustomerWorkspace>;

export const getDashboardSummary = () =>
  request.get('/crm/dashboard/summary') as Promise<CrmDashboardSummary>;

export const getDashboardWorkplace = () =>
  request.get('/crm/dashboard/workplace') as Promise<CrmDashboardSummary>;
