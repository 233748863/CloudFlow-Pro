import request from './request';
import { WorkTask } from '../../types';

export const getWorkTasks = async (status?: string): Promise<WorkTask[]> => {
  const res = await request.get('/workflow/work-task/list', { params: { status } });
  return res.data;
};

export const getWorkTaskDetail = async (taskId: string): Promise<WorkTask> => {
  const res = await request.get(`/workflow/work-task/${taskId}`);
  return res.data;
};

export const createWorkTask = async (task: Partial<WorkTask>): Promise<boolean> => {
  const res = await request.post('/workflow/work-task', task);
  return res.data;
};

export const updateWorkTask = async (task: Partial<WorkTask>): Promise<boolean> => {
  const res = await request.put('/workflow/work-task', task);
  return res.data;
};

export const updateWorkTaskStatus = async (taskId: string, status: string): Promise<boolean> => {
  const res = await request.put('/workflow/work-task/status', { taskId, status });
  return res.data;
};

export const deleteWorkTask = async (taskId: string): Promise<boolean> => {
  const res = await request.delete(`/workflow/work-task/${taskId}`);
  return res.data;
};
