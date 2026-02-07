import request from './request';
import { WorkTask } from '../../types';

export const getWorkTasks = async (status?: string): Promise<WorkTask[]> => {
  const res = await request.get('/oa/work-task/list', { params: { status } });
  return res.data;
};

export const getWorkTaskDetail = async (taskId: string): Promise<WorkTask> => {
  const res = await request.get(`/oa/work-task/${taskId}`);
  return res.data;
};

export const createWorkTask = async (task: Partial<WorkTask>): Promise<boolean> => {
  const res = await request.post('/oa/work-task', task);
  return res.data;
};

export const updateWorkTask = async (task: Partial<WorkTask>): Promise<boolean> => {
  const res = await request.put('/oa/work-task', task);
  return res.data;
};

export const updateWorkTaskStatus = async (taskId: string, status: string): Promise<boolean> => {
  const res = await request.put('/oa/work-task/status', { taskId, status });
  return res.data;
};

export const deleteWorkTask = async (taskId: string): Promise<boolean> => {
  const res = await request.delete(`/oa/work-task/${taskId}`);
  return res.data;
};
