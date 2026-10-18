import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BaseDialog } from '@/components/common';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
import { FormRenderer } from '@/components/FormRenderer';
import { useWorkflowFormAttachments } from '@/hooks/useWorkflowFormAttachments';
import { SelectorShell } from '@/components/common/SelectorShell';
import { getStartAssigneeNodes } from '@/services/api/workflow';
import { getErrorMessage } from '@/utils/errorMessage';
import { getFormFieldErrors } from '@/utils/formFieldErrors';
import type { FormDefinition, WorkflowDefinition } from '@/types';
import type { StartAssigneeNode } from '@/types/workflowSemantic';
import { useAuth } from '@/context/AuthContext';
import { workflowDraftIdentity } from '@/hooks/useWorkflowDraft';
import type { WorkflowDraftAccess } from '@/hooks/workflowDraftSession';
import type { DraftStartResult } from '@/services/api/workflow/draftTypes';
import { WorkflowDraftEditor } from '@/components/workflow/drafts/WorkflowDraftEditor';
import { getWorkflowBusinessEntry } from '@/services/api/workflow/businessEntry';

interface WorkflowLaunchDialogProps {
  open: boolean;
  workflow: (Pick<WorkflowDefinition, 'id' | 'name' | 'formId'> & Partial<Pick<WorkflowDefinition, 'key'>>) | null;
  boundForm?: FormDefinition;
  loadingBoundForm: boolean;
  boundFormError?: string | null;
  onClose: () => void;
  onSubmit: (data: Record<string, any>, nodeAssignees?: Record<string, string[]>) => void | Promise<void>;
  draftId?: string;
  draftCount?: number;
  onDraftChanged?: () => void;
  onDraftSubmitted?: (result: DraftStartResult) => void;
  onDraftPermissionUnavailable?: () => void;
  onOpenDrafts?: () => void;
}

export const WorkflowLaunchDialog: React.FC<WorkflowLaunchDialogProps> = (props) => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const identity = workflowDraftIdentity(user);
  if (!props.open || !props.workflow || !user) return null;
  const businessEntry = getWorkflowBusinessEntry(props.workflow.key);
  if (businessEntry) {
    const allowed = hasPermission(businessEntry.permission);
    return <BaseDialog
      open={props.open}
      title="请从业务专页办理"
      description={`“${props.workflow.name}”由业务专页校验并提交，不能通过通用表单或草稿发起。`}
      onClose={props.onClose}
      maxWidthClassName="max-w-lg"
      footer={<div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={props.onClose}>关闭</Button>
        {allowed && <Button size="sm" onClick={() => { props.onClose(); navigate(businessEntry.path); }}>前往{businessEntry.label}</Button>}
      </div>}
    >
      <EmptyState title={allowed ? `请前往${businessEntry.label}` : '暂无业务办理权限'} description={allowed ? '业务专页将检查申请内容及审批配置。' : '当前账号没有对应业务权限，请联系管理员。'} className="py-6" />
    </BaseDialog>;
  }
  const access: WorkflowDraftAccess = {
    view: hasPermission('workflow:draft:view'),
    save: hasPermission('workflow:draft:save'),
    remove: hasPermission('workflow:draft:remove'),
    submit: hasPermission(['workflow:draft:submit', 'workflow:process:start'], true),
  };
  return <WorkflowLaunchSession key={JSON.stringify([identity, props.workflow.id, props.draftId || ''])} {...props} identity={identity} access={access} />;
};

const WorkflowLaunchSession: React.FC<WorkflowLaunchDialogProps & { identity: string; access: WorkflowDraftAccess }> = (props) => {
  const [useLegacy, setUseLegacy] = useState(false);
  const [draftEnabled] = useState(() => props.access.view && props.access.save && props.access.submit);
  const useDraft = Boolean(props.draftId) || (!useLegacy && draftEnabled);
  if (useDraft && props.workflow) {
    return <WorkflowDraftEditor
      identity={props.identity}
      definitionId={props.workflow.id}
      definitionName={props.workflow.name}
      draftId={props.draftId}
      draftCount={props.draftCount}
      access={props.access}
      onClose={props.onClose}
      onChanged={props.onDraftChanged}
      onSubmitted={props.onDraftSubmitted || props.onClose}
      onOpenDrafts={props.onOpenDrafts}
      onPermissionUnavailable={() => { setUseLegacy(true); props.onDraftPermissionUnavailable?.(); }}
    />;
  }
  return <LegacyWorkflowLaunchDialog {...props} />;
};

