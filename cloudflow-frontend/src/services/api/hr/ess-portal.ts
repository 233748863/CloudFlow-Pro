import request from '@/services/api/request';
import type { HrEssPortalSummary } from './types';

export const getEssPortalSummary = () =>
  request.get<HrEssPortalSummary>('/hr/ess/portal/summary');

export const markMessageRead = (id: number) =>
  request.post<void>(`/hr/ess/messages/${id}/read`, {});

export const markAllMessagesRead = () =>
  request.post<void>('/hr/ess/messages/read-all', {});
