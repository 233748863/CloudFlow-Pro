import request from './request';
import { Announcement } from '../../types';

export const getMyAnnouncements = async (): Promise<Announcement[]> => {
  const res = await request.get('/oa/announcement/my-list');
  return res.data;
};

export const markAnnouncementRead = async (id: string): Promise<boolean> => {
  const res = await request.post(`/oa/announcement/read/${id}`);
  return res.data;
};

export const publishAnnouncement = async (data: Partial<Announcement>): Promise<boolean> => {
  const res = await request.post('/oa/announcement/publish', data);
  return res.data;
};

export const getAnnouncementList = async (): Promise<Announcement[]> => {
    const res = await request.get('/oa/announcement/list');
    return res.data;
};
