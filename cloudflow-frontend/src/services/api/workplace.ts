import request from './request';

/**
 * 工作台 API 服务
 */

// 工作台概览数据类型
export interface WorkplaceSummary {
  user: {
    name: string;
    department: string;
    avatar: string;
  };
  statistics: {
    pendingTasks: number;
    todaySchedules: number;
    unreadMessages: number;
  };
  stats?: WorkplaceStats;
  quickActions: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    path: string;
  }>;
  announcements: Array<{
    id: number;
    title: string;
    publishTime: string;
    isRead: boolean;
  }>;
  todayItems?: TodayItem[];
  riskItems?: RiskItem[];
  recentActivities?: ActivityItem[];
  serviceHealth?: Record<string, ServiceHealth>;
}

export interface WorkplaceStats {
  pendingTasks?: number;
  todaySchedules?: number;
  unreadMessages?: number;
  unreadAnnouncements?: number;
  openRisks?: number;
  recentActivities?: number;
}

export interface TodayItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  time?: string;
  status?: string;
  path?: string;
}

export interface RiskItem {
  id: number;
  businessType?: string;
  businessId?: number;
  title: string;
  level?: string;
  status?: string;
  ownerName?: string;
  path?: string;
}

export interface ActivityItem {
  id: string;
  type?: string;
  title: string;
  content?: string;
  operatorName?: string;
  eventTime?: string;
  path?: string;
}

export interface ServiceHealth {
  status: 'UP' | 'DOWN' | string;
  message?: string;
}

// 最近任务数据类型
export interface RecentTask {
  taskId: string;
  taskName: string;
  processInstanceId: string;
  processName: string;
  status: string;
  priority: string;
  deadline: string;
  operateTime: string;
  applicant: string;
}

/**
 * 获取工作台概览
 */
export const getWorkplaceSummary = async (): Promise<WorkplaceSummary> => {
  return request.get('/oa/workplace/summary') as Promise<WorkplaceSummary>;
};

/**
 * 获取最近任务
 */
export const getRecentTasks = async (limit: number = 10): Promise<RecentTask[]> => {
  return request.get('/oa/workplace/recent-tasks', {
    params: { limit }
  }) as Promise<RecentTask[]>;
};

/**
 * 获取工作台最近动态
 */
export const getWorkplaceTimeline = async (limit: number = 20): Promise<ActivityItem[]> => {
  return request.get('/oa/workplace/timeline', {
    params: { limit }
  }) as Promise<ActivityItem[]>;
};
