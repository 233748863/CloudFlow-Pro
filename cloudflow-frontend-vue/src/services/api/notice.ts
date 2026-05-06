import request from './request'
import type { PageResult } from '@/types'

export interface Notice {
  id: number
  title: string
  content: string
  type: string
  createTime: string
  isRead: boolean
  sender?: string
}

export interface NoticePageQuery {
  pageNum?: number
  pageSize?: number
}

export const getNoticeList = (params?: NoticePageQuery) =>
  request.get<PageResult<Notice>>('/oa/notice/list', { params })

export const markNoticeRead = (noticeId: number) =>
  request.post<boolean>(`/oa/notice/read/${noticeId}`)

export const deleteNotice = (noticeId: number) =>
  request.delete<boolean>(`/oa/notice/${noticeId}`)

export const getUnreadCount = () =>
  request.get<number>('/oa/notice/unread-count')
