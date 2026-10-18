import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CornerUpLeft,
  FileText,
  GitBranch,
  GitMerge,
  UserPlus,
  UserMinus,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common';
import { Button, LoadingSpinner, SegmentedControl, SegmentedControlItem, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { cn } from '@/utils/cn';
import { formatDateTimeDisplay as formatDateTime } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { AttachmentLinks } from '@/components/AttachmentLinks';
import { getWorkflowBusinessAttachments } from '@/utils/workflowBusinessAttachments';
import { FormRenderer, type FormRendererHandle } from './FormRenderer';
import { useWorkflowFormAttachments } from '@/hooks/useWorkflowFormAttachments';
import { WorkflowTaskReferenceField } from '@/components/workflow/WorkflowTaskReferenceField';
import { ProcessTrace } from './ProcessTrace';
import { SignatureModal } from './SignatureModal';
import { getUserList } from '../services/api/auth';
import { completeTask, getFlowchartData, getProcessTrace, getProcessInstance, readTask, rejectTask } from '../services/api/workflow';
import { mapBackendFormDefinition } from '@/utils/formDefinition';
import { getFormFieldErrors } from '@/utils/formFieldErrors';
import { getRefundApprovalFields, getRefundApproverDescription } from '@/utils/workflowRefundDisplay';
import { hrAdvanceApi } from '@/services/api/hr/advances';
import { finalSettlementApi, type FinalSettlement } from '@/services/api/hr/finalSettlements';
import type { AdvanceApprovalDetail } from '@/services/api/hr/advanceTypes';
import { getWorkflowUpstreamNodes } from '@/utils/workflowGraph';
import { allowsNodeOperation, allowsRejection, canHandleWorkflowTask, getTaskAgentMode } from '@/utils/workflowPermissions';
import { WorkflowAgentActions } from './workflow/WorkflowAgentActions';
import { REJECT_STRATEGY_LABELS, type RejectStrategy, type FieldPermission } from '@/types/workflowSemantic';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { FormDefinition, StepDetail, Task, TaskStatus, User } from '../types';
import {
  formatWorkflowFieldValue,
  getWorkflowFieldLabel,
  getWorkflowSummaryParts,
  isWorkflowHiddenField,
} from '../utils/workflowFormDisplay';

type ModalTab = 'handle' | 'trace';
type ConfirmAction = 'APPROVED' | 'REJECTED' | null;

const statusMetaMap: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  [TaskStatus.PENDING]: {
    label: '待处理',
    icon: <Clock3 size={12} />,
    className:
      'border border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200',
  },
  [TaskStatus.APPROVED]: {
    label: '已通过',
    icon: <CheckCircle2 size={12} />,
    className:
      'border border-emerald-200 bg-[var(--cf-surface-strong)] text-emerald-700 dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-200',
  },
  [TaskStatus.REJECTED]: {
    label: '已拒绝',
    icon: <XCircle size={12} />,
    className:
      'border border-rose-200 bg-[var(--cf-surface-strong)] text-rose-700 dark:border-rose-800 dark:bg-slate-950 dark:text-rose-200',
  },
  [TaskStatus.RETURNED]: {
    label: '已退回',
    icon: <ArrowLeftCircle size={12} />,
    className:
      'border border-amber-200 bg-[var(--cf-surface-strong)] text-amber-700 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-200',
  },
  [TaskStatus.DELEGATED]: {
    label: '已转办',
    icon: <UserPlus size={12} />,
    className:
      'border border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-800 dark:bg-slate-950 dark:text-cyan-200',
  },
  [TaskStatus.TIMED_OUT]: {
    label: '已超时',
    icon: <AlertTriangle size={12} />,
    className:
      'border border-orange-200 bg-[var(--cf-surface-strong)] text-orange-700 dark:border-orange-800 dark:bg-slate-950 dark:text-orange-200',
  },
};

const TaskModalBadge = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium',
      className,
    )}
  >
    {children}
  </span>
);

