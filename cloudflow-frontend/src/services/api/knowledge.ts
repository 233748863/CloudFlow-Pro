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

export interface KnowledgeUnreadUser {
  userId: number;
  userName?: string;
  deptName?: string;
}

export interface KnowledgeReadStats {
  readCount: number;
  expectedCount?: number;
  unreadCount?: number;
  readUsers: KnowledgeReadRecord[];
  unreadUsers?: KnowledgeUnreadUser[];
}

export interface KnowledgeQuery {
  keyword?: string;
  category?: string;
  unreadOnly?: boolean;
  status?: string;
  pageNum?: number;
  pageSize?: number;
}

export interface KnowledgeDocVersion {
  id?: number;
  tenantId?: number;
  documentId?: number;
  versionNo?: number;
  title?: string;
  summary?: string;
  content?: string;
  attachmentUrl?: string;
  changeSummary?: string;
  operatorId?: number;
  operatorName?: string;
  publishTime?: string;
  createTime?: string;
  updateTime?: string;
}

export interface KnowledgeVersionDiffLine {
  type: 'EQUAL' | 'ADD' | 'DEL';
  text: string;
}

export interface KnowledgeVersionDiffResult {
  fromVersion: KnowledgeDocVersion;
  toVersion: KnowledgeDocVersion;
  titleChanged: boolean;
  summaryChanged: boolean;
  attachmentChanged: boolean;
  contentDiff: KnowledgeVersionDiffLine[];
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
  // OA-P0-1 版本管理
  listVersions: (id: number) =>
    request.get(`/oa/knowledge/${id}/versions`) as Promise<KnowledgeDocVersion[]>,
  getVersion: (id: number, versionNo: number) =>
    request.get(`/oa/knowledge/${id}/versions/${versionNo}`) as Promise<KnowledgeDocVersion>,
  diffVersions: (id: number, from: number, to: number) =>
    request.get(`/oa/knowledge/${id}/versions/diff`, { params: { from, to } }) as Promise<KnowledgeVersionDiffResult>,
  rollbackVersion: (id: number, versionNo: number) =>
    request.post(`/oa/knowledge/${id}/versions/${versionNo}/rollback`),
};

// OA-P1-3 知识库文档模板
export type KnowledgeTemplateCategory = 'MEETING' | 'WEEKLY' | 'REVIEW' | 'POLICY' | 'OTHER';
export type KnowledgeTemplateStatus = 'ACTIVE' | 'INACTIVE';

export interface OaKnowledgeTemplate {
  id?: number;
  tenantId?: number;
  templateCode?: string;
  templateName: string;
  category: KnowledgeTemplateCategory;
  summary?: string;
  content: string;
  coverUrl?: string;
  status: KnowledgeTemplateStatus;
  usageCount?: number;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export const knowledgeTemplateApi = {
  page: (params: {
    pageNum?: number;
    pageSize?: number;
    keyword?: string;
    category?: string;
    status?: string;
  }) => request.get('/oa/knowledge/template/page', { params }) as Promise<PageResult<OaKnowledgeTemplate>>,
  listActive: (category?: string) =>
    request.get('/oa/knowledge/template/active', { params: { category } }) as Promise<OaKnowledgeTemplate[]>,
  getInfo: (id: number) =>
    request.get(`/oa/knowledge/template/${id}`) as Promise<OaKnowledgeTemplate>,
  add: (data: OaKnowledgeTemplate) => request.post('/oa/knowledge/template', data),
  edit: (data: OaKnowledgeTemplate) => request.put('/oa/knowledge/template', data),
  remove: (id: number) => request.delete(`/oa/knowledge/template/${id}`),
  use: (id: number) => request.post(`/oa/knowledge/template/${id}/use`) as Promise<string>,
};
