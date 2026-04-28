import request from './request';

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

export const getWorkplaceSummary = async (): Promise<WorkplaceSummary> =>
  request.get('/oa/workplace/summary') as Promise<WorkplaceSummary>;
