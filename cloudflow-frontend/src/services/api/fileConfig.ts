import request from './request';

export type FileStorageType = 'LOCAL' | 'OSS' | 'MINIO' | 'S3' | 'COS';

export interface FileStorageConfig {
  configId?: number;
  configCode: string;
  configName: string;
  storageType: FileStorageType;
  masterFlag: number;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  basePath?: string;
  domain?: string;
  maxFileSize: number;
  allowedExtensions?: string;
  signedUrlExpireSeconds: number;
  accessPolicy: string;
  status: 'ENABLED' | 'DISABLED';
  remark?: string;
  version?: number;
}

const base = '/auth/system/file/config';
export const listFileConfigs = (query: { pageNum: number; pageSize: number }) =>
  request.get(`${base}/list`, { params: query }) as Promise<{ rows: FileStorageConfig[]; total: number }>;
export const saveFileConfig = (config: FileStorageConfig) => (config.configId
  ? request.put(base, config) : request.post(base, config)) as Promise<FileStorageConfig>;
export const removeFileConfig = (configId: number) => request.delete(`${base}/${configId}`);
export const testFileConfig = (configId: number) => request.post(`${base}/${configId}/test`);
