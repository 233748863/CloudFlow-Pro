import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText, Save, Send } from 'lucide-react';
import { useBlocker } from 'react-router-dom';
import { BaseDialog, Button, ConfirmDialog, EmptyState, Input, LoadingSpinner } from '@/components/common';
import { SelectorShell } from '@/components/common/SelectorShell';
import { invalidateSelectorCache } from '@/components/common/selectorCache';
import { FormRenderer, type FormReferenceFieldRenderProps, type FormRendererHandle } from '@/components/FormRenderer';
import { useWorkflowDraft, workflowDraftIdentity } from '@/hooks/useWorkflowDraft';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import type { WorkflowDraftAccess } from '@/hooks/workflowDraftSession';
import { draftUnavailableMessage, type DraftStartResult } from '@/services/api/workflow/draftTypes';
import { WorkflowDraftReferenceField } from './WorkflowDraftReferenceField';
import { useWorkflowFormAttachments } from '@/hooks/useWorkflowFormAttachments';

interface WorkflowDraftEditorProps {
  identity: string;
  definitionId: string;
  definitionName: string;
  draftId?: string;
  draftCount?: number;
  access: WorkflowDraftAccess;
  onClose: () => void;
  onChanged?: () => void;
  onSubmitted?: (result: DraftStartResult) => void;
  onPermissionUnavailable?: () => void;
  onOpenDrafts?: () => void;
}

