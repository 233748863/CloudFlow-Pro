import request from './request';

export type ImSecretField = 'appKey' | 'appSecret' | 'token' | 'aesKey';
export interface ImSecretChange {
  action: 'KEEP' | 'REPLACE' | 'CLEAR';
  value?: string;
}

export interface ImSyncScope {
  localRootDeptId: number;
  remoteDepartmentIds: number[];
  primaryDepartments?: Record<string, number> | null;
}

export interface ImConfig {
  configId: number;
  imType: string;
  corpId: string;
  agentId: string;
  appKeyConfigured: boolean;
  appSecretConfigured: boolean;
  tokenConfigured: boolean;
  aesKeyConfigured: boolean;
  callbackUrl: string | null;
  expectedCallbackUrl: string | null;
  syncEnabled: boolean;
  syncCron: string | null;
  loginEnabled: boolean;
  messageEnabled: boolean;
  todoEnabled: boolean;
  syncScope: ImSyncScope | null;
  lastSyncTime: string | null;
  status: 'ENABLED' | 'DISABLED';
  version: number;
  updateTime: string;
}

export interface ImConfigSave extends Record<ImSecretField, ImSecretChange> {
  configId?: number;
  version?: number;
  imType: string;
  corpId: string;
  agentId: string;
  callbackUrl?: string | null;
  syncEnabled: boolean;
  syncCron: string | null;
  loginEnabled: boolean;
  messageEnabled: boolean;
  todoEnabled: boolean;
  syncScope: ImSyncScope | null;
  status: 'ENABLED' | 'DISABLED';
}

export interface ImOverview {
  deploymentEnabled: boolean;
  canConfigure: boolean;
  reason: string;
  providers: { type: string; name: string; implemented: boolean }[];
  page: { rows: ImConfig[]; total: number; pageNum: number; pageSize: number };
}

export interface ImTestResult {
  successful: boolean;
  reasonCode: string;
  message: string;
  elapsedMillis: number;
  version: number;
}

const base = '/auth/system/im/config';
export const listImConfigs = (query: { pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<ImOverview>(`${base}/list`, { params: query, signal, silent: true });
export const saveImConfig = (config: ImConfigSave) => config.configId
  ? request.put<ImConfig>(base, config, { silent: true })
  : request.post<ImConfig>(base, config, { silent: true });
export const testImConfig = (configId: number, version: number) =>
  request.post<ImTestResult>(`${base}/${configId}/test`, { version }, { silent: true });

export interface ImPage<T> { rows: T[]; total: number; pageNum: number; pageSize: number }
export interface ImTodoEntry { mappingId: number; taskId: string; receiverName: string | null; status: string; updateStatus: string; version: number; createTime: string }
export interface ImTodoOverview extends ImPage<ImTodoEntry> { enabled: boolean }
export const listImTodos = (configId: number, pageNum: number, signal?: AbortSignal) =>
  request.get<ImTodoOverview>('/auth/system/im/todo/list', { params: { configId, pageNum, pageSize: 10 }, signal, silent: true });
export const reconcileImTodo = (entry: ImTodoEntry) =>
  request.post<{ changed: boolean; entry: ImTodoEntry }>('/auth/system/im/todo/reconcile', { mappingId: entry.mappingId, version: entry.version }, { silent: true, timeout: 60000 });
export interface ImDepartmentOption { id: number; parentId: number; name: string }
export interface ImRemoteDepartments { configId: number; version: number; departments: ImDepartmentOption[] }
export const listImLocalDepartments = (query: { keyword: string; pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<ImPage<ImDepartmentOption>>(`${base}/local-departments`, { params: query, signal, silent: true });
export const readImRemoteDepartments = (configId: number, version: number, signal?: AbortSignal) =>
  request.post<ImRemoteDepartments>(`${base}/${configId}/remote-departments`, { version }, { signal, silent: true, timeout: 300000 });

export interface ImSyncConfiguration { configId: number; corpId: string; agentId: string; status: string; version: number; scope: ImSyncScope | null }
export interface ImSyncOverview { deploymentEnabled: boolean; canConfigure: boolean; reason: string; configurations: ImSyncConfiguration[] }
export interface ImSyncHeader { syncRunId: number; configId: number; configVersion: number; status: string; fullSnapshot: boolean; requestedBy: number; createdAt: string; mode?: 'PREVIEW' | 'APPLY' }
export type ImSyncAction = 'CREATE' | 'UPDATE' | 'DISABLE' | 'UNCHANGED' | 'RELEASE' | 'SKIP' | 'CONFLICT';
export interface ImSyncEntry { kind: string; externalId: string; localId: number | null; action: ImSyncAction; reasons: string[]; before: Record<string, string>; after: Record<string, string>; processed?: boolean }
export interface ImSyncSummary { departmentsCreated: number; departmentsUpdated: number; departmentsUnchanged: number; departmentConflicts: number;
  usersCreated: number; usersUpdated: number; usersDisabled: number; usersUnchanged: number; userConflicts: number }
export interface ImSyncProgress { processed: number; total: number; remaining: number; effectsPending: boolean; actual: ImSyncSummary }
export interface ImSyncResult { runId: number; status: string; progress: ImSyncProgress; recoveryReason: string | null }
export interface ImSyncReport { header: ImSyncHeader; hash: string; configurationChanged: boolean; failureCode: string | null; summary: ImSyncSummary | null; entries: ImPage<ImSyncEntry>; progress?: ImSyncProgress | null }
export const applyImSync = (runId: number, version: number, hash: string) =>
  request.post<ImSyncResult>(`/auth/system/im/sync/${runId}/apply`, { version, hash }, { silent: true, timeout: 300000 });
export const getImSyncOverview = (signal?: AbortSignal) => request.get<ImSyncOverview>('/auth/system/im/sync/configurations', { signal, silent: true });
export const listImSyncRuns = (query: { configId: number; pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<ImPage<ImSyncHeader>>('/auth/system/im/sync/list', { params: query, signal, silent: true });
export const getImSyncReport = (syncRunId: number, query: { pageNum: number; pageSize: number }, signal?: AbortSignal) =>
  request.get<ImSyncReport>(`/auth/system/im/sync/${syncRunId}`, { params: query, signal, silent: true });
export const previewImSync = (configId: number, version: number) =>
  request.post<ImSyncReport>(`${base}/${configId}/sync-preview`, { version }, { silent: true, timeout: 300000 });
