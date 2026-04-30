import request from './request';
import type { PageResult } from '@/types';

export type KnowledgeStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'REJECTED';
export type KnowledgeScopeType = 'ALL' | 'DEPT' | 'ROLE';

export interface KnowledgeDocument {
  documentId?: number;
  tenantId?: number;
  instanceId?: string;
  title: string;
  category: string;
  summary?: string;
  content: string;
  attachmentUrl?: string;
  scopeType: KnowledgeScopeType;
  scopeValue?: string;
  status?: KnowledgeStatus;
  submitterId?: number;
  submitterName?: string;
  deptId?: number;
  deptName?: string;
  submitTime?: string;
  publishTime?: string;
  createTime?: string;
  updateTime?: string;
  isRead?: boolean;
  readCount?: number;
}

export interface KnowledgeReadRecord {
  id: number;
  documentId: number;
  userId: number;
  userName?: string;
  readTime?: string;
}

export interface KnowledgeReadStats {
  readCount: number;
  readUsers: KnowledgeReadRecord[];
}

export interface KnowledgeQuery {
  keyword?: string;
  category?: string;
  unreadOnly?: boolean;
  status?: string;
  pageNum?: number;
  pageSize?: number;
}

export const knowledgeApi = {
  myList: (params?: KnowledgeQuery) =>
    request.get('/oa/knowledge/my-list', { params }) as Promise<KnowledgeDocument[]>,
  mySubmissions: (params?: KnowledgeQuery) =>
    request.get('/oa/knowledge/my-submissions', { params }) as Promise<PageResult<KnowledgeDocument>>,
  manageList: (params?: KnowledgeQuery) =>
    request.get('/oa/knowledge/manage-list', { params }) as Promise<PageResult<KnowledgeDocument>>,
  getInfo: (id: number) =>
    request.get(`/oa/knowledge/${id}`) as Promise<KnowledgeDocument>,
  add: (data: KnowledgeDocument) =>
    request.post('/oa/knowledge', data),
  edit: (data: KnowledgeDocument) =>
    request.put('/oa/knowledge', data),
  remove: (id: number) =>
    request.delete(`/oa/knowledge/${id}`),
  submit: (id: number) =>
    request.post(`/oa/knowledge/submit/${id}`),
  recall: (id: number) =>
    request.post(`/oa/knowledge/recall/${id}`),
  read: (id: number) =>
    request.post(`/oa/knowledge/read/${id}`) as Promise<boolean>,
  readStats: (id: number) =>
    request.get(`/oa/knowledge/read-stats/${id}`) as Promise<KnowledgeReadStats>,
};
