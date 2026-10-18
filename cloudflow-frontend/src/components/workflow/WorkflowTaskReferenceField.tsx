import React, { useCallback } from 'react';
import type { FormReferenceFieldRenderProps } from '@/components/FormRenderer';
import { WorkflowDraftReferenceField } from './drafts/WorkflowDraftReferenceField';
import { getTaskReferenceOptions } from '@/services/api/workflow/task-references';
import type { DraftReferenceQuery } from '@/services/api/workflow/draftTypes';

interface Props extends FormReferenceFieldRenderProps {
  identity: string;
  taskId: string;
  formVersionKey: string;
  enabled: boolean;
}

export const WorkflowTaskReferenceField: React.FC<Props> = ({ identity, taskId, formVersionKey, enabled, ...props }) => {
  const loadOptions = useCallback((fieldPath: string, query: DraftReferenceQuery, signal: AbortSignal) =>
    getTaskReferenceOptions(taskId, fieldPath, query, signal), [taskId]);
  return <WorkflowDraftReferenceField {...props} identity={identity} definitionId={taskId}
    contextHash={formVersionKey} enabled={enabled} loadOptions={loadOptions} />;
};
