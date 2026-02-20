import request from './request';
import { Announcement } from '../../types';

/** 阅读统计中的用户信息 */
export interface ReadUser {
  userId: number;
  userName: string;
  nickName?: string;
  readTime?: string;
}

/** 阅读统计响应 */
export interface ReadStatsResponse {
  readCount: number;
  readUsers: ReadUser[];
}

/** 管理列表分页响应 */
export interface AnnouncementPageResult {
  list: Announcement[];
  total: number;
  page: number;
  size: number;
}

export const getMyAnnouncements = async (): Promise<Announcement[]> => {
  const data = await request.get<Announcement[]>('/oa/announcement/my-list');
  return Array.isArray(data) ? data : [];
};

export const markAnnouncementRead = async (id: string): Promise<boolean> => {
  await request.post(`/oa/announcement/read/${id}`);
  return true;
};

export const publishAnnouncement = async (data: Partial<Announcement>): Promise<boolean> => {
  await request.post('/oa/announcement/publish', data);
  return true;
};

export const getAnnouncementList = async (): Promise<Announcement[]> => {
  const data = await request.get<Announcement[]>('/oa/announcement/list');
  return Array.isArray(data) ? data : [];
};

// 获取管理列表（分页）
export const getManageList = async (params: {
  title?: string;
  type?: string;
  status?: string;
  page?: number;
  size?: number;
}): Promise<AnnouncementPageResult> => {
  return request.get<AnnouncementPageResult>('/oa/announcement/manage-list', { params });
};

// 编辑公告
export const updateAnnouncement = async (data: Partial<Announcement>): Promise<boolean> => {
  await request.put('/oa/announcement', data);
  return true;
};

// 删除公告
export const deleteAnnouncement = async (id: number): Promise<boolean> => {
  await request.delete(`/oa/announcement/${id}`);
  return true;
};

// 撤销公告
export const revokeAnnouncement = async (id: number): Promise<boolean> => {
  await request.post(`/oa/announcement/revoke/${id}`);
  return true;
};

// 切换置顶状态
export const toggleTop = async (id: number): Promise<boolean> => {
  await request.post(`/oa/announcement/toggle-top/${id}`);
  return true;
};

// 获取阅读统计
export const getReadStats = async (id: number): Promise<ReadStatsResponse> => {
  return request.get<ReadStatsResponse>(`/oa/announcement/read-stats/${id}`);
};
