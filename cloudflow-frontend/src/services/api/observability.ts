import request from './request';

export type ErrorStatus = 'TODO' | 'PROCESSING' | 'DONE' | 'IGNORED';
export interface LogPage<Row> { rows: Row[]; total: number; pageNum: number; pageSize: number }
export interface ApiErrorLog {
  errorId: number; traceId?: string; serviceName?: string; userName?: string;
  requestMethod?: string; requestUrl?: string; requestParams?: string;
  exceptionClass?: string; exceptionMessage?: string; exceptionStack?: string;
  clientIp?: string; occurTime: string; processStatus: ErrorStatus;
  processBy?: string; processTime?: string; processRemark?: string;
}
export interface ErrorQuery {
  pageNum: number; pageSize: number; serviceName?: string; exceptionClass?: string;
  status?: string; traceId?: string; start?: string; end?: string;
}
export interface RequestLog {
  logId: number; serviceName?: string; requestMethod?: string; requestUrl?: string;
  durationMs?: number; resultCode?: number; slowFlag?: number; params?: string; createTime: string;
}
export interface FrontendLog {
  id: number; message: string; stack?: string; componentStack?: string;
  context?: string; url?: string; level: string; createTime: string;
}
export interface TraceBundle {
  traceId: string; operations: LogPage<RequestLog>; errors: LogPage<ApiErrorLog>; frontend: LogPage<FrontendLog>;
}
export interface SlowEndpoint {
  serviceName: string; requestMethod: string; requestUrl: string; requestCount: number;
  slowCount: number; averageDuration: number; maximumDuration: number;
}
export interface ErrorTrend { date: string; errorCount: number }
const base = '/auth/system/log';
export const listApiErrors = (query: ErrorQuery) => request.get(`${base}/error/list`, { params: query }) as Promise<LogPage<ApiErrorLog>>;
export const getApiError = (errorId: number) => request.get(`${base}/error/${errorId}`) as Promise<ApiErrorLog>;
export const processApiError = (errorId: number, expectedStatus: ErrorStatus, status: ErrorStatus, remark: string) =>
  request.post(`${base}/error/${errorId}/process`, { expectedStatus, status, remark });
export const getLogTrace = (traceId: string, pageNum = 1, pageSize = 100) =>
  request.get(`${base}/trace/${encodeURIComponent(traceId)}`, { params: { pageNum, pageSize } }) as Promise<TraceBundle>;
export const getSlowEndpoints = (start?: string, end?: string, sort = 'duration') =>
  request.get(`${base}/slow/top`, { params: { start, end, sort } }) as Promise<SlowEndpoint[]>;
export const getErrorTrend = (start?: string, end?: string) =>
  request.get(`${base}/error/trend`, { params: { start, end } }) as Promise<ErrorTrend[]>;
