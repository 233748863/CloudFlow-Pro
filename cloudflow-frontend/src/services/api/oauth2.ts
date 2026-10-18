import request from './request';
import { getErrorMessage } from '@/utils/errorMessage';

export interface OauthScope {
  code: string;
  title: string;
  description: string;
  resource: string;
  authority: string;
}

export interface OauthClient {
  clientId: number;
  tenantId: number;
  clientKey: string;
  clientType: 'PUBLIC' | 'CONFIDENTIAL';
  clientName: string;
  logoFileId?: number | null;
  description?: string | null;
  serviceUserId?: number | null;
  secretConfigured: boolean;
  accessTokenValiditySeconds: number;
  refreshTokenValiditySeconds: number;
  redirectUris: string[];
  grantTypes: string[];
  scopes: string[];
  autoApproveScopes: string[];
  authorities: string[];
  resourceIds: string[];
  status: 'ACTIVE' | 'DISABLED';
  version: number;
}

export type OauthClientSave = Omit<OauthClient, 'clientId' | 'clientKey' | 'version' | 'secretConfigured' | 'authorities' | 'resourceIds'> & {
  clientId?: number;
  version?: number;
  secretAction: 'NONE' | 'GENERATE' | 'KEEP' | 'REPLACE';
  clientSecret?: string;
};

export interface OauthPage<Row> { rows: Row[]; total: number; pageNum: number; pageSize: number }
export interface OauthOverview { enabled: boolean; message: string; scopeRegistry: OauthScope[]; page: OauthPage<OauthClient> }
export interface OauthCreated { client: OauthClient; clientSecret?: string | null }
export interface OauthGrant {
  approveId: number;
  clientName: string;
  scopes: string[];
  approvedTime: string;
  expiresTime: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'POLICY_CHANGED';
  version: number;
}
export interface OauthAuthorization {
  clientName: string;
  description?: string | null;
  scopes: OauthScope[];
  requestToken: string | null;
  expiresTime: string;
  redirectUrl: string | null;
  automatic: boolean;
}

const clientBase = '/auth/system/oauth2/client';
const grantBase = '/auth/system/oauth2/grant';
export const listOauthClients = (query: { pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<OauthOverview>(`${clientBase}/list`, { params: query, signal, silent: true });
export const createOauthClient = (body: OauthClientSave) => request.post<OauthCreated>(clientBase, body, { silent: true });
export const updateOauthClient = (body: OauthClientSave) => request.put<OauthClient>(clientBase, body, { silent: true });
export const disableOauthClient = (clientId: number, version: number) =>
  request.post<OauthClient>(`${clientBase}/${clientId}/disable`, { version }, { silent: true });
export const listOauthGrants = (query: { pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<OauthPage<OauthGrant>>(`${grantBase}/mine`, { params: query, signal, silent: true });
export const revokeOauthGrant = (approveId: number, version: number) =>
  request.post<void>(`${grantBase}/${approveId}/revoke`, { version }, { silent: true });
export const beginOauthAuthorization = (query: string, signal?: AbortSignal) =>
  request.get<OauthAuthorization>(`/oauth2/authorize${query}`, { signal, silent: true });
export const confirmOauthAuthorization = (requestToken: string, approve: boolean, scopes: string[]) =>
  request.post<OauthAuthorization>('/oauth2/authorize', { requestToken, approve, scopes }, { silent: true });

export const oauthScopeTitles: Record<string, string> = {
  profile: '本人基本资料', 'crm.customer.read': '客户只读',
  'workflow.instance.read': '流程只读', 'system.tenant.read': '当前企业基本信息',
};

export function oauthError(failure: unknown, fallback: string): string {
  if (failure && typeof failure === 'object' && 'response' in failure && failure.response && typeof failure.response === 'object'
    && 'data' in failure.response && failure.response.data && typeof failure.response.data === 'object'
    && 'error_description' in failure.response.data && typeof failure.response.data.error_description === 'string') {
    return failure.response.data.error_description;
  }
  return getErrorMessage(failure, fallback);
}

export function oauthReturnUrl(value: string, registered: string | null): string {
  if (!registered || !value.startsWith(`${registered}${registered.includes('?') ? '&' : '?'}`)) throw new Error('应用返回地址核验失败，请重新发起授权');
  const target = new URL(value);
  const allowed = new URL(registered);
  if (target.username || target.password || target.hash || target.origin !== allowed.origin || target.pathname !== allowed.pathname
    || !(target.protocol === 'https:' || target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))) {
    throw new Error('应用返回地址核验失败，请重新发起授权');
  }
  return value;
}
