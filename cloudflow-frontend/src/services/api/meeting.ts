import request from './request';
import { downloadAuthorizedFile } from './file';

export type MeetingId = string | number;
export type MeetingStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NOT_HELD';
export type MeetingAcceptance = 'NONE' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
export interface MeetingPage<Value> { rows?: Value[]; records?: Value[]; total: number; }
export interface MeetingReminderSetting { remindMinutesBefore: number; channelType: 'INTERNAL' | 'EMAIL'; }
export interface MeetingRoomView {
  roomId: MeetingId; name: string; capacity?: number; location?: string; equipment?: string; status: string; version: number;
  equipmentTags?: string; bookableWeekdays?: string; openTime?: string; closeTime?: string;
  holidayCalendarId?: MeetingId; holidayBookableFlag?: number; minBookingMinutes?: number; maxBookingMinutes?: number;
  advanceBookingDays?: number; needApprovalFlag?: number; approverId?: MeetingId; bufferMinutes?: number; photoFileId?: MeetingId;
}
export interface MeetingEvent {
  eventId: MeetingId; creatorId: MeetingId; title: string; description?: string; roomId?: MeetingId; startTime: string; endTime: string;
  expectedAttendees: number; attendees?: string; joinUrl?: string; meetingPlatform?: string; reminders?: string;
  status: MeetingStatus; approvalStatus: string; version: number; scheduleVersion: number; instanceId?: string;
  recurrenceRole: 'SINGLE' | 'SERIES' | 'INSTANCE'; parentEventId?: MeetingId; recurrenceRule?: string;
  recurrenceEndDate?: string; originalStartTime?: string; timezoneId?: string;
}
export interface MeetingBooking {
  version?: number; title: string; description?: string; roomId?: MeetingId | null; startTime: string; endTime: string;
  expectedAttendees: number; attendeeIds: MeetingId[]; joinUrl?: string; meetingPlatform?: string; reminders: MeetingReminderSetting[];
  draft: boolean; confirmParticipantConflicts: boolean; timezoneId: string; recurrenceRule?: string; recurrenceEndDate?: string;
  confirmSeriesChanges?: boolean; impactDigest?: string;
}
export interface MeetingInvitation {
  id: MeetingId; userId: MeetingId; userName: string; acceptanceStatus: MeetingAcceptance; responseTime?: string;
  invitationVersion: number; attendStatus: string; checkInTime?: string; minutesId?: MeetingId; deleted: number;
}
export interface MeetingReminder {
  reminderId: MeetingId; scheduleVersion: number; eventKey: string; channelType: string; remindMinutesBefore: number;
  status: string; sentFlag: number; dueTime: string; sendTime?: string; messageRecordId?: MeetingId;
}
export interface MeetingDelivery {
  reminder: MeetingReminder;
  recipients: { userId: MeetingId; recordId?: MeetingId; status: string; reason: string; acceptedTime?: string }[];
}
export interface MeetingDetail {
  event: MeetingEvent; invitations: MeetingInvitation[]; reminders: MeetingReminder[]; owner: boolean; manageable: boolean; minutesId?: MeetingId;
}
export interface MeetingBusy {
  userId: MeetingId; businessId?: MeetingId; module: string; title: string; detailsVisible: boolean; startTime: string; endTime: string;
}
export interface MeetingConflicts { busy: MeetingBusy[]; crmVerified: boolean; warning?: string; }
export interface MeetingOccupancy {
  eventId?: MeetingId; title: string; roomId: MeetingId; startTime: string; endTime: string; bufferedEndTime: string;
  status: MeetingStatus; approvalStatus: string; detailsVisible: boolean;
}
export interface MeetingLane { room: MeetingRoomView; meetings: MeetingOccupancy[]; unavailableReason?: string; }
export interface MeetingUsage {
  room: MeetingRoomView; usedMinutes: number; bookedMinutes: number; openMinutes: number;
  usagePercent?: number; bookingPercent?: number; basis: string; unavailableReason?: string;
}
export interface MeetingSeriesPreview {
  changes: { eventId?: MeetingId; originalStartTime: string; startTime: string; endTime: string; action: string; reason?: string }[];
  impactDigest: string; canSubmit: boolean; participantConflicts: MeetingConflicts;
}
export interface MeetingRule {
  version: number; equipmentTags: string[]; bookableWeekdays: number[]; openTime?: string | null; closeTime?: string | null;
  holidayCalendarId?: MeetingId | null; holidayBookableFlag: number; minBookingMinutes: number; maxBookingMinutes?: number | null;
  advanceBookingDays?: number | null; needApprovalFlag: number; approverId?: MeetingId | null; bufferMinutes: number; photoFileId?: MeetingId | null;
  confirmExistingConflicts: boolean; impactDigest?: string;
}
export interface MeetingRulePreview {
  affected: { eventId: MeetingId; title: string; startTime: string; reason: string }[];
  impactDigest: string; explanation: string;
}
export interface MeetingCalendar { calendarId: MeetingId; calendarName: string; }
export interface MeetingWindow { start: string; end: string; pageNum?: number; pageSize?: number; capacity?: number; equipment?: string[]; }
const options = { silent: true, paramsSerializer: { indexes: null } };

