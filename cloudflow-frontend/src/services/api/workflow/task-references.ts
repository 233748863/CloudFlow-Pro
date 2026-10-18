import request from '../request';
import { decodeDraftResponse, type DraftReferencePageResult, type DraftReferenceQuery } from './draftTypes';

export const getTaskReferenceOptions = (taskId: string, fieldId: string, params: DraftReferenceQuery, signal?: AbortSignal) =>
  request.get<DraftReferencePageResult>(`/workflow/wf/task/${encodeURIComponent(taskId)}/form-references/${encodeURIComponent(fieldId)}`, {
    params, signal, silent: true,
    transformResponse: [(data, _headers, status) => decodeDraftResponse(data, status)],
  });
