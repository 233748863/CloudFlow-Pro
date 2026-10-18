import type { AxiosRequestConfig } from 'axios';
import request from '../request';
import {
  decodeDraftResponse,
  type DraftDetailVO,
  type DraftLaunchContextVO,
  type DraftListQuery,
  type DraftPageResult,
  type DraftReferencePageResult,
  type DraftReferenceQuery,
  type DraftSaveRequest,
  type DraftSaveResult,
  type DraftStartRequest,
  type DraftStartResult,
  type DraftSummaryVO,
} from './draftTypes';

export * from './draftTypes';

const draftConfig = (signal?: AbortSignal): AxiosRequestConfig => ({
  signal,
  silent: true,
  transformResponse: [(data, _headers, status) => decodeDraftResponse(data, status)],
});

export const getDraftLaunchContext = (definitionId: string, signal?: AbortSignal) =>
  request.get<DraftLaunchContextVO>(`/workflow/wf/draft/context/${encodeURIComponent(definitionId)}`, draftConfig(signal));

export const getDraftReferenceOptions = (definitionId: string, fieldId: string, params: DraftReferenceQuery, signal?: AbortSignal) =>
  request.get<DraftReferencePageResult>(`/workflow/wf/draft/context/${encodeURIComponent(definitionId)}/references/${encodeURIComponent(fieldId)}`, { ...draftConfig(signal), params });

export const saveWorkflowDraft = (data: DraftSaveRequest, signal?: AbortSignal) =>
  request.post<DraftSaveResult>('/workflow/wf/draft', data, draftConfig(signal));

export const getWorkflowDrafts = (params: DraftListQuery, signal?: AbortSignal) =>
  request.get<DraftPageResult>('/workflow/wf/draft/list', { ...draftConfig(signal), params });

export const getWorkflowDraftByDefinition = (definitionId: string, signal?: AbortSignal) =>
  request.get<DraftSummaryVO | null>(`/workflow/wf/draft/by-definition/${encodeURIComponent(definitionId)}`, draftConfig(signal));

export const getWorkflowDraft = (draftId: string, signal?: AbortSignal) =>
  request.get<DraftDetailVO>(`/workflow/wf/draft/${encodeURIComponent(draftId)}`, draftConfig(signal));

export const deleteWorkflowDraft = (draftId: string, expectedVersion: number, signal?: AbortSignal) =>
  request.delete<void>(`/workflow/wf/draft/${encodeURIComponent(draftId)}`, { ...draftConfig(signal), params: { expectedVersion } });

export const startWorkflowDraft = (data: DraftStartRequest, signal?: AbortSignal) =>
  request.post<DraftStartResult>('/workflow/wf/start', { draftId: data.draftId, expectedVersion: data.expectedVersion }, draftConfig(signal));