export const meetingApi = {
  board: (params: MeetingWindow) => request.get<MeetingPage<MeetingLane>>('/oa/meeting/board', { ...options, params }),
  available: (params: MeetingWindow) => request.get<MeetingPage<MeetingRoomView>>('/oa/meeting/room/available', { ...options, params }),
  mine: (params: MeetingWindow) => request.get<MeetingPage<MeetingEvent>>('/oa/meeting/mine', { ...options, params }),
  usage: (params: MeetingWindow) => request.get<MeetingPage<MeetingUsage>>('/oa/meeting/usage', { ...options, params }),
  detail: (id: MeetingId) => request.get<MeetingDetail>(`/oa/meeting/booking/${id}`, options),
  create: (body: MeetingBooking) => request.post<MeetingEvent>('/oa/meeting/booking', body, options),
  update: (id: MeetingId, body: MeetingBooking) => request.put<MeetingEvent>(`/oa/meeting/booking/${id}`, body, options),
  submit: (id: MeetingId, version: number, confirmParticipantConflicts: boolean) => request.post<MeetingEvent>(`/oa/meeting/booking/${id}/submit`, { version, confirmParticipantConflicts }, options),
  cancel: (id: MeetingId, version: number, reason: string) => request.post<MeetingEvent>(`/oa/meeting/booking/${id}/cancel`, { version, reason }, options),
  state: (id: MeetingId, version: number, targetStatus: MeetingStatus, reason?: string) => request.post<MeetingEvent>(`/oa/meeting/booking/${id}/state`, { version, targetStatus, reason }, options),
  respond: (id: MeetingId, invitationVersion: number, acceptanceStatus: Exclude<MeetingAcceptance, 'NONE'>) => request.post<MeetingInvitation>(`/oa/meeting/booking/${id}/respond`, { invitationVersion, acceptanceStatus }, options),
  participantBusy: (userIds: MeetingId[], start: string, end: string, excludeId?: MeetingId) => request.get<MeetingConflicts>('/oa/meeting/participant-busy', { ...options, params: { userIds, start, end, excludeId } }),
  delivery: (id: MeetingId) => request.get<MeetingDelivery[]>(`/oa/meeting/booking/${id}/delivery`, options),
  emailReadiness: () => request.get<{ ready: boolean; reason?: string }>('/oa/meeting/email-readiness', options),
  previewSeries: (body: MeetingBooking, id?: MeetingId) => request.post<MeetingSeriesPreview>('/oa/meeting/series/preview', body, { ...options, params: { id } }),
  createSeries: (body: MeetingBooking) => request.post<{ series: MeetingEvent; instances: MeetingEvent[] }>('/oa/meeting/series', body, options),
  updateSeries: (id: MeetingId, body: MeetingBooking) => request.put<{ series: MeetingEvent; instances: MeetingEvent[] }>(`/oa/meeting/series/${id}`, body, options),
  previewRule: (id: MeetingId, body: MeetingRule) => request.post<MeetingRulePreview>(`/oa/meeting-room/${id}/booking-rule/preview`, body, options),
  calendars: (pageNum: number) => request.get<MeetingPage<MeetingCalendar>>('/oa/meeting-room/calendars', { ...options, params: { pageNum, pageSize: 50 } }),
  saveRule: (id: MeetingId, body: MeetingRule) => request.put<MeetingRoomView>(`/oa/meeting-room/${id}/booking-rule`, body, options),
  photo: (id: MeetingId, fileId: MeetingId, signal: AbortSignal) => downloadAuthorizedFile({ bizType: 'OA_MEETING_ROOM', bizId: String(id), fileId }, signal),
  uploadPhoto: (id: MeetingId, file: File) => {
    const data = new FormData(); data.append('file', file);
    return request.post<{ fileId: string; fileName: string; size: number; extension: string }>(`/oa/meeting-room/${id}/photo`, data, { ...options, headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
