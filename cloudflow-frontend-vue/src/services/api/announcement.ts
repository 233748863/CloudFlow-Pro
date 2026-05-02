import request from './request'
import type { Announcement } from '@/types'

export const getMyAnnouncements = async (): Promise<Announcement[]> => {
  const data = await request.get<Announcement[]>('/oa/announcement/my-list')
  return Array.isArray(data) ? data : []
}

export const markAnnouncementRead = async (id: string | number): Promise<boolean> => {
  await request.post(`/oa/announcement/read/${id}`)
  return true
}
