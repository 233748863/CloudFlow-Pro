import request from './request';
import { TimelineEvent } from './timeline';

export interface AuditEventQuery {
  businessType?: string;
  businessId?: number;
  eventType?: string;
  operatorName?: string;
  beginTime?: string;
  endTime?: string;
  pageNum?: number;
  pageSize?: number;
}

export const listAuditEvents = (params?: AuditEventQuery) =>
  request.get('/oa/audit/events', { params });

export const exportAuditEvents = (params?: Omit<AuditEventQuery, 'pageNum' | 'pageSize'>) =>
  request.get<Blob>('/oa/audit/events/export', { params, responseType: 'blob' });

export type AuditEvent = TimelineEvent;
