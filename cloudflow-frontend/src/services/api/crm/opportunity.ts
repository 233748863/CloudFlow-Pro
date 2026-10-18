import request from '../request';
import type { PageResult } from '@/types';
import type { LossRequest } from './operations';
import type {
  CrmOpportunity,
  CrmOpportunityBoardColumn,
  CrmQuote,
} from './types';

// ===== 商机 =====

export const listOpportunities = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  opportunityName?: string;
  stage?: string;
  ownerId?: number;
}) => request.get('/crm/opportunity/list', { params }) as Promise<PageResult<CrmOpportunity>>;

export const addOpportunity = (data: CrmOpportunity) => request.post('/crm/opportunity', data);
export const editOpportunity = (data: CrmOpportunity) => request.put('/crm/opportunity', data);
export const getOpportunityDetail = (id: number) => request.get<CrmOpportunity>(`/crm/opportunity/${id}`);

export const winOpportunity = (id: number, version: number, competitorId?: number) => request.post(`/crm/opportunity/${id}/win`, { version, competitorId });
export const loseOpportunity = (id: number, data: LossRequest) => request.post<number>(`/crm/opportunity/${id}/lose`, data);

export const getOpportunityBoard = () =>
  request.get('/crm/opportunity/board') as Promise<CrmOpportunityBoardColumn[]>;

export const updateOpportunityStage = (data: {
  opportunityId: number;
  stage: string;
  version: number;
}) => request.put('/crm/opportunity/stage', data);

export const createProjectDraft = (id: number) =>
  request.post(`/crm/opportunity/${id}/project-draft`) as Promise<number>;

export const removeOpportunity = (ids: number[]) =>
  request.delete(`/crm/opportunity/${ids.join(',')}`);

// ===== 报价 =====

export const listQuotes = (params: {
  pageNum?: number;
  pageSize?: number;
  customerId?: number;
  opportunityId?: number;
  quoteName?: string;
  status?: string;
}) => request.get('/crm/quote/list', { params }) as Promise<PageResult<CrmQuote>>;

export const getQuoteDetail = (id: number) =>
  request.get(`/crm/quote/${id}`) as Promise<CrmQuote>;

export const addQuote = (data: CrmQuote) => request.post('/crm/quote', data);
export const editQuote = (data: CrmQuote) => request.put('/crm/quote', data);

export const submitQuote = (id: number) => request.post(`/crm/quote/submit/${id}`);
export const sendQuote = (id: number) => request.post(`/crm/quote/${id}/send`);
export const acceptQuote = (id: number) => request.post(`/crm/quote/${id}/accept`);
export const expireQuote = (id: number) => request.post(`/crm/quote/${id}/expire`);

export const createContractDraft = (id: number) =>
  request.post(`/crm/quote/${id}/contract-draft`) as Promise<number>;

export const removeQuote = (ids: number[]) =>
  request.delete(`/crm/quote/${ids.join(',')}`);
