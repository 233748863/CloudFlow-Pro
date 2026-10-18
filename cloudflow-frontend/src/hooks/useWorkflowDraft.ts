import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  deleteWorkflowDraft,
  getDraftLaunchContext,
  getWorkflowDraft,
  getWorkflowDraftByDefinition,
  saveWorkflowDraft,
  startWorkflowDraft,
  type DraftContent,
  type DraftStartResult,
} from '@/services/api/workflow/draft';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import { createInitialDraftState, WorkflowDraftSession, type WorkflowDraftAccess } from './workflowDraftSession';

export const workflowDraftIdentity = (user: { id?: string | number; userId?: string | number; tenantId?: string | number | null } | null) =>
  user ? `${user.tenantId ?? ''}:${user.id ?? user.userId ?? ''}` : '';

interface UseWorkflowDraftOptions {
  identity: string;
  definitionId: string;
  draftId?: string;
  access: WorkflowDraftAccess;
  onChanged?: () => void;
  onSubmitted?: (result: DraftStartResult) => void;
  onPermissionUnavailable?: () => void;
}

export function useWorkflowDraft(options: UseWorkflowDraftOptions) {
  const [state, setState] = useState(createInitialDraftState);
  const [reloadKey, setReloadKey] = useState(0);
  const sessionRef = useRef<WorkflowDraftSession | null>(null);
  const callbacks = useRef(options);
  callbacks.current = options;
  const { identity, definitionId, draftId, access } = options;

  useLayoutEffect(() => {
    const session = new WorkflowDraftSession({
      definitionId,
      draftId,
      access,
      api: { context: getDraftLaunchContext, byDefinition: getWorkflowDraftByDefinition, detail: getWorkflowDraft, save: saveWorkflowDraft, remove: deleteWorkflowDraft, start: startWorkflowDraft },
      isCurrent: () => sessionRef.current === session && workflowDraftIdentity(getCurrentUserSnapshot()) === identity,
      onChanged: () => callbacks.current.onChanged?.(),
      onSubmitted: (result) => callbacks.current.onSubmitted?.(result),
      onPermissionUnavailable: () => callbacks.current.onPermissionUnavailable?.(),
    });
    sessionRef.current = session;
    setState(session.getState());
    const unsubscribe = session.subscribe(() => setState(session.getState()));
    void session.initialize();
    return () => {
      unsubscribe();
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [identity, definitionId, draftId, reloadKey]);

  useLayoutEffect(() => {
    sessionRef.current?.updateAccess(access);
  }, [access.view, access.save, access.submit, access.remove]);

  const hasUnsavedChanges = state.dirty || state.saving || state.confirmingSave;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUnsavedChanges]);

  return {
    state,
    hasUnsavedChanges,
    change: (patch: Partial<DraftContent>) => sessionRef.current?.change(patch),
    save: () => sessionRef.current?.save(),
    submit: () => sessionRef.current?.submit(),
    restore: () => sessionRef.current?.restore(),
    deletePending: () => sessionRef.current?.deletePending(),
    dispose: () => sessionRef.current?.dispose(),
    retry: () => { if (state.phase === 'failed' && !hasUnsavedChanges) setReloadKey((value) => value + 1); },
  };
}
