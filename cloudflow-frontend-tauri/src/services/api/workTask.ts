import request from './request';
import { WorkTask } from '../../types';

export interface WorkTaskStatusRequest {
  taskId: number;
  status: string;
}

/**
 * 获取工作任务列表
 * @param status 可选的状态筛选
 */
export const getWorkTasks = async (status?: string): Promise<WorkTask[]> => {
  return await request.get('/oa/work-task/list', { params: { status } });
};

/**
 * 获取工作任务详情
 * @param taskId 任务ID
 */
export const getWorkTaskDetail = async (taskId: string): Promise<WorkTask> => {
  return await request.get(`/oa/work-task/${taskId}`);
};

/**
 * 创建工作任务
 * @param task 任务数据
 */
export const createWorkTask = async (task: Partial<WorkTask>): Promise<boolean> => {
  return await request.post('/oa/work-task', task);
};

/**
 * 更新工作任务
 * @param task 任务数据
 */
export const updateWorkTask = async (task: Partial<WorkTask>): Promise<boolean> => {
  return await request.put('/oa/work-task', task);
};

/**
 * 更新工作任务状态
 * @param taskId 任务ID
 * @param status 新状态
 */
export const updateWorkTaskStatus = async (taskId: string, status: string): Promise<boolean> => {
  const data: WorkTaskStatusRequest = { taskId: Number(taskId), status };
  return await request.put('/oa/work-task/status', data);
};

/**
 * 删除工作任务
 * @param taskId 任务ID
 */
export const deleteWorkTask = async (taskId: string): Promise<boolean> => {
  return await request.delete(`/oa/work-task/${taskId}`);
};
