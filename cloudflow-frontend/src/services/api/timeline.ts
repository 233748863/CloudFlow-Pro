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

export interface TimelineQuery {
  businessType?: string;
  businessId?: number;
  relatedType?: string;
  relatedId?: number;
  limit?: number;
}

export const listTimeline = (params: TimelineQuery) =>
  request.get<TimelineEvent[]>('/oa/timeline', { params });
