import request from '@/services/api/request'

export type ScheduleType = 'MEETING' | 'PERSONAL' | 'WORK' | string

export interface SysScheduleEvent {
  eventId?: number
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  isAllDay?: boolean
  type?: ScheduleType
  roomId?: number | null
  creatorId?: number
  attendees?: string
  createTime?: string
  updateTime?: string
}

export interface MeetingRoom {
  roomId?: number
  roomName?: string
  name?: string
  capacity?: number
  location?: string
  status?: string
  remark?: string
}

export interface RoomUsageStats {
  roomId?: number
  roomName?: string
  bookingCount?: number
  totalMinutes?: number
  usedDays?: number
}

export const getMyEvents = (start?: string, end?: string) =>
  request.get<SysScheduleEvent[]>('/oa/schedule/my-events', { params: { start, end } })

export const getTodaySchedule = () =>
  request.get<SysScheduleEvent[]>('/oa/schedule/today')

export const createEvent = (event: Partial<SysScheduleEvent>) =>
  request.post<boolean>('/oa/schedule', event)

export const updateEvent = (event: Partial<SysScheduleEvent>) =>
  request.put<boolean>('/oa/schedule', event)

export const deleteEvent = (id: string | number) =>
  request.delete<boolean>(`/oa/schedule/${id}`)

export const getRoomEvents = (roomId: string | number, date?: string) =>
  request.get<SysScheduleEvent[]>(`/oa/schedule/room/${roomId}`, { params: date ? { date } : {} })

export const getRoomWeekEvents = (roomId: string | number, weekStart: string) =>
  request.get<SysScheduleEvent[]>(`/oa/schedule/room/${roomId}/week`, { params: { weekStart } })

export const getMyBookings = (status?: 'upcoming' | 'past') =>
  request.get<SysScheduleEvent[]>('/oa/schedule/my-bookings', { params: status ? { status } : {} })

export const cancelBooking = (id: string | number) =>
  request.put<boolean>(`/oa/schedule/cancel/${id}`)

export const getRoomUsageStats = (startDate?: string, endDate?: string) =>
  request.get<RoomUsageStats[]>('/oa/schedule/room-stats', { params: { startDate, endDate } })

export const getMeetingRooms = () =>
  request.get<MeetingRoom[]>('/oa/meeting-room/list')
