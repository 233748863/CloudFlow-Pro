import request from './request';
import { contactApi } from './contact';
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
  const result = await contactApi.list({ pageNum: 1, pageSize: 500 });
  const records = Array.isArray(result?.records) ? result.records : [];
  return records.map((item: any) => ({
    userId: Number(item.user_id ?? item.userId ?? 0),
    userName: String(item.user_name ?? item.userName ?? ''),
    nickName: String(item.nick_name ?? item.nickName ?? item.user_name ?? item.userName ?? ''),
    email: item.email ?? undefined,
    deptId: item.dept_id ?? item.deptId ?? undefined,
    deptName: item.dept_name ?? item.deptName ?? undefined,
  }));
};

// 部门树 - 用于组织架构选择
export interface DeptTreeItem {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum?: number;
  children?: DeptTreeItem[];
}

const buildDeptTree = (items: DeptTreeItem[], parentId = 0): DeptTreeItem[] => {
  return items
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0))
    .map((item) => ({
      ...item,
      children: buildDeptTree(items, item.deptId),
    }));
};

export const getDeptTree = async (): Promise<DeptTreeItem[]> => {
  const result = await contactApi.deptTree();
  const records = Array.isArray(result) ? result : [];
  const flatItems: DeptTreeItem[] = records.map((item: any) => ({
    deptId: Number(item.dept_id ?? item.deptId ?? 0),
    parentId: Number(item.parent_id ?? item.parentId ?? 0),
    deptName: String(item.dept_name ?? item.deptName ?? ''),
    orderNum: Number(item.order_num ?? item.orderNum ?? 0),
  }));
  return buildDeptTree(flatItems);
};

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
