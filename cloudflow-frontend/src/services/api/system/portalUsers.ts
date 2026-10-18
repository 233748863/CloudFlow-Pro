import request from '../request';
import type { PageResult } from '@/types';

export interface PortalUser {
  portalUserId: number; contactId: number; customerId: number; loginAccount: string; emailMask: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED'; version: number; deliveryStatus: string;
  pendingReason?: string; activateExpireTime?: string; lockedUntil?: string; lastLoginTime?: string;
}
export interface PortalContactChoice { contactId: number; customerId: number; contactName: string; customerName: string; emailMask: string }
export interface PortalInvite { contactId: number; loginAccount: string }
export type PortalAction = 'resend' | 'disable' | 'reset-password';

export const portalUsers = {
  list: (params: { keyword?: string; status?: string; pageNum?: number; pageSize?: number }) => request.get<PageResult<PortalUser>>('/auth/system/portal-user/list', { params, silent: true }),
  contacts: (params: { keyword?: string; pageNum?: number; pageSize?: number }) => request.get<PageResult<PortalContactChoice>>('/auth/system/portal-user/contacts', { params, silent: true }),
  readiness: () => request.get<{ available: boolean; reason?: string }>('/auth/system/portal-user/readiness', { silent: true }),
  invite: (body: PortalInvite) => request.post<PortalUser>('/auth/system/portal-user/invite', body, { silent: true }),
  action: (id: number, action: PortalAction, version: number) => request.post<PortalUser>(`/auth/system/portal-user/${id}/${action}`, { version }, { silent: true }),
};
