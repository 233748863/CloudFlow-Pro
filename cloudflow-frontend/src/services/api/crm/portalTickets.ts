import request from '../request';
import { downloadAuthorizedFile } from '../file';
import type { PageResult } from '@/types';
import type { PortalFile } from '@/services/portal';
import type { CrmTicket } from './types';

export interface PortalTicketManagement { ticket: CrmTicket; attachments: PortalFile[]; canAssign: boolean; canPublish: boolean }
export interface PortalTicketHandler { userId: number; name: string; department?: string }
export interface TicketPublication { version: number; publish: boolean; solution?: string }

export const portalTickets = {
  view: (ticketId: number, signal?: AbortSignal) => request.get<PortalTicketManagement>(`/crm/ticket/${ticketId}/portal-management`, { signal, silent: true }),
  handlers: (ticketId: number, keyword: string, pageNum: number, signal?: AbortSignal) => request.get<PageResult<PortalTicketHandler>>(`/crm/ticket/${ticketId}/handlers`, { params: { keyword, pageNum, pageSize: 10 }, signal, silent: true }),
  assign: (ticketId: number, version: number, ownerId: number) => request.post<PortalTicketManagement>(`/crm/ticket/${ticketId}/assign`, { version, ownerId }, { silent: true }),
  publish: (ticketId: number, body: TicketPublication) => request.put<PortalTicketManagement>(`/crm/ticket/${ticketId}/portal-solution`, body, { silent: true }),
  download: (ticketId: number, fileId: number) => downloadAuthorizedFile(
    { bizType: 'CRM_PORTAL_TICKET', bizId: String(ticketId), fileId }, new AbortController().signal),
};
