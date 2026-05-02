import request from '@/services/api/request'

export type HrRecord = Record<string, unknown>

export interface HrShift extends HrRecord {
  id: number
  shiftName: string
  startTime: string
  endTime: string
  breakMinutes?: number
  lateThreshold?: number
  earlyThreshold?: number
  description?: string
  status?: number
}

export interface HrScheduleRule extends HrRecord {
  id: number
  ruleName: string
  ruleType: string
  ruleConfig?: string
  description?: string
  status?: number
}

export interface AttendanceRuleConfig {
  shiftId?: number
  workDays?: number[]
  checkMethods?: string[]
  locationPoints?: Array<{
    name?: string
    latitude?: number
    longitude?: number
    radius?: number
  }>
  wifiConfigs?: Array<{
    ssid?: string
    bssid?: string
  }>
  overtimeEnabled?: boolean
  overtimeMinMinutes?: number
  lateToleranceCount?: number
  severeLateMinutes?: number
  absentMinutes?: number
  photoRequired?: boolean
  radius?: number
}

export interface AttendanceRuleAssignment extends HrRecord {
  id: number
  ruleId: number
  targetType: 'DEPT' | 'POST' | 'EMPLOYEE'
  targetId: number
  targetName?: string
  effectiveStart: string
  effectiveEnd?: string
  status?: number
}

export interface WorkCalendarDay extends HrRecord {
  id: number
  calendarDate: string
  dayType: 'WORKDAY' | 'REST' | 'HOLIDAY'
  dayName?: string
  source?: string
  status?: number
}

export const listHrShifts = () => request.get<HrShift[]>('/hr/schedule/shift/list')
export const listHrScheduleRules = () => request.get<HrScheduleRule[]>('/hr/schedule/rule/list')
export const createHrScheduleRule = (data: Omit<HrScheduleRule, 'id'> & HrRecord) =>
  request.post<number>('/hr/schedule/rule', data)
export const updateHrScheduleRule = (id: number, data: Partial<HrScheduleRule>) =>
  request.put<void>(`/hr/schedule/rule/${id}`, data)
export const deleteHrScheduleRule = (id: number) =>
  request.delete<void>(`/hr/schedule/rule/${id}`)
export const listHrScheduleRuleAssignments = (ruleId: number) =>
  request.get<AttendanceRuleAssignment[]>(`/hr/schedule/rule/${ruleId}/assignments`)
export const createHrScheduleRuleAssignment = (
  ruleId: number,
  data: Omit<AttendanceRuleAssignment, 'id' | 'ruleId'> & HrRecord
) => request.post<number>(`/hr/schedule/rule/${ruleId}/assignments`, data)
export const deleteHrScheduleRuleAssignment = (assignmentId: number) =>
  request.delete<void>(`/hr/schedule/rule/assignments/${assignmentId}`)
export const listWorkCalendarDays = (params?: { startDate?: string; endDate?: string; dayType?: string }) =>
  request.get<WorkCalendarDay[]>('/hr/work-calendar', { params })
export const createWorkCalendarDay = (data: Omit<WorkCalendarDay, 'id'> & HrRecord) =>
  request.post<number>('/hr/work-calendar', data)
export const updateWorkCalendarDay = (id: number, data: Partial<WorkCalendarDay>) =>
  request.put<void>(`/hr/work-calendar/${id}`, data)
export const deleteWorkCalendarDay = (id: number) =>
  request.delete<void>(`/hr/work-calendar/${id}`)
