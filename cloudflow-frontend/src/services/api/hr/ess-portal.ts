import request from '@/services/api/request';
import type { HrEssPortalSummary } from './types';

export const getEssPortalSummary = () =>
  request.get<HrEssPortalSummary>('/hr/ess/portal/summary');

export const markMessageRead = (id: number) =>
  request.put<void>('/auth/system/message/mine/read', { recordIds: [id] });

export const markAllMessagesRead = () =>
  request.put<void>('/auth/system/message/mine/read', { all: true });
