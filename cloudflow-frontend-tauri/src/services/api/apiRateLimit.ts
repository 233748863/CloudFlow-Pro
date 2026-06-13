import request from './request';

export type RateLimitDimension = 'IP' | 'USER' | 'TENANT' | 'GLOBAL';
export type RateLimitStatus = 'ACTIVE' | 'INACTIVE';
export type RateLimitStrategy = 'REJECT' | 'QUEUE' | 'LOG';
export type RateLimitMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ALL';

export interface SysApiRatelimitRule {
  id?: number;
  tenantId?: number;
  ruleCode: string;
  ruleName: string;
  serviceName?: string;
  pathPattern: string;
  httpMethod: RateLimitMethod;
  dimension: RateLimitDimension;
  rps: number;
  burst?: number;
  status: RateLimitStatus;
  priority: number;
  rejectStrategy: RateLimitStrategy;
  remark?: string;
  deleted?: number;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export interface RateLimitRulePage {
  records: SysApiRatelimitRule[];
  total: number;
  size: number;
  current: number;
}

export interface RateLimitRuleQuery {
  keyword?: string;
  status?: RateLimitStatus | '';
  dimension?: RateLimitDimension | '';
  pageNum?: number;
  pageSize?: number;
}

export const pageApiRatelimitRules = (params: RateLimitRuleQuery) =>
  request.get<RateLimitRulePage>('/auth/system/api-ratelimit/page', { params });

export const listActiveApiRatelimitRules = () =>
  request.get<SysApiRatelimitRule[]>('/auth/system/api-ratelimit/active');

export const getApiRatelimitRule = (id: number) =>
  request.get<SysApiRatelimitRule>(`/auth/system/api-ratelimit/${id}`);

export const createApiRatelimitRule = (data: SysApiRatelimitRule) =>
  request.post('/auth/system/api-ratelimit', data);

export const updateApiRatelimitRule = (data: SysApiRatelimitRule) =>
  request.put('/auth/system/api-ratelimit', data);

export const deleteApiRatelimitRule = (id: number) =>
  request.delete(`/auth/system/api-ratelimit/${id}`);

export const toggleApiRatelimitRule = (id: number, status: RateLimitStatus) =>
  request.post(`/auth/system/api-ratelimit/${id}/status`, undefined, { params: { status } });

export const republishApiRatelimitRules = () =>
  request.post('/auth/system/api-ratelimit/republish');
