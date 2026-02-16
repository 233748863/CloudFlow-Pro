import request from './request';
import { MeetingRoom, SysScheduleEvent } from '../../types';

// 会议室 - 增删改查
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

// 日程事件
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

/**
 * 获取会议室一周的预订（周视图日历用）
 */
export const getRoomWeekEvents = async (roomId: string, weekStart: string): Promise<SysScheduleEvent[]> => {
  return request.get(`/oa/schedule/room/${roomId}/week`, { params: { weekStart } }) as unknown as Promise<SysScheduleEvent[]>;
};

/**
 * 获取我的会议室预订记录
 */
export const getMyBookings = async (status?: 'upcoming' | 'past'): Promise<SysScheduleEvent[]> => {
  return request.get('/oa/schedule/my-bookings', { params: status ? { status } : {} }) as unknown as Promise<SysScheduleEvent[]>;
};

/**
 * 取消预订
 */
export const cancelBooking = async (id: number): Promise<boolean> => {
  return request.put(`/oa/schedule/cancel/${id}`) as unknown as Promise<boolean>;
};

/**
 * 会议室使用统计
 */
export interface RoomUsageStats {
  roomId: number;
  roomName: string;
  bookingCount: number;
  totalMinutes: number;
  usedDays: number;
}

export const getRoomUsageStats = async (startDate?: string, endDate?: string): Promise<RoomUsageStats[]> => {
  return request.get('/oa/schedule/room-stats', { 
    params: { 
      ...(startDate && { startDate }), 
      ...(endDate && { endDate }) 
    } 
  }) as unknown as Promise<RoomUsageStats[]>;
};
