import request from '@/services/api/request'

export interface WorkplaceSummary {
  user?: {
    name?: string
    department?: string
    avatar?: string
  }
  statistics?: {
    pendingTasks?: number
    todaySchedules?: number
    unreadMessages?: number
  }
  quickActions?: Array<{
    id?: string
    name?: string
    icon?: string
    color?: string
    path?: string
  }>
  announcements?: Array<{
    id?: number
    title?: string
    publishTime?: string
    isRead?: boolean
  }>
}

export interface RecentTask {
  taskId?: string
  taskName?: string
  processInstanceId?: string
  processName?: string
  status?: string
  priority?: string
  deadline?: string
  operateTime?: string
  applicant?: string
}

export const getWorkplaceSummary = () =>
  request.get<WorkplaceSummary>('/oa/workplace/summary')

export const getRecentTasks = (limit = 10) =>
  request.get<RecentTask[]>('/oa/workplace/recent-tasks', { params: { limit } })
