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

export const setBusinessRuleEnabled = (id: number, enabled: number) =>
  request.put(`/auth/system/rules/${id}/enabled`, undefined, { params: { enabled } });

export const deleteBusinessRules = (ids: number[]) =>
  request.delete(`/auth/system/rules/${ids.join(',')}`);
