import request from './request';
import type { PageResult } from '@/types';

export type MeetingMinutesStatus = 'DRAFT' | 'CONFIRMED';
export type MeetingAttendStatus = 'ATTEND' | 'ABSENT' | 'LATE' | 'LEAVE' | 'NOT_CHECKED';

export interface OaMeetingDecision {
  title?: string;
  ownerId?: number;
  ownerName?: string;
  dueDate?: string;
  remark?: string;
  status?: 'PENDING' | 'DISPATCHED' | 'DONE';
  workTaskId?: number;
}

export interface OaMeetingMinutes {
  id?: number;
  tenantId?: number;
  meetingId?: number;
  meetingTitle: string;
  meetingTime?: string;
  roomId?: string;
  location?: string;
  organizerId?: number;
  organizerName?: string;
  /** 关联的日程事件ID（会议室预约） */
  scheduleEventId?: number;
  minutesContent: string;
  /** JSON string of OaMeetingDecision[] */
  decisions?: string;
  attachmentUrl?: string;
  status?: MeetingMinutesStatus;
  confirmedTime?: string;
  createTime?: string;
  updateTime?: string;
}

export interface OaMeetingAttendance {
  id?: number;
  tenantId?: number;
  minutesId?: number;
  meetingId?: number;
  userId?: number;
  userName?: string;
  attendStatus: MeetingAttendStatus;
  checkInTime?: string;
  remark?: string;
}

export const meetingMinutesApi = {
  page: (params: {
    pageNum?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    meetingId?: number;
  }) => request.get('/oa/meeting/minutes/page', { params }) as Promise<PageResult<OaMeetingMinutes>>,
  detail: (id: number) =>
    request.get(`/oa/meeting/minutes/${id}`) as Promise<OaMeetingMinutes>,
  add: (data: OaMeetingMinutes) => request.post('/oa/meeting/minutes', data),
  edit: (data: OaMeetingMinutes) => request.put('/oa/meeting/minutes', data),
  remove: (id: number) => request.delete(`/oa/meeting/minutes/${id}`),
  confirm: (id: number) => request.post(`/oa/meeting/minutes/${id}/confirm`),
  listAttendance: (id: number) =>
    request.get(`/oa/meeting/minutes/${id}/attendance`) as Promise<OaMeetingAttendance[]>,
  upsertAttendance: (data: OaMeetingAttendance) =>
    request.post('/oa/meeting/minutes/attendance', data),
  removeAttendance: (id: number) =>
    request.delete(`/oa/meeting/minutes/attendance/${id}`),
  dispatchDecisions: (id: number, decisions?: OaMeetingDecision[]) =>
    request.post(`/oa/meeting/minutes/${id}/dispatch-decisions`, decisions ?? []) as Promise<number[]>,
};

export function parseDecisions(json?: string): OaMeetingDecision[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('解析会议决议 JSON 失败', err);
    return [];
  }
}

export function stringifyDecisions(decisions: OaMeetingDecision[]): string {
  return JSON.stringify(decisions ?? []);
}