export const WorkflowDraftEditor: React.FC<WorkflowDraftEditorProps> = (props) => {
  const allowLeave = useRef(false);
  const draft = useWorkflowDraft({ ...props, onSubmitted: (result) => { allowLeave.current = true; props.onSubmitted?.(result); } });
  const { state } = draft;
  const attachments = useWorkflowFormAttachments({ definitionId: props.definitionId });
  useLayoutEffect(() => { invalidateSelectorCache(); }, [props.identity]);
  const formRef = useRef<FormRendererHandle>(null);
  const exitAction = useRef<(() => void) | undefined>(undefined);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowLeave.current
    && workflowDraftIdentity(getCurrentUserSnapshot()) === props.identity
    && (draft.hasUnsavedChanges || state.submitting || state.confirmingSubmission || attachments.uploading)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const leaving = confirmClose || blocker.state === 'blocked';
  const context = state.context;
  const pendingReason = state.pendingDraft ? draftUnavailableMessage(state.pendingDraft) : null;
  const busy = state.submitting || state.restoring;
  const locked = state.phase !== 'ready' || busy || Boolean(state.pendingDraft) || state.blocked || state.confirmingSubmission || state.submitted;
  const renderReference = useCallback((reference: FormReferenceFieldRenderProps) => context ? <WorkflowDraftReferenceField
    key={JSON.stringify([props.identity, props.definitionId, context.contextHash, reference.fieldPath || reference.field.id])}
    {...reference} identity={props.identity} definitionId={props.definitionId} contextHash={context.contextHash}
    enabled={(props.access.view || props.access.save) && context.definitionId === props.definitionId}
  /> : null, [props.identity, props.definitionId, props.access.view, props.access.save, context?.contextHash, context?.definitionId]);

  const finishClose = () => {
    allowLeave.current = true;
    draft.dispose();
    props.onClose();
    if (blocker.state === 'blocked') blocker.proceed();
    else exitAction.current?.();
  };

  const cancelClose = () => {
    setConfirmClose(false);
    exitAction.current = undefined;
    if (blocker.state === 'blocked') blocker.reset();
  };

  const requestClose = (afterClose?: () => void) => {
    exitAction.current = afterClose;
    if (draft.hasUnsavedChanges || state.submitting || state.confirmingSubmission || attachments.uploading) setConfirmClose(true);
    else finishClose();
  };

  const submit = () => {
    if (attachments.uploading) return;
    if (!state.confirmingSubmission && context?.formDefinition && !formRef.current?.validate()) return;
    void draft.submit();
  };

  const statusText = attachments.uploading ? '正在上传附件，请勿提交或离开…'
    : state.submitting ? '正在提交申请…'
    : state.saving ? '正在保存…'
    : state.confirmingSubmission ? '等待确认提交结果'
    : state.error ? '保存或提交未完成'
    : state.dirty ? '有未保存的修改'
    : state.saved ? `已保存 ${state.saved.lastSaveTime.split(' ')[1] || state.saved.lastSaveTime}`
    : '尚未保存草稿';

  return (
    <>
      <BaseDialog
        open
        title={`发起流程 · ${context?.definitionName || props.definitionName}`}
        description="草稿仅自己可见，最近有效保存后保留30天。"
        width="wide"
        maxWidthClassName="w-full max-w-2xl"
        onClose={() => requestClose()}
        closeOnEscape={!leaving && !confirmDelete}
        headerAside={props.onOpenDrafts ? (
          <Button variant="outline" size="sm" onClick={() => requestClose(props.onOpenDrafts)}>
            <FileText size={14} className="mr-1.5" />我的草稿{props.draftCount == null ? '' : `(${props.draftCount})`}
          </Button>
        ) : undefined}
        footerClassName="flex-wrap !justify-between"
        footer={(
          <>
            <span role="status" aria-live="polite" className="text-xs text-cf-subtle">{statusText}</span>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => requestClose()}>取消</Button>
              <Button variant="outline" size="sm" disabled={locked || state.saving || !props.access.save || (!state.dirty && Boolean(state.saved) && !state.error)} onClick={() => void draft.save()}>
                <Save size={14} className="mr-1.5" />{state.saving ? '保存中…' : '保存草稿'}
              </Button>
              <Button size="sm" disabled={state.phase !== 'ready' || busy || attachments.uploading || state.blocked || Boolean(state.pendingDraft) || state.submitted || !props.access.submit || !props.access.save} onClick={submit}>
                <Send size={14} className="mr-1.5" />{state.submitting ? '提交中…' : state.confirmingSubmission ? '重试提交' : '提交申请'}
              </Button>
            </div>
          </>
        )}
      >
        {state.phase === 'loading' ? (
          <div className="flex justify-center py-12" role="status" aria-label="正在读取表单和草稿"><LoadingSpinner size="lg" /></div>
        ) : state.phase === 'failed' ? (
          <div className="space-y-4 py-6 text-center">
            <EmptyState icon={<AlertTriangle className="h-10 w-10 text-amber-500" />} title="无法准备发起表单" description={state.error?.message || '请稍后重试。'} />
            <Button variant="outline" onClick={draft.retry}>重新加载</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {state.error ? <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{state.error.message}</div> : null}
            {state.pendingDraft ? (
              <div className="space-y-3 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 dark:border-slate-800">
                <p className="text-sm font-medium text-cf-title">{pendingReason || '此流程已有一份本人草稿，请先恢复或明确删除。'}</p>
                <p className="text-xs text-cf-subtle">最近保存 {state.pendingDraft.lastSaveTime} · 到期 {state.pendingDraft.expireTime}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={Boolean(pendingReason) || state.restoring || !props.access.view} onClick={() => void draft.restore()}>{state.restoring ? '处理中…' : '恢复草稿'}</Button>
                  {props.access.remove ? <Button size="sm" variant="outline" disabled={state.restoring} onClick={() => setConfirmDelete(true)}>删除并重新填写</Button> : null}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-cf-title">填写申请</h4>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-cf-subtle">申请标题</span>
                <Input value={state.content.title} maxLength={200} disabled={locked} placeholder="可选，最多200字" onChange={(event) => draft.change({ title: event.target.value })} />
              </label>
            </div>
            {context?.formDefinition ? (
              <FormRenderer
                ref={formRef}
                formDef={context.formDefinition}
                data={state.content.formData}
                onDataChange={(formData) => draft.change({ formData })}
                fieldPermissions={context.fieldPermissions}
                fieldErrors={state.error?.fieldErrors}
                renderReferenceField={renderReference}
                renderUploadField={attachments.renderUploadField}
                submitDisabled={attachments.uploading}
                idValuesAsStrings
                disabled={locked}
                hideActions
              />
            ) : <p className="text-sm text-cf-subtle">此流程无需填写表单，可保存标题和审批人选择。</p>}
            {context?.assigneeNodes.length ? (
              <section className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
                <h4 className="text-sm font-semibold text-cf-title">审批人</h4>
                {context.assigneeNodes.map((node) => {
                  const selected = state.content.nodeAssignees[node.nodeKey] || [];
                  const changeSelection = (userIds: string[]) => draft.change({ nodeAssignees: { ...state.content.nodeAssignees, [node.nodeKey]: userIds } });
                  return (
                    <div key={node.nodeKey} role="group" aria-labelledby={`draft-assignee-${node.nodeKey}`} className="space-y-2">
                      <div id={`draft-assignee-${node.nodeKey}`} className="text-sm font-medium text-cf-title">{node.nodeName}<span className="ml-2 text-xs font-normal text-cf-muted">{node.multiple ? '可多选，顺序签按选择顺序处理' : '单选'}</span></div>
                      <SelectorShell
                        options={node.candidates.map((candidate) => ({ id: candidate.userId, label: candidate.userName }))}
                        value={selected}
                        multiple={node.multiple}
                        disabled={locked}
                        placeholder="请选择审批人"
                        emptyText="允许范围内暂无可选人员，请联系流程管理员"
                        onToggle={(userId) => changeSelection(node.multiple ? selected.includes(userId) ? selected.filter((currentId) => currentId !== userId) : [...selected, userId] : [userId])}
                        onRemove={(userId) => changeSelection(selected.filter((currentId) => currentId !== userId))}
                      />
                    </div>
                  );
                })}
              </section>
            ) : null}
            {!props.access.save || !props.access.submit ? <p role="status" className="text-xs text-cf-subtle">当前账号缺少保存或从草稿提交权限。</p> : null}
          </div>
        )}
      </BaseDialog>
      <ConfirmDialog open={leaving} title="确认离开申请" message={state.submitting || state.confirmingSubmission ? '提交结果尚未确认。离开后请在“我的申请”核对结果，不要重复新建申请。' : draft.hasUnsavedChanges ? '仍有未确认保存的改动，直接离开会丢失这些改动。关闭浏览器后无法保证继续保存。' : '内容已保存，确认离开当前申请？'} confirmText="直接离开" cancelText="继续填写" onCancel={cancelClose} onConfirm={finishClose} />
      <ConfirmDialog open={confirmDelete} title="删除本人草稿" message="删除后无法恢复这份草稿，确认删除并重新填写？" danger confirmText="删除草稿" onCancel={() => setConfirmDelete(false)} onConfirm={() => { setConfirmDelete(false); void draft.deletePending(); }} />
    </>
  );
};
