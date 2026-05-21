import request from '../request';
import type { PageResult } from '@/types';
import type { CrmContact, CrmFollowUp } from './types';

// ===== 联系人 =====

export const listContacts = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  contactName?: string;
  status?: string;
}) => request.get('/crm/contact/list', { params }) as Promise<PageResult<CrmContact>>;

export const addContact = (data: CrmContact) => request.post('/crm/contact', data);
export const editContact = (data: CrmContact) => request.put('/crm/contact', data);
export const removeContact = (ids: number[]) =>
  request.delete(`/crm/contact/${ids.join(',')}`);

// ===== 跟进记录 =====

export const listFollowUps = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  opportunityId?: number;
  ownerId?: number;
}) => request.get('/crm/follow-up/list', { params }) as Promise<PageResult<CrmFollowUp>>;

export const addFollowUp = (data: CrmFollowUp) => request.post('/crm/follow-up', data);
export const editFollowUp = (data: CrmFollowUp) => request.put('/crm/follow-up', data);
export const removeFollowUp = (ids: number[]) =>
  request.delete(`/crm/follow-up/${ids.join(',')}`);