const TaskModalPanel = ({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={cn(
      'card p-4',
      className,
    )}
  >
    <div className="flex flex-col gap-1">
      <div className="text-sm font-semibold text-cf-title">{title}</div>
      {description ? (
        <div className="text-xs leading-5 text-cf-subtle">{description}</div>
      ) : null}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const TaskField = ({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}) => (
  <div className={cn('space-y-1', className)}>
    <div className="text-[11px] font-medium text-cf-faint">
      {label}
    </div>
    <div className={cn('break-words text-sm text-cf-title', valueClassName)}>
      {value}
    </div>
  </div>
);

const TaskEmptyBlock = ({
  title,
  description,
  loading = false,
}: {
  title: string;
  description?: string;
  loading?: boolean;
}) => (
  <div className="rounded-md border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-800">
    {loading ? <LoadingSpinner size="sm" className="mx-auto" /> : null}
    <div className={cn('text-sm font-medium text-cf-body', loading && 'mt-3')}>
      {title}
    </div>
    {description ? (
      <div className="mt-1 text-xs leading-5 text-cf-subtle">{description}</div>
    ) : null}
  </div>
);

const renderStepNode = (step: StepDetail, index: number, total: number) => {
  const isCompleted = step.status === 'completed';
  const isActive = step.status === 'active';
  const dotClass = isCompleted
    ? 'border-emerald-600 bg-[var(--cf-surface-strong)] dark:border-emerald-500 dark:bg-slate-950'
    : isActive
      ? 'border-cyan-600 bg-[var(--cf-surface-strong)] dark:border-cyan-500 dark:bg-slate-950'
      : 'border-slate-300 bg-[var(--cf-surface-strong)] dark:border-slate-700 dark:bg-slate-950';
  const lineClass = isCompleted
    ? 'bg-emerald-400 dark:bg-emerald-700'
    : 'bg-slate-200 dark:bg-slate-800';

  if (step.nodeType === 'PARALLEL' || step.nodeType === 'CONDITION') {
    return (
      <React.Fragment key={`${step.nodeKey}-${index}`}>
        <div className="flex flex-col items-center">
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-md border',
              isCompleted
                ? 'border-emerald-200 bg-[var(--cf-surface-strong)] text-emerald-700 dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-200'
                : isActive
                  ? 'border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200'
                  : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-faint dark:border-slate-700 dark:bg-slate-950',
            )}
          >
            {step.nodeType === 'PARALLEL' ? <GitBranch size={11} /> : <GitMerge size={11} />}
          </div>
          <span
            className={cn(
              'mt-1 max-w-[72px] text-center text-[9px] leading-tight',
              isActive
                ? 'font-semibold text-cyan-700 dark:text-cyan-200'
                : isCompleted
                  ? 'text-emerald-700 dark:text-emerald-200'
                  : 'text-cf-faint',
            )}
          >
            {step.nodeTitle}
          </span>

          {step.branches?.length ? (
            <div className="mt-2 flex flex-col gap-1 border-x border-dashed border-slate-200 px-2 dark:border-slate-800">
              {step.branches.map((branch, branchIndex) => (
                <div key={branchIndex} className="flex items-start gap-0.5">
                  {branch.map((branchStep, branchStepIndex) => {
                    const branchCompleted = branchStep.status === 'completed';
                    const branchActive = branchStep.status === 'active';
                    const branchDotClass = branchCompleted
                      ? 'border-emerald-600 bg-[var(--cf-surface-strong)] dark:border-emerald-500 dark:bg-slate-950'
                      : branchActive
                        ? 'border-cyan-600 bg-[var(--cf-surface-strong)] dark:border-cyan-500 dark:bg-slate-950'
                        : 'border-slate-300 bg-[var(--cf-surface-strong)] dark:border-slate-700 dark:bg-slate-950';

                    return (
                      <div key={`${branchStep.nodeKey}-${branchStepIndex}`} className="flex items-start">
                        <div className="flex min-w-[54px] max-w-[68px] flex-col items-center">
                          <div className={cn('h-2.5 w-2.5 rounded-sm border', branchDotClass)} />
                          <span
                            className={cn(
                              'mt-1 text-center text-[8px] leading-tight',
                              branchActive
                                ? 'font-semibold text-cyan-700 dark:text-cyan-200'
                                : branchCompleted
                                  ? 'text-emerald-700 dark:text-emerald-200'
                                  : 'text-cf-faint',
                            )}
                          >
                            {branchStep.nodeTitle}
                          </span>
                          <span className="mt-0.5 line-clamp-1 text-center text-[7px] text-cf-faint">
                            {branchCompleted && branchStep.operatorName
                              ? branchStep.operatorName
                              : branchStep.approverDescription}
                          </span>
                          {branchStep.signType ? (
                            <TaskModalBadge className="mt-1 border border-amber-200 bg-[var(--cf-surface-strong)] text-[7px] text-amber-700 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-200">
                              {branchStep.signType === 'ALL'
                                ? '全签'
                                : branchStep.signType === 'ANY'
                                  ? '或签'
                                  : branchStep.signType === 'SEQUENTIAL'
                                    ? '顺序签'
                                    : `${branchStep.passPercent || 0}%`}
                            </TaskModalBadge>
                          ) : null}
                        </div>
                        {branchStepIndex < branch.length - 1 ? (
                          <div className="mt-[4px] h-[2px] w-3 bg-slate-200 dark:bg-slate-800" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {index < total - 1 ? <div className="mt-[8px] h-[2px] w-5 bg-slate-200 dark:bg-slate-800" /> : null}
      </React.Fragment>
    );
  }

  return (
    <div key={`${step.nodeKey}-${index}`} className="flex items-start">
      <div className="flex min-w-[62px] max-w-[74px] flex-col items-center">
        <div className={cn('h-3 w-3 rounded-sm border', dotClass)} />
        <span
          className={cn(
            'mt-1 text-center text-[9px] leading-tight',
            isActive
              ? 'font-semibold text-cyan-700 dark:text-cyan-200'
              : isCompleted
                ? 'text-emerald-700 dark:text-emerald-200'
                : 'text-cf-faint',
          )}
        >
          {step.nodeTitle}
        </span>
        <span
          className={cn(
            'mt-0.5 line-clamp-1 text-center text-[8px]',
            isActive
              ? 'text-cyan-600 dark:text-cyan-300'
              : isCompleted
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-cf-faint',
          )}
        >
          {isCompleted && step.operatorName ? step.operatorName : step.approverDescription}
        </span>
        {step.signType ? (
          <TaskModalBadge className="mt-1 border border-amber-200 bg-[var(--cf-surface-strong)] text-[7px] text-amber-700 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-200">
            <Users size={8} />
            {step.signType === 'ALL'
              ? '全签'
              : step.signType === 'ANY'
                ? '或签'
                : step.signType === 'SEQUENTIAL'
                  ? '顺序签'
                  : `${step.passPercent}%`}
          </TaskModalBadge>
        ) : null}
        {!step.signType && step.approverUsers && step.approverUsers.length > 1 ? (
          <span className="mt-1 flex items-center gap-0.5 text-[7px] text-cf-faint">
            <Users size={8} />
            {step.approverUsers.length} 人
          </span>
        ) : null}
      </div>
      {index < total - 1 ? <div className={cn('mt-[5px] h-[2px] w-4', lineClass)} /> : null}
    </div>
  );
};

export const TaskHandleModal = ({
  task,
  isOpen,
  onClose,
  onComplete,
  availableForms,
  currentUser,
  viewOnly = false,
}: {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (t: Task) => void;
  availableForms: FormDefinition[];
  currentUser: User;
  viewOnly?: boolean;
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('handle');
  const [comment, setComment] = useState('');
  const [editedFormData, setEditedFormData] = useState<Record<string, any>>({});
  const formRenderer = useRef<FormRendererHandle>(null);
  const formOwner = `${currentUser.tenantId || ''}:${currentUser.id}`;
  const isAdvanceTask = task?.formData?.businessType === 'HR_ADVANCE';
  const isSettlementTask = task?.formData?.businessType === 'HR_SETTLEMENT';
  const [settlementScope, setSettlementScope] = useState<{ owner: string; taskId: string; detail?: FinalSettlement; error?: string }>();
  const [advanceScope, setAdvanceScope] = useState<{ owner: string; taskId: string; detail?: AdvanceApprovalDetail; error?: string }>();
  const [formScope, setFormScope] = useState<{ owner: string; taskId: string; form?: FormDefinition; permissions: FieldPermission[]; nodeKey?: string; businessAttachments?: ReturnType<typeof getWorkflowBusinessAttachments>; error?: string }>();
  const attachments = useWorkflowFormAttachments(task?.processInstanceId ? { instanceId: task.processInstanceId,
    taskId: !viewOnly && (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED) ? task.id : undefined } : undefined);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [delegationMode, setDelegationMode] = useState(false);
  const [delegateUser, setDelegateUser] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [hasTriedLoadUsers, setHasTriedLoadUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectStrategy, setRejectStrategy] = useState<RejectStrategy | '__LEGACY__'>('__LEGACY__');
  const [rejectTargetNode, setRejectTargetNode] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [historyNodes, setHistoryNodes] = useState<Array<{ key: string; name: string }>>([]);
  const [historyNodesLoaded, setHistoryNodesLoaded] = useState(false);
  const [historyNodesError, setHistoryNodesError] = useState('');
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'add' | 'reduce'>('add');

  useEffect(() => {
    setSettlementScope(undefined);
    if (!isOpen || !task || !isSettlementTask) return;
    const controller = new AbortController();
    finalSettlementApi.approvalDetail(task.id, controller.signal).then(detail => {
      if (!controller.signal.aborted) setSettlementScope({ owner: formOwner, taskId: task.id, detail });
    }).catch(error => {
      if (!controller.signal.aborted) setSettlementScope({ owner: formOwner, taskId: task.id, error: getErrorMessage(error, '结算详情读取失败') });
    });
    return () => controller.abort();
  }, [isOpen, task?.id, isSettlementTask, formOwner]);

  useEffect(() => {
    setAdvanceScope(undefined);
    if (!isOpen || !task || !isAdvanceTask) return;
    const controller = new AbortController();
    hrAdvanceApi.approvalDetail(task.id, controller.signal).then(detail => {
      if (!controller.signal.aborted) setAdvanceScope({ owner: formOwner, taskId: task.id, detail });
    }).catch(error => {
      if (!controller.signal.aborted) setAdvanceScope({ owner: formOwner, taskId: task.id, error: getErrorMessage(error, '借款详情读取失败') });
    });
    return () => controller.abort();
  }, [isOpen, task?.id, isAdvanceTask, formOwner]);

  useEffect(() => {
    if (!isOpen || !task?.processInstanceId) return;
    let cancelled = false;
    setFormScope(undefined);
    setFormErrors({});
    const taskId = !viewOnly && (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED) ? task.id : undefined;
    getProcessInstance(task.processInstanceId, { taskId }).then((instance) => {
      if (cancelled) return;
      const values = typeof instance.variables === 'string' ? JSON.parse(instance.variables) : instance.variables || instance.formData || {};
      const form = instance.formDefinition ? mapBackendFormDefinition(instance.formDefinition) : undefined;
      setFormScope({ owner: formOwner, taskId: task.id, form, permissions: instance.fieldPermissions || [], nodeKey: instance.formNodeKey, businessAttachments: getWorkflowBusinessAttachments(values) });
      setEditedFormData(values);
    }).catch((error) => {
      if (!cancelled) setFormScope({ owner: formOwner, taskId: task.id, permissions: [], error: getErrorMessage(error, '当前节点表单读取失败') });
    });
    return () => { cancelled = true; };
  }, [isOpen, task?.id, task?.processInstanceId, task?.status, viewOnly, formOwner]);

  useEffect(() => {
    const isTaskActionable = canHandleWorkflowTask(task, currentUser) || Boolean(getTaskAgentMode(task, currentUser.id));
    const canReadTask =
      isOpen &&
      !viewOnly &&
      task &&
      isTaskActionable &&
      (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED);
    if (canReadTask) {
      readTask(task.id).catch(console.error);
    }
  }, [currentUser.id, currentUser.role, isOpen, task, viewOnly]);

  useEffect(() => {
    if (delegationMode && !hasTriedLoadUsers) {
      setHasTriedLoadUsers(true);
      getUserList()
        .then((res) => {
          if (Array.isArray(res)) {
            setUsers(res.map(mapBackendUserToFrontend));
          }
        })
        .catch((error) => {
          console.error('加载转办用户失败:', error);
          toast.error('加载可转办用户失败，请稍后重试');
        });
    }
  }, [delegationMode, hasTriedLoadUsers]);

  useEffect(() => {
    let cancelled = false;
    if (rejectMode && task && task.processInstanceId && !historyNodesLoaded) {
      setHistoryNodesError('');
      Promise.all([getProcessTrace(task.processInstanceId), getFlowchartData(task.processInstanceId)])
        .then(([trace, graph]) => {
          if (cancelled) return;
          const currentNodeKey = task.nodeKey || trace.activeDetails?.find((detail) => detail.taskId === task.id)?.nodeKey;
          const executedNodes = new Set(trace.historyDetails?.map((detail) => detail.nodeKey) ?? []);
          const nodes = currentNodeKey ? getWorkflowUpstreamNodes(graph, currentNodeKey)
            .filter((node) => executedNodes.has(node.id))
            .map((node) => ({ key: node.id, name: node.label })) : [];
          setHistoryNodes(nodes);
          setRejectTargetNode((selected) => nodes.some((node) => node.key === selected) ? selected : '');
          setHistoryNodesLoaded(true);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error('加载历史节点失败:', error);
          setHistoryNodesError(getErrorMessage(error, '加载历史节点失败'));
          setHistoryNodesLoaded(true);
        });
    }
    return () => { cancelled = true; };
  }, [historyNodesLoaded, rejectMode, task]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('handle');
      setDelegationMode(false);
      setDelegateUser('');
      setRejectMode(false);
      setRejectStrategy(task?.rejectStrategy ?? '__LEGACY__');
      setRejectTargetNode(task?.rejectToNodeKey ?? '');
      setRejectReason('');
      setHistoryNodes([]);
      setHistoryNodesLoaded(false);
      setHistoryNodesError('');
      setComment('');
      setConfirmAction(null);
      setHasTriedLoadUsers(false);
      setUsers([]);
      setEditedFormData(task?.formData ? { ...task.formData } : {});
    }
  }, [isOpen, task?.formData, task?.id]);

  if (!isOpen || !task) {
    return null;
  }

  const agentMode = getTaskAgentMode(task, currentUser.id);
  const canAct = canHandleWorkflowTask(task, currentUser);
  const scopedForm = formScope?.taskId === task.id && formScope.owner === formOwner ? formScope : undefined;
  const scopedAdvance = advanceScope?.taskId === task.id && advanceScope.owner === formOwner ? advanceScope : undefined;
  const advanceDetail = scopedAdvance?.detail;
  const scopedSettlement = settlementScope?.taskId === task.id && settlementScope.owner === formOwner ? settlementScope : undefined;
  const settlementDetail = scopedSettlement?.detail;
  const isRefundTask = task.workflowId === 'crm_refund_review' || task.formData?.businessType === 'crm_refund';
  const isOfferTask = task.workflowId === 'offer_approval' || task.formData?.businessType === 'OFFER';
  const refundFields = isRefundTask && scopedForm && !scopedForm.error ? getRefundApprovalFields(editedFormData.refundApproval) : null;
  const currentFormDef = task.processInstanceId ? scopedForm?.form : task.type === 'DYNAMIC' && task.formId ? availableForms.find((item) => item.id === task.formId) : undefined;
  const canEditForm = !isSettlementTask && !isAdvanceTask && !isRefundTask && !isOfferTask && canAct && !viewOnly && !scopedForm?.error && (task.allowEdit || Boolean(scopedForm?.permissions.some((permission) => permission.editableFlag)));
  const summaryParts =
    task.formData && Object.keys(task.formData).length > 0
      ? getWorkflowSummaryParts(task.formData as Record<string, any>, 3)
      : [];
  const progressRate =
    task.totalSteps && task.currentStepIndex
      ? Math.min(100, Math.round((task.currentStepIndex / task.totalSteps) * 100))
      : 0;
  const statusMeta = statusMetaMap[task.status] || {
    label: task.status,
    icon: null,
    className:
      'border border-slate-200 bg-[var(--cf-surface-muted)] text-cf-body dark:border-slate-800 dark:bg-slate-900',
  };
  const showAllButtons = !task.buttonPermissions || task.buttonPermissions.length === 0;
  const hasBtn = (code: string) => {
    if ((isSettlementTask || isAdvanceTask || isRefundTask || isOfferTask) && ['DELEGATE', 'ADD_SIGN', 'REDUCE_SIGN', 'RETURN'].includes(code)) return false;
    const permissionCode = code === 'REDUCE_SIGN' ? 'ADD_SIGN' : code;
    if (!showAllButtons && !task.buttonPermissions!.includes(permissionCode)) return false;
    if (code === 'ADD_SIGN') return allowsNodeOperation(task.nodePermissions, 'allowAddSign');
    if (code === 'REDUCE_SIGN') return allowsNodeOperation(task.nodePermissions, 'allowReduceSign');
    if (code === 'DELEGATE') return allowsNodeOperation(task.nodePermissions, 'allowDelegate');
    if (code === 'RETURN') return allowsNodeOperation(task.nodePermissions, 'allowRollback');
    if (code === 'REJECT') return allowsRejection(task.nodePermissions, task.rejectStrategy);
    return true;
  };
  const rejectNeedsTarget = rejectStrategy === '__LEGACY__' || rejectStrategy === 'TO_SPECIFIED_NODE';
  const businessAttachments = task.processInstanceId
    ? scopedForm && !scopedForm.error ? scopedForm.businessAttachments || {} : {}
    : getWorkflowBusinessAttachments(task.formData);
  const visibleBusinessEntries = task.formData
    ? Object.entries(task.formData).filter(([key]) =>
        !isWorkflowHiddenField(key, task.formData as Record<string, unknown>),
      )
    : [];
  const visibleDelegateUsers = users.filter((user) => user.id !== currentUser.id);
  const headerTitle = delegationMode
    ? '选择转办受托人'
    : rejectMode
      ? '驳回任务'
      : viewOnly
        ? '申请详情'
        : '任务处理';
  const headerDescription = delegationMode
    ? '将当前待办转交给其他处理人，审批轨迹会保留本次转办记录。'
    : rejectMode
      ? '确认驳回去向并填写原因，审批轨迹会保留本次操作。'
      : activeTab === 'trace'
        ? '查看该流程的审批记录和流程图轨迹。'
        : '在统一任务弹层内查看详情、编辑表单并执行审批操作。';

  const buildEditableVariables = (): Record<string, any> | undefined => {
    if (!canEditForm) {
      return undefined;
    }
    return currentFormDef ? formRenderer.current?.getData() : editedFormData;
  };

  const resetSubMode = () => {
    setDelegationMode(false);
    setDelegateUser('');
    setRejectMode(false);
    setRejectTargetNode('');
    setRejectReason('');
  };

  const closeOrBack = () => {
    if (submitting) return;
    if (delegationMode || rejectMode) {
      resetSubMode();
      return;
    }
    onClose();
  };

  const handleAction = async (action: 'APPROVED' | 'REJECTED' | 'DELEGATED') => {
    if (!canAct || viewOnly || submitting) return;
    if (action === 'APPROVED' && attachments.uploading) { toast.error('请等待附件上传完成'); return; }
    if (action === 'APPROVED' && task.processInstanceId && (!scopedForm || scopedForm.error)) {
      toast.error(scopedForm?.error || '请等待当前节点表单加载完成');
      return;
    }
    if (action === 'APPROVED' && isSettlementTask && !settlementDetail) {
      toast.error('请完整读取结算金额、取样核定和来源明细后再同意。');
      return;
    }
    if (action === 'APPROVED' && isAdvanceTask && !advanceDetail) {
      toast.error('请完整读取借款金额、用途和还款计划后再同意。');
      return;
    }
    if (action === 'APPROVED' && isRefundTask && !refundFields) {
      toast.error('退款详情未完整读取，请关闭后重新打开核对');
      return;
    }
    if (action === 'APPROVED' && currentFormDef && !formRenderer.current?.validate()) return;
    if (!hasBtn(action === 'APPROVED' ? 'APPROVE' : action === 'REJECTED' ? 'REJECT' : 'DELEGATE')) {
      toast.error('当前节点不允许此操作');
      return;
    }
    if (action === 'REJECTED' && task.rejectStrategy && !comment.trim()) {
      toast.error('请填写驳回原因');
      return;
    }
    if (action === 'DELEGATED' && !delegateUser) {
      toast.error('请选择受托人');
      return;
    }

    setSubmitting(true);
    setConfirmAction(null);

    const apiAction =
      action === 'APPROVED' ? 'APPROVE' : action === 'REJECTED' ? 'REJECT' : 'DELEGATE';

    try {
      await completeTask({
        taskId: task.id,
        action: apiAction,
        comment: comment || undefined,
        delegateUserId: action === 'DELEGATED' ? delegateUser : undefined,
        variables: buildEditableVariables(),
      });

      let nextStatus = TaskStatus.APPROVED;
      if (action === 'REJECTED') nextStatus = TaskStatus.REJECTED;
      if (action === 'DELEGATED') nextStatus = TaskStatus.DELEGATED;

      const actionLabel = action === 'APPROVED' ? '同意' : action === 'REJECTED' ? '拒绝' : '转办';
      const log = {
        operator: currentUser.name,
        action: actionLabel,
        comment: comment || '处理完毕',
        time: new Date().toLocaleString(),
      };

      toast.success(`任务${actionLabel}成功`);

      onComplete({
        ...task,
        status: nextStatus,
        assigneeId: action === 'DELEGATED' ? delegateUser : task.assigneeId,
        logs: [...(task.logs || []), log as any],
      });

      onClose();
      resetSubMode();
      setComment('');
    } catch (error) {
      setFormErrors(getFormFieldErrors(error));
      console.error('任务处理失败:', error);
      toast.error(error instanceof Error ? error.message : '任务处理失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!canAct || viewOnly || submitting) return;
    if (!allowsRejection(task.nodePermissions, rejectStrategy === '__LEGACY__' ? 'TO_SPECIFIED_NODE' : rejectStrategy)) {
      toast.error('当前节点不允许回退');
      return;
    }
    if (rejectNeedsTarget && !historyNodes.some((node) => node.key === rejectTargetNode)) {
      toast.error('请选择驳回目标节点');
      return;
    }
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }

    setSubmitting(true);
    try {
      await rejectTask(task.id, rejectNeedsTarget ? rejectTargetNode : undefined, rejectReason,
        rejectStrategy === '__LEGACY__' ? undefined : rejectStrategy);

      const log = {
        operator: currentUser.name,
        action: '驳回',
        comment: rejectReason,
        time: new Date().toLocaleString(),
      };

      toast.success('任务已驳回');
      onComplete({
        ...task,
        status: rejectStrategy === 'TERMINATE' ? TaskStatus.REJECTED : TaskStatus.RETURNED,
        logs: [...(task.logs || []), log as any],
      });

      onClose();
      resetSubMode();
    } catch (error) {
      console.error('驳回失败:', error);
      toast.error(error instanceof Error ? error.message : '驳回失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SignatureModal
        isOpen={signatureModalOpen && canAct && !viewOnly}
        onClose={() => setSignatureModalOpen(false)}
        onSuccess={() => {
          setSignatureModalOpen(false);
          onComplete(task);
        }}
        taskId={task.id}
        mode={signatureMode}
        currentUser={currentUser}
      />

      <BaseDialog
        open={isOpen}
        title={headerTitle}
        description={headerDescription}
        onClose={closeOrBack}
        maxWidthClassName="max-w-6xl"
        panelClassName="max-h-[92vh] min-h-0 flex flex-col"
        bodyClassName="!p-0 min-h-0 flex flex-col overflow-hidden"
        headerAside={
          !delegationMode && !rejectMode ? (
            <SegmentedControl className="hidden min-h-9 sm:flex">
              <SegmentedControlItem
                size="sm"
                active={activeTab === 'handle'}
                onClick={() => setActiveTab('handle')}
              >
                {viewOnly ? '详情' : '处理'}
              </SegmentedControlItem>
              <SegmentedControlItem
                size="sm"
                active={activeTab === 'trace'}
                onClick={() => setActiveTab('trace')}
              >
                审批记录
              </SegmentedControlItem>
            </SegmentedControl>
          ) : null
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {!delegationMode && !rejectMode ? (
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:hidden">
              <SegmentedControl className="min-h-9">
                <SegmentedControlItem
                  size="sm"
                  active={activeTab === 'handle'}
                  onClick={() => setActiveTab('handle')}
                >
                  {viewOnly ? '详情' : '处理'}
                </SegmentedControlItem>
                <SegmentedControlItem
                  size="sm"
                  active={activeTab === 'trace'}
                  onClick={() => setActiveTab('trace')}
                >
                  审批记录
                </SegmentedControlItem>
              </SegmentedControl>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {activeTab === 'trace' && !delegationMode && !rejectMode ? (
              <ProcessTrace instanceId={task.processInstanceId} variant="default" />
            ) : rejectMode ? (
              <div className="admin-source-content-grid mx-auto max-w-3xl">
                <TaskModalPanel title="驳回方式">
                  <Select value={rejectStrategy} onValueChange={(value) => {
                    setRejectStrategy(value as RejectStrategy | '__LEGACY__');
                    setRejectTargetNode(value === 'TO_SPECIFIED_NODE' ? task.rejectToNodeKey ?? '' : '');
                  }}>
                    <SelectTrigger aria-label="驳回方式"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {!task.rejectStrategy && <SelectItem value="__LEGACY__">原有方式：退回已处理节点</SelectItem>}
                      {(Object.entries(REJECT_STRATEGY_LABELS) as Array<[RejectStrategy, string]>).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rejectStrategy === 'TO_PARENT_NODE' && <p className="mt-2 text-xs text-cf-muted">无父流程时退回发起人；父流程已结束时终止当前流程。</p>}
                </TaskModalPanel>
                {rejectNeedsTarget && (
                <TaskModalPanel
                  title="选择驳回目标"
                  description="仅列出已处理过的上游节点；不能退回当前节点、后续节点或并行兄弟节点。"
                >
                  {!historyNodesLoaded ? (
                    <TaskEmptyBlock title="正在加载历史节点..." loading />
                  ) : historyNodesError ? (
                    <div className="space-y-3">
                      <p role="alert" className="text-sm text-red-600 dark:text-red-300">{historyNodesError}</p>
                      <Button variant="outline" size="sm" onClick={() => setHistoryNodesLoaded(false)}>重新加载</Button>
                    </div>
                  ) : historyNodes.length > 0 ? (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {historyNodes.map((node) => (
                        <button
                          key={node.key}
                          type="button"
                          onClick={() => setRejectTargetNode(node.key)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition first:pt-0 last:pb-0',
                            rejectTargetNode === node.key
                              ? 'rounded-md border border-cyan-200 bg-[var(--cf-surface-strong)] text-cyan-700 dark:border-cyan-900 dark:bg-slate-950 dark:text-cyan-200'
                              : 'text-cf-body hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/60',
                          )}
                        >
                          <CornerUpLeft
                            size={16}
                            className={cn(
                              rejectTargetNode === node.key
                                ? 'text-cyan-700 dark:text-cyan-200'
                                : 'text-cf-faint',
                            )}
                          />
                          <span className="font-medium">{node.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <TaskEmptyBlock
                      title="当前没有可驳回的历史节点"
                      description="可选择退回发起人修改，或直接结束流程。"
                    />
                  )}
                </TaskModalPanel>
                )}

                <TaskModalPanel title="驳回原因">
                  <Textarea
                    rows={5}
                    placeholder="请填写驳回原因..."
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                  />
                </TaskModalPanel>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={resetSubMode} disabled={submitting}>
                    取消
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={submitting || (rejectNeedsTarget && (!historyNodesLoaded || Boolean(historyNodesError) || !historyNodes.some((node) => node.key === rejectTargetNode))) || !rejectReason.trim()}
                  >
                    {submitting ? '处理中...' : '确认驳回'}
                  </Button>
                </div>
              </div>
            ) : delegationMode ? (
              <div className="admin-source-content-grid mx-auto max-w-4xl">
                <TaskModalPanel
                  title="选择转办对象"
                  description="转办后当前待办会转交给新的处理人，原审批轨迹会保留本次操作记录。"
                >
                  {visibleDelegateUsers.length === 0 ? (
                    <TaskEmptyBlock title="暂无可转办用户" />
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {visibleDelegateUsers.map((user) => {
                        const active = delegateUser === user.id;
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => setDelegateUser(user.id)}
                            className={cn(
                              'flex w-full items-center gap-3 px-4 py-3 text-left transition first:pt-0 last:pb-0',
                              active
                                ? 'rounded-md border border-cyan-200 bg-[var(--cf-surface-strong)] dark:border-cyan-900 dark:bg-slate-950'
                                : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/60',
                            )}
                          >
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-md object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-sm font-semibold text-cf-muted dark:bg-slate-900">
                                {user.name?.slice(0, 1) || 'U'}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  'truncate font-medium',
                                  active
                                    ? 'text-cyan-700 dark:text-cyan-200'
                                    : 'text-cf-title',
                                )}
                              >
                                {user.name}
                              </div>
                              <div className="mt-1 text-xs text-cf-subtle">
                                {user.username ? `@${user.username}` : user.email || '暂无账号信息'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </TaskModalPanel>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={resetSubMode} disabled={submitting}>
                    取消
                  </Button>
                  <Button onClick={() => void handleAction('DELEGATED')} disabled={submitting || !delegateUser}>
                    {submitting ? '处理中...' : '确认转办'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="admin-dialog-stack">
                <TaskModalPanel title="基本信息" description="查看当前任务的节点状态、摘要和责任信息。">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-cf-title">
                        {task.workflowName}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <TaskModalBadge className={statusMeta.className}>
                          {statusMeta.icon}
                          {statusMeta.label}
                        </TaskModalBadge>
                        <TaskModalBadge className="border-slate-200 bg-[var(--cf-surface-muted)] text-cf-muted dark:border-slate-800 dark:bg-slate-900">
                          当前节点 {task.nodeName || task.currentNodeName || '-'}
                        </TaskModalBadge>
                      </div>
                      {summaryParts.length > 0 ? (
                        <div className="mt-3 text-xs leading-5 text-cf-subtle">
                          {summaryParts.join(' · ')}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:min-w-[340px]">
                      <TaskField label="申请人" value={task.applicantName || '-'} />
                      <TaskField
                        label="当前处理人"
                        value={task.assigneeName || task.assigneeId || '待认领'}
                        valueClassName="font-medium text-cyan-700 dark:text-cyan-200"
                      />
                      <TaskField label="创建时间" value={formatDateTime(task.createdTime)} />
                      <TaskField label="截止时间" value={formatDateTime(task.dueDate)} />
                    </div>
                  </div>

                  {!canAct && !agentMode && !viewOnly && task.status === TaskStatus.PENDING ? (
                    <div className="mt-4 rounded-md border border-amber-200 bg-[var(--cf-surface-strong)] px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-200">
                      您当前没有处理权限。当前待办归属：{task.assigneeRole || '指定人员'}。
                    </div>
                  ) : null}
                </TaskModalPanel>

                {task.totalSteps && task.totalSteps > 0 ? (
                  <TaskModalPanel title="流程进度">
                    <div className="grid gap-4">
                      <div className="admin-dialog-stack">
                        <TaskField
                          label="当前进度"
                          value={`${task.currentStepIndex || '-'} / ${task.totalSteps}`}
                          valueClassName="font-medium"
                        />
                        <TaskField label="当前节点" value={task.nodeName || task.currentNodeName || '-'} />
                        <TaskField label="下一节点" value={task.nextNodeName || '-'} />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-cf-subtle">
                          <span>完成度</span>
                          <span>{progressRate}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-md bg-cyan-600 dark:bg-cyan-400"
                            style={{ width: `${progressRate}%` }}
                          />
                        </div>
                        {task.stepsDetail && task.stepsDetail.length > 0 ? (
                          <div className="admin-horizontal-scroll mt-4 flex items-start gap-0 pb-1">
                            {task.stepsDetail.map((step, index) =>
                              renderStepNode(isRefundTask ? { ...step, approverDescription: getRefundApproverDescription(step.approverDescription) } : step,
                                index, task.stepsDetail?.length || 0),
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 flex items-center gap-1 text-[11px] text-cf-subtle">
                            {task.previousNodeName ? (
                              <span className="truncate max-w-[40%]">
                                {task.previousOperatorName || task.previousNodeName}
                              </span>
                            ) : null}
                            <ChevronRight size={12} />
                            <span className="truncate font-medium text-cf-title">
                              {task.nodeName || task.currentNodeName || '当前'}
                            </span>
                            {task.nextNodeName ? (
                              <>
                                <ChevronRight size={12} />
                                <span className="truncate max-w-[30%]">{task.nextNodeName}</span>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </TaskModalPanel>
                ) : null}

                <div className="grid gap-4">
                  <div className="admin-dialog-stack">
                    {task.processInstanceId && (!scopedForm || scopedForm.error) ? (
                      <TaskModalPanel title="读取当前节点表单"><div role={scopedForm?.error ? 'alert' : 'status'} className="text-sm text-cf-subtle">{scopedForm?.error || '正在按当前节点读取允许查看的字段…'}</div></TaskModalPanel>
                    ) : null}
                    {task.formId && scopedForm && !scopedForm.error && !currentFormDef ? (
                      <TaskModalPanel title="表单定义缺失">
                        <div className="rounded-md border border-amber-200 bg-[var(--cf-surface-strong)] px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-200">
                          未加载到表单定义，当前显示原始业务字段。
                        </div>
                      </TaskModalPanel>
                    ) : null}

                    {isSettlementTask ? (
                      <TaskModalPanel title="离职结算财务复核" description="独立财务复核，提交人与离职本人回避；通过后仍待结算确认及实际收付款。">
                        {settlementDetail ? <div data-testid="settlement-approval-summary" className="space-y-4">
                          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                            <TaskField label="员工" value={settlementDetail.employeeName} valueClassName="break-all" />
                            <TaskField label="结算单号" value={settlementDetail.settlementNo} valueClassName="break-all" />
                            {settlementDetail.settlementKind === 'REVERSAL' && <>
                              <TaskField label="单据类型" value="冲正单：按原已入账金额反向处理" valueClassName="break-all" />
                              <TaskField label="原结算单号" value={settlementDetail.reversal.originalSettlementNo || '原单关系待核对'} valueClassName="break-all" />
                              <TaskField label="冲正原因" value={settlementDetail.remark || '未填写'} valueClassName="break-all whitespace-pre-wrap" />
                            </>}
                            <TaskField label="离职日期" value={settlementDetail.relievingDate} />
                            <TaskField label="补偿政策" value={settlementDetail.ruleName || '未核定'} valueClassName="break-all" />
                            <TaskField label="应付合计" value={`${settlementDetail.totalPayable}元`} />
                            <TaskField label="经济补偿" value={`${settlementDetail.severanceAmount}元`} />
                            <TaskField label="应收合计" value={`${settlementDetail.totalReceivable}元`} />
                            <TaskField label="资产损失" value={`${settlementDetail.assetRecoveryCost}元`} />
                            <TaskField label="结算净额" value={`${settlementDetail.netAmount}元`} />
                            <TaskField label="取样月份" value={settlementDetail.sampling?.months.join('、') || '未核定'} valueClassName="break-all" />
                            <TaskField label="平均月份数" value={settlementDetail.sampling?.averagingMonths || '未核定'} />
                            <TaskField label="取样核定原因" value={settlementDetail.sampling?.reason || '未核定'} valueClassName="break-all whitespace-pre-wrap" />
                          </div>
                          <p className="text-sm text-cf-subtle">各项金额四舍五入到分后合计；净额为正表示向员工支付，为负表示向员工收取。</p>
                          {settlementDetail.items.map(item => <div key={item.itemId} className="flex flex-wrap justify-between gap-2 border-t border-[var(--cf-border)] pt-3 text-sm">
                            <span className="min-w-0 break-all">{item.itemName}</span><span>{item.amount}元</span>
                          </div>)}
                          <a className="inline-flex min-h-11 items-center text-cf-primary underline" href={`/hr/final-settlements?settlementId=${settlementDetail.settlementId}`} target="_blank" rel="noopener noreferrer">查看完整结算依据</a>
                        </div> : <div role={scopedSettlement?.error ? 'alert' : 'status'} className="text-sm text-cf-subtle">
                          {scopedSettlement?.error ? `${scopedSettlement.error}；请关闭后重新打开核对，当前不能同意。` : '正在读取结算金额、取样核定和来源明细…'}
                        </div>}
                      </TaskModalPanel>
                    ) : isAdvanceTask ? (
                      <TaskModalPanel title="员工借款申请" description="部门负责人先审批、财务复核；通过后等待实际放款。额度已按提交时生效的固定月薪和已发布规则核验。">
                        {advanceDetail ? <div data-testid="advance-approval-summary" className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                          <TaskField label="员工" value={advanceDetail.employeeName} valueClassName="break-all" />
                          <TaskField label="借款单号" value={advanceDetail.advanceNo} valueClassName="break-all" />
                          <TaskField label="申请金额" value={`${advanceDetail.amount}元`} />
                          <TaskField label="申请日期" value={advanceDetail.applyDate} />
                          <TaskField label="用途" value={advanceDetail.purpose} valueClassName="break-all whitespace-pre-wrap" />
                          <TaskField label="还款计划" value={advanceDetail.repayMode === 'LUMP_SUM' ? '一次性归还' : `${advanceDetail.repayStartMonth}起，计划${advanceDetail.repayMonths}期，每期${advanceDetail.monthlyDeductAmount}元，末期按余额`} valueClassName="break-all" />
                        </div> : <div role={scopedAdvance?.error ? 'alert' : 'status'} className="text-sm text-cf-subtle">
                          {scopedAdvance?.error ? `${scopedAdvance.error}；请关闭后重新打开核对，当前不能同意。` : '正在读取借款金额、用途和还款计划…'}
                        </div>}
                      </TaskModalPanel>
                    ) : isRefundTask ? (
                      <TaskModalPanel title="原收款退款" description="申请提交时已固定原收款、金额与审批顺序，办理时仅可查看。客户业务负责人先审批，再由另一名财务复核，两段通过后才扣减到账。">
                        {refundFields ? (
                          <div data-testid="refund-approval-summary" className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                            {refundFields.map(field => <TaskField key={field.key} label={field.label} value={field.value} valueClassName="font-medium break-all whitespace-pre-wrap" />)}
                          </div>
                        ) : (
                          <div role={scopedForm ? 'alert' : 'status'} className="text-sm text-cf-subtle">
                            {scopedForm ? '退款详情未完整读取，请关闭后重新打开核对；当前不能同意。' : '正在读取原收款退款详情…'}
                          </div>
                        )}
                      </TaskModalPanel>
                    ) : currentFormDef ? (
                      <TaskModalPanel
                        title="表单内容"
                        description={
                          canEditForm
                            ? '当前字段允许编辑，保存审批操作时会一并提交变更。'
                            : '当前以只读方式展示表单内容。'
                        }
                      >
                        <FormRenderer
                          ref={formRenderer}
                          formDef={currentFormDef}
                          data={editedFormData}
                          fieldPermissions={scopedForm?.permissions}
                          fieldErrors={formErrors}
                          renderUploadField={attachments.renderUploadField}
                          renderReferenceField={task.processInstanceId ? (reference) => <WorkflowTaskReferenceField {...reference}
                            identity={formOwner} taskId={task.id} formVersionKey={JSON.stringify([currentFormDef.id, currentFormDef.version, scopedForm?.nodeKey])}
                            enabled={isOpen && canEditForm} /> : undefined}
                          submitDisabled={attachments.uploading}
                          nodeKey={scopedForm?.nodeKey}
                          readonly={!canEditForm}
                          hideActions
                          onDataChange={(data) => { setEditedFormData(data); setFormErrors({}); }}
                        />
                      </TaskModalPanel>
                    ) : visibleBusinessEntries.length > 0 ? (
                      <TaskModalPanel title="业务数据">
                        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                          {visibleBusinessEntries.map(([key, value]) => {
                            const formData = task.formData as Record<string, unknown>;
                            const label = getWorkflowFieldLabel(key);
                            const displayValue = formatWorkflowFieldValue(key, value, formData);

                            return (
                              <TaskField
                                key={key}
                                label={label}
                                value={displayValue}
                                valueClassName="font-medium"
                              />
                            );
                          })}
                        </div>
                      </TaskModalPanel>
                    ) : null}

                    {businessAttachments.value ? (
                      <TaskModalPanel title="附件">
                        {businessAttachments.downloadContext ? (
                          <AttachmentLinks value={businessAttachments.value} downloadContext={businessAttachments.downloadContext} />
                        ) : <p role="status" className="text-sm text-cf-subtle">请从原业务记录打开附件，核对当前访问权限。</p>}
                      </TaskModalPanel>
                    ) : null}
                  </div>

                  <div className="admin-dialog-stack">
                    {task.logs && task.logs.length > 0 ? (
                      <TaskModalPanel title="流转记录">
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {task.logs.map((log, index) => (
                            <div key={`${log.time}-${index}`} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm font-medium text-cf-title">
                                  {log.operator}
                                  <span className="font-normal text-cf-subtle">
                                    {' '}
                                    · {log.action}
                                  </span>
                                </div>
                                <div className="text-[11px] text-cf-faint">
                                  {log.time}
                                </div>
                              </div>
                              {log.comment ? (
                                <div className="mt-1 text-xs leading-5 text-cf-subtle">
                                  {log.comment}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </TaskModalPanel>
                    ) : null}
                  </div>
                </div>

                {!viewOnly && agentMode && <WorkflowAgentActions key={`${formOwner}:${task.id}:${task.version}`} task={task} currentUser={currentUser} disabled={submitting} onBusyChange={setSubmitting} onChanged={updated => { onComplete(updated); onClose(); }} />}
                {canAct && !viewOnly ? (
                  <TaskModalPanel title="审批操作">
                    <div className="grid gap-4">
                      <Textarea
                        rows={5}
                        placeholder="请输入审批意见..."
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                      />

                      <div className="grid gap-3">
                        {hasBtn('ADD_SIGN') || hasBtn('REDUCE_SIGN') ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {hasBtn('ADD_SIGN') && (
                            <Button
                              variant="soft"
                              onClick={() => {
                                setSignatureMode('add');
                                setSignatureModalOpen(true);
                              }}
                              disabled={submitting}
                            >
                              <UserPlus size={14} />
                              加签
                            </Button>
                            )}
                            {hasBtn('REDUCE_SIGN') && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSignatureMode('reduce');
                                setSignatureModalOpen(true);
                              }}
                              disabled={submitting}
                            >
                              <UserMinus size={14} />
                              减签
                            </Button>
                            )}
                          </div>
                        ) : null}

                        {confirmAction ? (
                          <div className="rounded-md border border-amber-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-amber-800 dark:bg-slate-950">
                            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-200">
                              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                              <div className="flex-1">
                                确认{confirmAction === 'APPROVED' ? '同意' : '拒绝'}此任务？
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <Button variant="ghost" size="sm" className={isRefundTask ? '!min-h-11 !min-w-11' : undefined} onClick={() => setConfirmAction(null)}>
                                取消
                              </Button>
                              <Button
                                size="sm"
                                className={isRefundTask ? '!min-h-11 !min-w-11' : undefined}
                                variant={confirmAction === 'APPROVED' ? 'default' : 'destructive'}
                                onClick={() => void handleAction(confirmAction)}
                                disabled={submitting || confirmAction === 'APPROVED' && (isSettlementTask && !settlementDetail || isRefundTask && !refundFields || isAdvanceTask && !advanceDetail)}
                              >
                                {submitting ? '处理中...' : '确认'}
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2">
                          {hasBtn('RETURN') ? (
                            <Button variant="outline" onClick={() => setRejectMode(true)} disabled={submitting}>
                              <CornerUpLeft size={14} />
                              驳回
                            </Button>
                          ) : null}
                          {hasBtn('DELEGATE') ? (
                            <Button variant="outline" onClick={() => setDelegationMode(true)} disabled={submitting}>
                              转办
                            </Button>
                          ) : null}
                          {hasBtn('REJECT') ? (
                            <Button
                              variant="destructive"
                              className={isRefundTask ? '!min-h-11 !min-w-11' : undefined}
                              onClick={() => setConfirmAction('REJECTED')}
                              disabled={submitting}
                            >
                              拒绝
                            </Button>
                          ) : null}
                          {hasBtn('APPROVE') ? (
                            <Button className={isSettlementTask || isRefundTask || isAdvanceTask ? '!min-h-11 !min-w-11' : undefined} onClick={() => setConfirmAction('APPROVED')} disabled={submitting || attachments.uploading || isSettlementTask && !settlementDetail || isRefundTask && !refundFields || isAdvanceTask && !advanceDetail}>
                              {submitting ? '处理中...' : '同意'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TaskModalPanel>
                ) : viewOnly ? (
                  <TaskModalPanel title="说明">
                    <div className="text-sm leading-6 text-cf-subtle">
                      当前页面来自“我的申请”，仅支持查看详情和流程轨迹。
                    </div>
                  </TaskModalPanel>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </BaseDialog>
    </>
  );
};

export default TaskHandleModal;
