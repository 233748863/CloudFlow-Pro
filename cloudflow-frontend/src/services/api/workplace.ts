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
