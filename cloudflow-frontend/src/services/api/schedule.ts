import request from './request';
import { MeetingRoom, SysScheduleEvent } from '../../types';

// Meeting Rooms
export const getMeetingRooms = async (): Promise<MeetingRoom[]> => {
  const res = await request.get('/workflow/meeting-room/list');
  return res.data;
};

// Schedule Events
export const getMyEvents = async (start: string, end: string): Promise<SysScheduleEvent[]> => {
  const res = await request.get('/workflow/schedule/my-events', { params: { start, end } });
  return res.data;
};

export const createEvent = async (event: Partial<SysScheduleEvent>): Promise<boolean> => {
  const res = await request.post('/workflow/schedule', event);
  return res.data;
};

export const deleteEvent = async (id: string): Promise<boolean> => {
  const res = await request.delete(`/workflow/schedule/${id}`);
  return res.data;
};
