import React, { useCallback, useRef, useState } from 'react';
import type { FormUploadFieldRenderProps } from '@/components/FormRenderer';
import { WorkflowFormAttachment } from '@/components/workflow/WorkflowFormAttachment';
import type { WorkflowFormFileContext } from '@/services/api/workflow/form-files';
import { getCurrentUserSnapshot } from '@/utils/authStorage';

export function useWorkflowFormAttachments(context?: WorkflowFormFileContext) {
  const user = getCurrentUserSnapshot();
  const owner = JSON.stringify([user?.tenantId, user?.id, context?.definitionId, context?.instanceId, context?.taskId]);
  const current = useRef(owner); current.current = owner;
  const [pending, setPending] = useState<{ owner: string; uploads: Set<string> }>({ owner, uploads: new Set() });
  const renderUploadField = useCallback((props: FormUploadFieldRenderProps) => context?.definitionId || context?.instanceId
    ? <WorkflowFormAttachment key={`${owner}:${props.fieldPath}`} {...props} context={context} onBusyChange={(busy, uploadId) => {
      if (current.current !== owner) return;
      setPending((previous) => {
        const uploads = new Set(previous.owner === owner ? previous.uploads : []);
        if (busy) uploads.add(uploadId); else uploads.delete(uploadId);
        return { owner, uploads };
      });
    }} /> : <p role="status" className="text-xs text-cf-muted">请先读取当前流程的表单上下文。</p>, [owner]);
  return { renderUploadField, uploading: pending.owner === owner && pending.uploads.size > 0 };
}
