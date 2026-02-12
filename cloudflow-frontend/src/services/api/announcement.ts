import request from './request';
import { Announcement } from '../../types';

export const getMyAnnouncements = async (): Promise<Announcement[]> => {
  const data: any = await request.get('/oa/announcement/my-list');
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
  const data: any = await request.get('/oa/announcement/list');
  return Array.isArray(data) ? data : [];
};

// 获取管理列表（分页）
export const getManageList = async (params: {
  title?: string;
  type?: string;
  status?: string;
  page?: number;
  size?: number;
}): Promise<{ list: Announcement[]; total: number; page: number; size: number }> => {
  const data: any = await request.get('/oa/announcement/manage-list', { params });
  return data;
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
export const getReadStats = async (id: number): Promise<{ readCount: number; readUsers: any[] }> => {
  const data: any = await request.get(`/oa/announcement/read-stats/${id}`);
  return data;
};
