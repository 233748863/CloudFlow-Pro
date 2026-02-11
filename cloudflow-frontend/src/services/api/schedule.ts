import request from './request';
import { MeetingRoom, SysScheduleEvent } from '../../types';

// Meeting Rooms - CRUD
export const getMeetingRooms = async (): Promise<MeetingRoom[]> => {
  return request.get('/oa/meeting-room/list') as unknown as Promise<MeetingRoom[]>;
};

export const getMeetingRoomById = async (id: string): Promise<MeetingRoom> => {
  return request.get(`/oa/meeting-room/${id}`) as unknown as Promise<MeetingRoom>;
};

export const createMeetingRoom = async (room: Partial<MeetingRoom>): Promise<boolean> => {
  return request.post('/oa/meeting-room', room) as unknown as Promise<boolean>;
};

export const updateMeetingRoom = async (room: MeetingRoom): Promise<boolean> => {
  return request.put('/oa/meeting-room', room) as unknown as Promise<boolean>;
};

export const deleteMeetingRoom = async (id: string): Promise<boolean> => {
  return request.delete(`/oa/meeting-room/${id}`) as unknown as Promise<boolean>;
};

// Room Events - 查询会议室的预订记录（所有人可见）
export const getRoomEvents = async (roomId: string, date?: string): Promise<SysScheduleEvent[]> => {
  return request.get(`/oa/schedule/room/${roomId}`, { params: date ? { date } : {} }) as unknown as Promise<SysScheduleEvent[]>;
};

// 用户列表 - 用于参与人选择
export interface UserBriefItem {
  userId: number;
  userName: string;
  nickName: string;
  email?: string;
  deptId?: number;
  deptName?: string;
}

export const getUserListForAttendees = async (): Promise<UserBriefItem[]> => {
  return request.get('/auth/system/user/list') as unknown as Promise<UserBriefItem[]>;
};

// 部门树 - 用于组织架构选择
export interface DeptTreeItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum?: number;
  children?: DeptTreeItem[];
}

export const getDeptTree = async (): Promise<DeptTreeItem[]> => {
  return request.get('/auth/system/dept/tree') as unknown as Promise<DeptTreeItem[]>;
};

// Schedule Events
export const getMyEvents = async (start: string, end: string): Promise<SysScheduleEvent[]> => {
  return request.get('/oa/schedule/my-events', { params: { start, end } }) as unknown as Promise<SysScheduleEvent[]>;
};

export const createEvent = async (event: Partial<SysScheduleEvent>): Promise<boolean> => {
  return request.post('/oa/schedule', event) as unknown as Promise<boolean>;
};

export const deleteEvent = async (id: string): Promise<boolean> => {
  return request.delete(`/oa/schedule/${id}`) as unknown as Promise<boolean>;
};

/**
 * 获取今日日程
 */
export const getTodaySchedule = async (): Promise<SysScheduleEvent[]> => {
  return request.get('/oa/schedule/today') as unknown as Promise<SysScheduleEvent[]>;
};
