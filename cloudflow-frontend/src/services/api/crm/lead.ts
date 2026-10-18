import request from '../request';
import type { PageResult } from '@/types';
import type { CrmLead, CrmLeadConvertRequest } from './types';

export const listLeads = (params: {
  pageNum?: number;
  pageSize?: number;
  leadName?: string;
  companyName?: string;
  contactName?: string;
  mobile?: string;
  status?: string;
  ownerId?: number;
  qualificationStatus?: string;
  territoryId?: number;
  marketSegment?: string;
  industry?: string;
  campaignId?: number;
  scoreMin?: number;
  scoreMax?: number;
  scoreOrder?: string;
}) => request.get('/crm/lead/list', { params }) as Promise<PageResult<CrmLead>>;

export const addLead = (data: CrmLead) => request.post('/crm/lead', data);

export const getLead = (id: number, signal?: AbortSignal) => request.get<CrmLead>(`/crm/lead/${id}`, { signal });

export const editLead = (data: CrmLead) => request.put('/crm/lead', data);

export const convertLead = (data: CrmLeadConvertRequest) =>
  request.post('/crm/lead/convert', data) as Promise<number>;

export const removeLead = (ids: number[]) =>
  request.delete(`/crm/lead/${ids.join(',')}`);
