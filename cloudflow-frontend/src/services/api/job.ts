import request from './request';

export type JobStatus = 'ENABLED' | 'PAUSED';
export type JobTriggerType = 'CRON' | 'FIXED_RATE' | 'FIXED_DELAY';
export type JobMisfireStrategy = 'IGNORE' | 'FIRE_ONCE' | 'FIRE_ALL';
export type JobExecuteStatus =
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT'
  | 'SKIPPED'
  | 'DISPATCH_FAILED';

export interface PageResult<T> {
  rows: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface SysJob {
  jobId?: number;
  tenantId?: number;
  jobName: string;
  jobGroup: string;
  serviceName: string;
  handlerName: string;
  handlerParam?: string;
  triggerType: JobTriggerType;
  cronExpression?: string;
  intervalMs?: number;
  status: JobStatus;
  concurrentFlag: number;
  misfireStrategy: JobMisfireStrategy;
  retryCount: number;
  retryIntervalSec: number;
  dispatchRetryCount: number;
  dispatchRetryIntervalSec: number;
  timeoutSeconds: number;
  lockTimeSeconds: number;
  criticalFlag: number;
  logSuccessFlag: number;
  alarmOnFailFlag: number;
  alarmReceiver?: string;
  consecutiveFailCount?: number;
  lastFireTime?: string;
  nextFireTime?: string;
  remark?: string;
  createBy?: string;
  createTime?: string;
  updateBy?: string;
  updateTime?: string;
}

export type SysJobPayload = Omit<
  SysJob,
  | 'tenantId'
  | 'consecutiveFailCount'
  | 'lastFireTime'
  | 'nextFireTime'
  | 'createBy'
  | 'createTime'
  | 'updateBy'
  | 'updateTime'
> & {
  confirmCritical?: boolean;
};

export interface SysJobHandler {
  handlerId: number;
  serviceName: string;
  handlerName: string;
  handlerDesc?: string;
  status: 'ONLINE' | 'OFFLINE';
  lastReportTime?: string;
}

export interface SysJobLog {
  logId: number;
  tenantId?: number;
  jobId: number;
  jobName: string;
  handlerName: string;
  executeNo: string;
  triggerType: 'CRON' | 'MANUAL' | 'RETRY';
  triggerBy?: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  executeStatus: JobExecuteStatus;
  affectedRows?: number;
  resultMsg?: string;
  exceptionStack?: string;
  executorIp?: string;
  dispatcherIp?: string;
  dispatchRetryIndex: number;
  retryIndex: number;
  reportTime?: string;
  createTime?: string;
}

export interface JobQuery {
  jobName?: string;
  jobGroup?: string;
  serviceName?: string;
  status?: JobStatus | '';
  triggerType?: JobTriggerType | '';
  pageNum: number;
  pageSize: number;
}

export interface JobLogQuery {
  jobId?: number;
  handlerName?: string;
  executeStatus?: JobExecuteStatus | '';
  beginTime?: string;
  endTime?: string;
  pageNum: number;
  pageSize: number;
}

export interface CronValidateResult {
  valid: boolean;
  message: string;
  nextFireTimes: string[];
}

export interface JobTriggerResult {
  executeNo?: string;
  accepted: boolean;
  reason?: string;
}

const basePath = '/auth/system/job';

export const getJobList = (params: JobQuery) =>
  request.get<PageResult<SysJob>>(`${basePath}/list`, { params });

export const getJob = (jobId: number) => request.get<SysJob>(`${basePath}/${jobId}`);

export const getJobHandlers = (serviceName?: string) =>
  request.get<SysJobHandler[]>(`${basePath}/handlers`, {
    params: serviceName ? { serviceName } : undefined,
  });

export const addJob = (data: SysJobPayload) => request.post(basePath, data);

export const updateJob = (data: SysJobPayload) => request.put(basePath, data);

export const deleteJobs = (jobIds: number[], confirmCritical = false) =>
  request.delete(`${basePath}/${jobIds.join(',')}`, { params: { confirmCritical } });

export const triggerJob = (jobId: number, handlerParam?: string) =>
  request.post<JobTriggerResult>(
    `${basePath}/${jobId}/trigger`,
    handlerParam === undefined ? undefined : { handlerParam },
  );

export const toggleJob = (jobId: number, status: JobStatus, confirmCritical = false) =>
  request.put(`${basePath}/${jobId}/toggle`, { status, confirmCritical });

export const validateJobSchedule = (data: {
  cronExpression?: string;
  triggerType: JobTriggerType;
  intervalMs?: number;
}) => request.post<CronValidateResult>(`${basePath}/cron/validate`, data);

export const getJobLogList = (params: JobLogQuery) =>
  request.get<PageResult<SysJobLog>>(`${basePath}/log`, { params });

export const getJobLog = (logId: number) =>
  request.get<SysJobLog>(`${basePath}/log/${logId}`);

export const cleanJobLogs = (data: { beforeDate?: string; keepDays?: number }) =>
  request.delete<number>(`${basePath}/log/clean`, { data });
