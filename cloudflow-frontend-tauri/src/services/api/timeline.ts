import request from './request';

export interface TimelineEvent {
  id: number;
  businessType: string;
  businessId: number;
  eventType: string;
  title: string;
  content?: string;
  operatorName?: string;
  eventTime?: string;
  snapshotJson?: string;
}

export interface TimelineChangedField {
  field: string;
  beforeValue?: unknown;
  afterValue?: unknown;
}

export interface TimelineDiff {
  eventId: number;
  businessType: string;
  businessId: number;
  beforeSnapshot?: string;
  afterSnapshot?: string;
  changedFields: TimelineChangedField[];
}

export interface TimelineQuery {
  businessType?: string;
  businessId?: number;
  relatedType?: string;
  relatedId?: number;
  limit?: number;
}

export const listTimeline = (params: TimelineQuery) =>
  request.get<TimelineEvent[]>('/oa/timeline', { params });

export const getTimelineDiff = (id: number) =>
  request.get<TimelineDiff>(`/oa/timeline/${id}/diff`);
