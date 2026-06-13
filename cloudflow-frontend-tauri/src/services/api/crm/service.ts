import request from '../request';
import type { PageResult } from '@/types';
import type {
  CrmReceivable,
  CrmReceivableAgingBucket,
  CrmRenewal,
  CrmTicket,
} from './types';

// ===== 应收 =====

export const listReceivables = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  contractId?: number;
  receivableName?: string;
  status?: string;
}) => request.get('/crm/receivable/list', { params }) as Promise<PageResult<CrmReceivable>>;

export const addReceivable = (data: CrmReceivable) => request.post('/crm/receivable', data);
export const editReceivable = (data: CrmReceivable) => request.put('/crm/receivable', data);

export const confirmReceivable = (id: number) => request.post(`/crm/receivable/${id}/confirm`);

export const bindReceivableInvoice = (id: number, invoiceId: number) =>
  request.post(`/crm/receivable/${id}/bind-invoice/${invoiceId}`);

export const getReceivableAging = () =>
  request.get('/crm/receivable/aging') as Promise<CrmReceivableAgingBucket[]>;

export const removeReceivable = (ids: number[]) =>
  request.delete(`/crm/receivable/${ids.join(',')}`);

// ===== 续约 =====

export const listRenewals = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  contractId?: number;
  renewalName?: string;
  status?: string;
}) => request.get('/crm/renewal/list', { params }) as Promise<PageResult<CrmRenewal>>;

export const addRenewal = (data: CrmRenewal) => request.post('/crm/renewal', data);
export const editRenewal = (data: CrmRenewal) => request.put('/crm/renewal', data);

export const submitRenewal = (id: number) => request.post(`/crm/renewal/submit/${id}`);

export const removeRenewal = (ids: number[]) =>
  request.delete(`/crm/renewal/${ids.join(',')}`);

// ===== 工单 =====

export const listTickets = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  ticketTitle?: string;
  severity?: string;
  status?: string;
}) => request.get('/crm/ticket/list', { params }) as Promise<PageResult<CrmTicket>>;

export const addTicket = (data: CrmTicket) => request.post('/crm/ticket', data);
export const editTicket = (data: CrmTicket) => request.put('/crm/ticket', data);

export const resolveTicket = (id: number, solution?: string) =>
  request.post(`/crm/ticket/${id}/resolve`, { solution });

export const closeTicket = (id: number) => request.post(`/crm/ticket/${id}/close`);

export const removeTicket = (ids: number[]) =>
  request.delete(`/crm/ticket/${ids.join(',')}`);