const LegacyWorkflowLaunchDialog: React.FC<WorkflowLaunchDialogProps> = ({
  open,
  workflow,
  boundForm,
  loadingBoundForm,
  boundFormError,
  onClose,
  onSubmit,
}) => {
  const [assigneeNodes, setAssigneeNodes] = useState<StartAssigneeNode[]>([]);
  const [nodeAssignees, setNodeAssignees] = useState<Record<string, string[]>>({});
  const [loadedDefinitionId, setLoadedDefinitionId] = useState<string | null>(null);
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const [selectionConfirmed, setSelectionConfirmed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const active = useRef(true);
  const attachments = useWorkflowFormAttachments(workflow ? { definitionId: workflow.id } : undefined);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAssigneeNodes([]);
    setNodeAssignees({});
    setLoadedDefinitionId(null);
    setAssigneeError(null);
    setSelectionConfirmed(false);
    if (open && workflow) {
      getStartAssigneeNodes(workflow.id)
        .then((nodes) => {
          if (!cancelled) setAssigneeNodes(nodes);
        })
        .catch((error) => {
          if (!cancelled) setAssigneeError(getErrorMessage(error, '无法加载审批人配置，请重试'));
        })
        .finally(() => {
          if (!cancelled) setLoadedDefinitionId(workflow.id);
        });
    }
    return () => { cancelled = true; };
  }, [open, workflow?.id, retryCount]);

  if (!open || !workflow) {
    return null;
  }

  const loadingAssignees = loadedDefinitionId !== workflow.id;
  if (loadingAssignees || assigneeError || (assigneeNodes.length > 0 && !selectionConfirmed)) {
    const selectionComplete = assigneeNodes.every((node) => (nodeAssignees[node.nodeKey]?.length ?? 0) > 0);
    return (
      <BaseDialog
        open={open}
        title="选择审批人"
        description={`为“${workflow.name}”指定审批人，完成后填写申请。`}
        onClose={onClose}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            {assigneeError ? (
              <Button size="sm" onClick={() => setRetryCount((count) => count + 1)}>重试</Button>
            ) : (
              <Button size="sm" disabled={loadingAssignees || !selectionComplete} onClick={() => setSelectionConfirmed(true)}>
                下一步：填写申请
              </Button>
            )}
          </div>
        }
      >
        {loadingAssignees ? (
          <div className="flex justify-center py-10"><LoadingSpinner size="lg" /></div>
        ) : assigneeError ? (
          <EmptyState icon={<AlertTriangle className="h-10 w-10 text-amber-500" />} title="审批人配置加载失败" description={assigneeError} className="py-6" />
        ) : (
          <div className="space-y-5">
            {assigneeNodes.map((node) => {
              const selected = nodeAssignees[node.nodeKey] ?? [];
              return (
                <div key={node.nodeKey} className="space-y-2">
                  <div className="text-sm font-medium text-cf-title">{node.nodeName}<span className="ml-2 text-xs font-normal text-cf-muted">{node.multiple ? '可多选，按选择顺序处理顺序签' : '单选'}</span></div>
                  <SelectorShell
                    options={node.candidates.map((candidate) => ({ id: candidate.userId, label: candidate.userName }))}
                    value={selected}
                    multiple={node.multiple}
                    placeholder="请选择审批人"
                    emptyText="允许范围内暂无可选人员，请联系流程管理员"
                    onToggle={(userId) => setNodeAssignees((current) => ({
                      ...current,
                      [node.nodeKey]: node.multiple
                        ? selected.includes(userId) ? selected.filter((candidateId) => candidateId !== userId) : [...selected, userId]
                        : [userId],
                    }))}
                    onRemove={(userId) => setNodeAssignees((current) => ({ ...current, [node.nodeKey]: selected.filter((candidateId) => candidateId !== userId) }))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </BaseDialog>
    );
  }

  if (workflow.formId && boundForm) {
    return <FormRenderer formDef={boundForm} data={formData} onDataChange={(data) => { setFormData(data); setFormErrors({}); }} fieldErrors={formErrors}
      disabled={submitting} submitDisabled={attachments.uploading} renderUploadField={attachments.renderUploadField} onCancel={onClose} onSubmit={async (data) => {
      if (submitting || attachments.uploading) return;
      setSubmitting(true);
      try { await onSubmit(data, assigneeNodes.length ? nodeAssignees : undefined); }
      catch (error) { if (active.current) setFormErrors(getFormFieldErrors(error)); }
      finally { if (active.current) setSubmitting(false); }
    }} />;
  }

  if (workflow.formId && loadingBoundForm) {
    return (
      <BaseDialog
        open={open}
        title="正在准备发起表单"
        description={`正在加载“${workflow.name}”绑定的表单定义。`}
        onClose={onClose}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
          </div>
        }
      >
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="lg" />
        </div>
      </BaseDialog>
    );
  }

  if (workflow.formId && !boundForm) {
    return (
      <BaseDialog
        open={open}
        title="绑定表单不可用"
        description={`流程“${workflow.name}”当前无法加载绑定表单。`}
        onClose={onClose}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
          </div>
        }
      >
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10 text-amber-500" />}
          title="绑定表单不存在"
          description={
            boundFormError
              ? `无法加载绑定表单：${boundFormError}`
              : '流程绑定的表单可能已被删除，或当前账号暂无访问权限，请联系管理员检查流程配置。'
          }
          className="py-6"
        />
      </BaseDialog>
    );
  }

  return (
    <BaseDialog
      open={open}
      title="暂未配置输入表单"
      description={`流程“${workflow.name}”还没有绑定可发起表单。`}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10 text-amber-500" />}
        title="未绑定表单"
        description="该流程尚未配置输入表单，当前无法直接发起。"
        className="py-6"
      />
    </BaseDialog>
  );
};
