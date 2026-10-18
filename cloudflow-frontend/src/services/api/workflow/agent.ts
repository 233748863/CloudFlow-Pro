import request from '../request';

export type AgentMode = 'AGENT' | 'AGENT_ASSIST';

export interface AgentSettingInput {
  agentUserId: string;
  agentMode: AgentMode;
  definitionIds: string[];
  startTime: string;
  endTime: string;
  reason?: string;
  version?: number;
}

export interface AgentSetting extends Omit<AgentSettingInput, 'version'> {
  settingId: string;
  agentUserName: string;
  status: 'ACTIVE' | 'DISABLED';
  effectiveStatus: 'SCHEDULED' | 'EFFECTIVE' | 'EXPIRED' | 'DISABLED';
  version: number;
  affectedTaskIds: string[];
}

export interface AgentDefinitionOption {
  definitionId: string;
  processName: string;
  version: number;
}

interface AgentPage<Type> {
  rows: Type[];
  total: number;
}

export interface AgentSettingPreview extends AgentPage<{ taskId: string; nodeName: string; allowed: boolean; reason: string }> {
  evaluatedAt: string;
  effectiveStatus: AgentSetting['effectiveStatus'];
  pageNum: number;
  pageSize: number;
}

export const getAgentSettings = (pageNum: number, pageSize: number, status?: 'ACTIVE' | 'DISABLED', signal?: AbortSignal) =>
  request.get<AgentPage<AgentSetting>>('/workflow/agent-setting/mine', { params: { pageNum, pageSize, status }, signal });

export async function getAgentDefinitions(signal?: AbortSignal): Promise<AgentDefinitionOption[]> {
  const options: AgentDefinitionOption[] = [];
  let pageNum = 1;
  while (!signal?.aborted) {
    const page = await request.get<AgentPage<AgentDefinitionOption>>('/workflow/agent-setting/definitions', { params: { pageNum, pageSize: 100 }, signal });
    options.push(...page.rows);
    if (!page.rows.length || options.length >= page.total) break;
    pageNum += 1;
  }
  return options;
}

export const readLatestAgentSetting = (settingId: string, signal?: AbortSignal) =>
  request.get<AgentSetting>(`/workflow/agent-setting/mine/${encodeURIComponent(settingId)}`, { signal });

export const previewAgentSetting = (settingId: string | undefined, input: AgentSettingInput, pageNum: number, signal?: AbortSignal) =>
  request.post<AgentSettingPreview>('/workflow/agent-setting/preview', input, { params: { settingId, pageNum, pageSize: 20 }, signal, silent: true });

export const saveAgentSetting = (settingId: string | undefined, input: AgentSettingInput, signal?: AbortSignal) =>
  settingId
    ? request.put<AgentSetting>(`/workflow/agent-setting/${encodeURIComponent(settingId)}`, input, { signal })
    : request.post<AgentSetting>('/workflow/agent-setting', input, { signal });

export const disableAgentSetting = (settingId: string, version: number, signal?: AbortSignal) =>
  request.delete<void>(`/workflow/agent-setting/${encodeURIComponent(settingId)}`, { params: { version }, signal });

export const assistAgentTask = (taskId: string, version: number, comment: string, signal?: AbortSignal) =>
  request.post<string>('/workflow/enhance/task/agent-assist', { taskId, version, comment }, { signal });

export const returnAgentTask = (taskId: string, version: number, reason: string, signal?: AbortSignal) =>
  request.post<{ taskId: string; version: number }>('/workflow/enhance/task/agent-return', { taskId, version, reason }, { signal });
