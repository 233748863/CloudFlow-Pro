import request from './request';

export const dataSourceServices = {
  'cloudflow-auth': '认证服务',
  'cloudflow-service-hr': '人力资源服务',
  'cloudflow-service-oa': '办公协同服务',
  'cloudflow-service-crm': '客户管理服务',
  'cloudflow-service-workflow': '工作流服务',
} as const;

export interface DataSourceInstance {
  serviceName: string;
  instanceKey: string;
  appliedVersion: number;
  status: 'ACTIVE' | 'DISABLED' | 'FAILED' | 'STALE';
  errorCode?: string;
  checkedTime: string;
}

export interface DataSourceConfig {
  configId: number;
  configName: string;
  dsKey: string;
  url: string;
  username: string;
  passwordConfigured: boolean;
  initSize: number;
  maxActive: number;
  targetServices: string[];
  status: 'ENABLED' | 'DISABLED';
  remark?: string;
  version: number;
  updateTime: string;
  instances: DataSourceInstance[];
}

export interface DataSourceOverview {
  configured: boolean;
  accountVerificationReady: boolean;
  message: string;
  allowedServices: string[];
  page: { rows: DataSourceConfig[]; total: number; pageNum: number; pageSize: number };
}

export interface DataSourceSave {
  configId?: number;
  version?: number;
  configName: string;
  dsKey: string;
  url: string;
  username: string;
  password?: string;
  secretAction: 'KEEP' | 'REPLACE' | 'CLEAR';
  maxActive: number;
  targetServices: string[];
  remark?: string;
}

export interface DataSourceTest {
  successful: boolean;
  errorCode?: string;
  message: string;
  elapsedMillis: number;
}

const base = '/auth/system/data-source';
export const listDataSources = (query: { pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<DataSourceOverview>(`${base}/list`, { params: query, signal, silent: true });
export const readDataSource = (configId: number, signal?: AbortSignal) =>
  request.get<DataSourceConfig>(`${base}/${configId}`, { signal, silent: true });
export const saveDataSource = (config: DataSourceSave) => config.configId
  ? request.put<DataSourceConfig>(base, config, { silent: true })
  : request.post<DataSourceConfig>(base, config, { silent: true });
export const testDataSource = (configId: number, version: number) =>
  request.post<DataSourceTest>(`${base}/${configId}/test`, { version }, { silent: true });
export const applyDataSource = (configId: number, version: number, confirmation: string, targetServices: string[]) =>
  request.post<DataSourceConfig>(`${base}/${configId}/register`, { version, confirmation, targetServices }, { silent: true });
export const disableDataSource = (configId: number, version: number, confirmation: string) =>
  request.post<DataSourceConfig>(`${base}/${configId}/disable`, { version, confirmation }, { silent: true });
