import request from './request';

export type RuleEffect = 'BLOCK' | 'WARN' | 'PASS';

export interface BusinessRule {
  id?: number;
  tenantId?: number;
  ruleCode: string;
  ruleName: string;
  module: string;
  thresholdValue?: number;
  effect: RuleEffect;
  enabled: number;
  priority: number;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface BusinessRuleVersion {
  id: number;
  tenantId?: number;
  ruleId: number;
  ruleCode: string;
  versionNo: number;
  thresholdValue?: number;
  effect: RuleEffect;
  enabled: number;
  priority: number;
  remark?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publisherName?: string;
  publishedTime?: string;
  snapshotJson?: string;
  createTime?: string;
}

export interface BusinessRuleHitRecord {
  id: number;
  tenantId?: number;
  ruleCode: string;
  businessType: string;
  businessId?: number;
  thresholdValue?: number;
  actualValue?: number;
  effect: RuleEffect;
  hitResult: string;
  createdTime?: string;
}

export interface BusinessRuleQuery {
  pageNum?: number;
  pageSize?: number;
  module?: string;
  ruleCode?: string;
  enabled?: number;
}

export const listBusinessRules = (params?: BusinessRuleQuery) =>
  request.get('/auth/system/rules/list', { params });

export const getBusinessRule = (id: number) =>
  request.get<BusinessRule>(`/auth/system/rules/${id}`);

export const getEffectiveBusinessRule = (ruleCode: string) =>
  request.get<BusinessRule>(`/auth/system/rules/effective/${ruleCode}`);

export const createBusinessRule = (data: BusinessRule) =>
  request.post('/auth/system/rules', data);

export const updateBusinessRule = (data: BusinessRule) =>
  request.put('/auth/system/rules', data);

export const createBusinessRuleDraft = (data: BusinessRule) =>
  request.post<BusinessRuleVersion>('/auth/system/rules/draft', data);

export const listBusinessRuleVersions = (params?: {
  ruleId?: number;
  ruleCode?: string;
  status?: string;
  pageNum?: number;
  pageSize?: number;
}) => request.get('/auth/system/rules/versions', { params });

export const publishBusinessRuleVersion = (versionId: number) =>
  request.post(`/auth/system/rules/versions/${versionId}/publish`);

export const rollbackBusinessRuleVersion = (ruleId: number, versionId: number) =>
  request.post(`/auth/system/rules/${ruleId}/rollback/${versionId}`);

export const listBusinessRuleHitRecords = (params?: {
  ruleCode?: string;
  businessType?: string;
  hitResult?: string;
  pageNum?: number;
  pageSize?: number;
}) => request.get('/auth/system/rules/hit-records', { params });

export const setBusinessRuleEnabled = (id: number, enabled: number) =>
  request.put(`/auth/system/rules/${id}/enabled`, undefined, { params: { enabled } });

export const deleteBusinessRules = (ids: number[]) =>
  request.delete(`/auth/system/rules/${ids.join(',')}`);
