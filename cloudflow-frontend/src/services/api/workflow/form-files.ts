import request from '../request';
import { downloadAuthorizedFile } from '../file';

export interface WorkflowFormFileContext {
  definitionId?: string;
  instanceId?: string;
  taskId?: string;
}

export interface WorkflowFormFile {
  fileId: string;
  fileName: string;
  size: number;
  extension: string;
}

export function uploadWorkflowFormFile(file: File, context: WorkflowFormFileContext, fieldPath: string, signal?: AbortSignal): Promise<WorkflowFormFile> {
  const body = new FormData();
  body.append('file', file);
  return request.post('/workflow/wf/form-files', body, { params: { ...context, fieldPath }, headers: { 'Content-Type': 'multipart/form-data' }, signal, silent: true, timeout: 60000 });
}

export function getWorkflowFormFile(fileId: string, context: WorkflowFormFileContext, fieldPath: string, signal?: AbortSignal): Promise<WorkflowFormFile> {
  return request.get(`/workflow/wf/form-files/${encodeURIComponent(fileId)}`, { params: { ...context, fieldPath }, signal, silent: true });
}

export function downloadWorkflowFormFile(fileId: string, context: WorkflowFormFileContext, fieldPath: string, signal?: AbortSignal): Promise<Blob> {
  return downloadAuthorizedFile({ bizType: 'WORKFLOW_FORM', bizId: context.instanceId ?? context.definitionId, fileId, ...context, fieldPath }, signal ?? new AbortController().signal);
}
