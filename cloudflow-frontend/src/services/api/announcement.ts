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
