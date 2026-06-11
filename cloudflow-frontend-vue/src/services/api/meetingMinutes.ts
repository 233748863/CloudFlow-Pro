import request from './request'
import { createRecord, deleteRecords, listPage, runRecordAction, updateRecord, type ApiRecord, type ListParams } from './page'

/** 会议纪要管理 */
export const listMeetingMinutes = (params?: ListParams) => listPage('/oa/meeting/minutes/page', params)
export const createMeetingMinutes = (data: ApiRecord) => createRecord('/oa/meeting/minutes', data)
export const updateMeetingMinutes = (data: ApiRecord) => updateRecord('/oa/meeting/minutes', data)
export const deleteMeetingMinutes = (id: string | number) => deleteRecords('/oa/meeting/minutes', [id], 'single')

/** 会议纪要详情 */
export const getMeetingMinutesDetail = (id: string | number) => request.get(`/oa/meeting/minutes/${id}`)

/** 确认会议纪要 */
export const confirmMeetingMinutes = (id: string | number) => runRecordAction(`/oa/meeting/minutes/${id}/confirm`)

/** 参会人员管理 */
export const listAttendance = (minutesId: string | number) => request.get(`/oa/meeting/minutes/${minutesId}/attendance`)

export const upsertAttendance = (data: {
  minutesId: string | number
  attendees: Array<{ userId: string | number; userName?: string; attended?: boolean }>
}) => request.post('/oa/meeting/minutes/attendance', data)

export const removeAttendance = (attendanceId: string | number) =>
  request.delete(`/oa/meeting/minutes/attendance/${attendanceId}`)

/** 会议决议管理 */
export const dispatchDecisions = (minutesId: string | number, decisions: Array<{
  title: string
  assigneeId: string | number
  dueDate?: string
  priority?: string
}>) => request.post(`/oa/meeting/minutes/${minutesId}/dispatch-decisions`, { decisions })

/** 辅助函数：解析决议 JSON */
export const parseDecisions = (json: string) => {
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

/** 辅助函数：序列化决议 */
export const stringifyDecisions = (decisions: Array<ApiRecord>) => JSON.stringify(decisions)
