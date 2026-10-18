import request from './request';
import { imProviderDestination } from './imLogin';

export interface ImBinding {
  mappingId: number;
  configId: number;
  externalAccount: string;
  bindType: string;
  status: string;
  version: number;
  bindTime: string;
}
export interface ImBindingOverview { binding: ImBinding | null; canBind: boolean; reasonCode: string | null; message: string | null; canUnbind?: boolean; unbindMessage?: string | null }
export interface ImBindingIdentity { verified: boolean; totpRequired: boolean; expiresAt: number | null }
export interface ImBindingPending { externalAccount: string; expiresAt: number }
const base = '/auth/system/im/binding/mine';
export const getImBinding = (signal?: AbortSignal) => request.get<ImBindingOverview>(base, { signal, silent: true });
export const getImBindingIdentity = (signal?: AbortSignal) => request.get<ImBindingIdentity>(`${base}/identity`, { signal, silent: true });
export const verifyImBindingIdentity = (password: string, totpCode: string | null, signal: AbortSignal) =>
  request.post<ImBindingIdentity>(`${base}/identity`, { password, totpCode }, { signal, silent: true });
export const authorizeImBinding = (signal: AbortSignal) => request.post<{ authorizationUrl: string }>(`${base}/authorization`, {}, { signal, silent: true });
export const getImBindingPending = (signal?: AbortSignal) => request.get<ImBindingPending | null>(`${base}/pending`, { signal, silent: true });
export const confirmImBinding = (signal: AbortSignal) => request.post<ImBinding>(`${base}/confirm`, {}, { signal, silent: true });
export const getImUnbindingIdentity = (signal?: AbortSignal) => request.get<ImBindingIdentity>(`${base}/unbind/identity`, { signal, silent: true });
export const verifyImUnbindingIdentity = (password: string, totpCode: string | null, signal: AbortSignal) =>
  request.post<ImBindingIdentity>(`${base}/unbind/identity`, { password, totpCode }, { signal, silent: true });
export const unbindImAccount = (binding: Pick<ImBinding, 'mappingId' | 'version'>, signal: AbortSignal) =>
  request.post<void>(`${base}/unbind`, { mappingId: binding.mappingId, version: binding.version }, { signal, silent: true });

export interface ImManagedBinding extends ImBinding {
  userId: number; account: string | null; name: string | null; lastSyncTime: string | null; canUnbind: boolean; canResume: boolean;
}
export type ImManagementAction = 'unbind' | 'resume';
const management = '/auth/system/im/binding';
export const listImManagedBindings = (pageNum: number, signal: AbortSignal) =>
  request.get<{ rows: ImManagedBinding[]; total: number }>(`${management}/list`, { params: { pageNum, pageSize: 20 }, signal, silent: true });
export const getImManagementIdentity = (action: ImManagementAction, signal: AbortSignal) =>
  request.get<ImBindingIdentity>(`${management}/manage/${action}/identity`, { signal, silent: true });
export const verifyImManagementIdentity = (action: ImManagementAction, password: string, totpCode: string | null, signal: AbortSignal) =>
  request.post<ImBindingIdentity>(`${management}/manage/${action}/identity`, { password, totpCode }, { signal, silent: true });
export const manageImBinding = (action: ImManagementAction, binding: Pick<ImBinding, 'mappingId' | 'version'>, signal: AbortSignal) =>
  request.post<void>(`${management}/manage/${action}`, { mappingId: binding.mappingId, version: binding.version }, { signal, silent: true });

export function imBindingDestination(value: string) {
  const destination = new URL(imProviderDestination(value, 'SCAN_LOGIN'));
  if (destination.searchParams.get('redirect_uri') !== `${window.location.origin}/api/auth/im/WECOM/binding-callback`) {
    throw new Error('绑定返回地址无效，请联系管理员');
  }
  return destination.href;
}

export function imBindingError(failure: unknown, fallback: string) {
  const response = (failure as { response?: { data?: { msg?: unknown } } })?.response;
  if (typeof response?.data?.msg === 'string' && response.data.msg.length <= 256) return response.data.msg;
  const status = (failure as { status?: unknown })?.status;
  if (failure instanceof Error && failure.message.length <= 256 && typeof status === 'number' && status >= 400 && status <= 599) return failure.message;
  return failure instanceof Error && ['绑定返回地址无效，请联系管理员', '企业微信授权地址无效，请联系管理员'].includes(failure.message) ? failure.message : fallback;
}
