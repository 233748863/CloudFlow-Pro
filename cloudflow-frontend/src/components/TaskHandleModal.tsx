import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CornerUpLeft,
  Download,
  ExternalLink,
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
import { Button, LoadingSpinner, SegmentedControl, SegmentedControlItem, Textarea } from '@/components/common';
import { cn } from '@/utils/cn';
import { formatDateTimeDisplay as formatDateTime } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAttachmentDisplayName, isAttachmentImage, normalizeAttachmentUrl } from '@/utils/attachment';
import { FormRenderer } from './FormRenderer';
import { ProcessTrace } from './ProcessTrace';
import { SignatureModal } from './SignatureModal';
import { getUserList } from '../services/api/auth';
import { completeTask, getProcessTrace, readTask, rejectTask } from '../services/api/workflow';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { FormDefinition, Role, StepDetail, Task, TaskStatus, User } from '../types';
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
      'border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  },
  [TaskStatus.APPROVED]: {
    label: '已通过',
    icon: <CheckCircle2 size={12} />,
    className:
      'border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
  [TaskStatus.REJECTED]: {
    label: '已拒绝',
    icon: <XCircle size={12} />,
    className:
      'border border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  },
  [TaskStatus.RETURNED]: {
    label: '已退回',
    icon: <ArrowLeftCircle size={12} />,
    className:
      'border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  },
  [TaskStatus.DELEGATED]: {
    label: '已转办',
    icon: <UserPlus size={12} />,
    className:
      'border border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200',
  },
  [TaskStatus.TIMED_OUT]: {
    label: '已超时',
    icon: <AlertTriangle size={12} />,
    className:
      'border border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
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
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
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
      'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950',
      className,
    )}
  >
    <div className="flex flex-col gap-1">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description ? (
        <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
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
    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className={cn('break-words text-sm text-slate-900 dark:text-slate-100', valueClassName)}>
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
  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-800">
    {loading ? <LoadingSpinner size="sm" className="mx-auto" /> : null}
    <div className={cn('text-sm font-medium text-slate-700 dark:text-slate-200', loading && 'mt-3')}>
      {title}
    </div>
    {description ? (
      <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const extractAttachmentFiles = (formData?: Record<string, any>) => {
  const attachmentUrl = formData?.attachmentUrl;
  if (!attachmentUrl || typeof attachmentUrl !== 'string' || !attachmentUrl.trim()) {
    return [];
  }

  return attachmentUrl
    .split(',')
    .filter(Boolean)
    .map((url) => {
      const trimmed = url.trim();
      const normalizedUrl = normalizeAttachmentUrl(trimmed);
      const name = getAttachmentDisplayName(trimmed);
      const isImg = isAttachmentImage(trimmed);
      return { url: normalizedUrl, name, isImg };
    });
};

const renderStepNode = (step: StepDetail, index: number, total: number) => {
  const isCompleted = step.status === 'completed';
  const isActive = step.status === 'active';
  const dotClass = isCompleted
    ? 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-950/50'
    : isActive
      ? 'bg-cyan-500 ring-cyan-100 dark:ring-cyan-950/50'
      : 'bg-slate-300 ring-slate-100 dark:bg-slate-600 dark:ring-slate-900';
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
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                : isActive
                  ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
                  : 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500',
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
                  : 'text-slate-400 dark:text-slate-500',
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
                      ? 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-950/50'
                      : branchActive
                        ? 'bg-cyan-500 ring-cyan-100 dark:ring-cyan-950/50'
                        : 'bg-slate-300 ring-slate-100 dark:bg-slate-600 dark:ring-slate-900';

                    return (
                      <div key={`${branchStep.nodeKey}-${branchStepIndex}`} className="flex items-start">
                        <div className="flex min-w-[54px] max-w-[68px] flex-col items-center">
                          <div className={cn('h-2.5 w-2.5 rounded-full ring-2', branchDotClass)} />
                          <span
                            className={cn(
                              'mt-1 text-center text-[8px] leading-tight',
                              branchActive
                                ? 'font-semibold text-cyan-700 dark:text-cyan-200'
                                : branchCompleted
                                  ? 'text-emerald-700 dark:text-emerald-200'
                                  : 'text-slate-400 dark:text-slate-500',
                            )}
                          >
                            {branchStep.nodeTitle}
                          </span>
                          <span className="mt-0.5 line-clamp-1 text-center text-[7px] text-slate-400 dark:text-slate-500">
                            {branchCompleted && branchStep.operatorName
                              ? branchStep.operatorName
                              : branchStep.approverDescription}
                          </span>
                          {branchStep.signType ? (
                            <TaskModalBadge className="mt-1 border border-amber-100 bg-amber-50 text-[7px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
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
        <div className={cn('h-3 w-3 rounded-full ring-2', dotClass)} />
        <span
          className={cn(
            'mt-1 text-center text-[9px] leading-tight',
            isActive
              ? 'font-semibold text-cyan-700 dark:text-cyan-200'
              : isCompleted
                ? 'text-emerald-700 dark:text-emerald-200'
                : 'text-slate-400 dark:text-slate-500',
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
                : 'text-slate-400 dark:text-slate-500',
          )}
        >
          {isCompleted && step.operatorName ? step.operatorName : step.approverDescription}
        </span>
        {step.signType ? (
          <TaskModalBadge className="mt-1 border border-amber-100 bg-amber-50 text-[7px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
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
          <span className="mt-1 flex items-center gap-0.5 text-[7px] text-slate-400 dark:text-slate-500">
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
  const [delegationMode, setDelegationMode] = useState(false);
  const [delegateUser, setDelegateUser] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [hasTriedLoadUsers, setHasTriedLoadUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectTargetNode, setRejectTargetNode] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [historyNodes, setHistoryNodes] = useState<Array<{ key: string; name: string }>>([]);
  const [historyNodesLoaded, setHistoryNodesLoaded] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'add' | 'reduce'>('add');

  useEffect(() => {
    const isTaskActionable =
      task?.assigneeId === currentUser.id ||
      Boolean(task?.assigneeRole && currentUser.role === task.assigneeRole) ||
      currentUser.role === Role.ADMIN;
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
    if (rejectMode && task && task.processInstanceId && !historyNodesLoaded) {
      getProcessTrace(task.processInstanceId)
        .then((res) => {
          if (res?.historyDetails && Array.isArray(res.historyDetails)) {
            const nodes = res.historyDetails
              .filter((item: any) => item.nodeKey && item.nodeName)
              .map((item: any) => ({ key: item.nodeKey, name: item.nodeName }))
              .filter(
                (node: { key: string; name: string }, index: number, self: Array<{ key: string; name: string }>) =>
                  index === self.findIndex((candidate) => candidate.key === node.key),
              );
            setHistoryNodes(nodes);
          } else {
            setHistoryNodes([]);
          }
          setHistoryNodesLoaded(true);
        })
        .catch((error) => {
          console.error('加载历史节点失败:', error);
          toast.error(getErrorMessage(error, '加载历史节点失败'));
          setHistoryNodesLoaded(true);
        });
    }
  }, [historyNodesLoaded, rejectMode, task]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('handle');
      setDelegationMode(false);
      setDelegateUser('');
      setRejectMode(false);
      setRejectTargetNode('');
      setRejectReason('');
      setHistoryNodes([]);
      setHistoryNodesLoaded(false);
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

  const isAssignee =
    task.assigneeId === currentUser.id ||
    (task.assigneeRole && currentUser.role === task.assigneeRole) ||
    currentUser.role === Role.ADMIN;
  const canAct = isAssignee && (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED);
  const currentFormDef =
    task.type === 'DYNAMIC' && task.formId ? availableForms.find((item) => item.id === task.formId) : null;
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
      'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  };
  const showAllButtons = !task.buttonPermissions || task.buttonPermissions.length === 0;
  const hasBtn = (code: string) => showAllButtons || task.buttonPermissions!.includes(code);
  const attachmentFiles = extractAttachmentFiles(task.formData as Record<string, any> | undefined);
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
      ? '选择一个已完成节点作为驳回目标，并填写驳回原因。'
      : activeTab === 'trace'
        ? '查看该流程的审批记录和流程图轨迹。'
        : '在统一任务弹层内查看详情、编辑表单并执行审批操作。';

  const buildEditableVariables = (): Record<string, any> | undefined => {
    if (!(task.allowEdit && canAct && !viewOnly)) {
      return undefined;
    }

    const source = editedFormData || {};
    if (!currentFormDef || !Array.isArray(currentFormDef.fields) || currentFormDef.fields.length === 0) {
      return source;
    }

    const allowedKeys = new Set<string>();
    currentFormDef.fields.forEach((field) => {
      if (field.id) allowedKeys.add(field.id);
      if (field.label) allowedKeys.add(field.label);
    });

    const filtered = Object.fromEntries(
      Object.entries(source).filter(([key]) => allowedKeys.has(key)),
    );

    return Object.keys(filtered).length > 0 ? filtered : source;
  };

  const resetSubMode = () => {
    setDelegationMode(false);
    setDelegateUser('');
    setRejectMode(false);
    setRejectTargetNode('');
    setRejectReason('');
  };

  const closeOrBack = () => {
    if (delegationMode || rejectMode) {
      resetSubMode();
      return;
    }
    onClose();
  };

  const handleAction = async (action: 'APPROVED' | 'REJECTED' | 'DELEGATED') => {
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
      console.error('任务处理失败:', error);
      toast.error(error instanceof Error ? error.message : '任务处理失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTargetNode) {
      toast.error('请选择驳回目标节点');
      return;
    }
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }

    setSubmitting(true);
    try {
      await rejectTask(task.id, rejectTargetNode, rejectReason);

      const log = {
        operator: currentUser.name,
        action: '驳回',
        comment: rejectReason,
        time: new Date().toLocaleString(),
      };

      toast.success('任务已驳回');
      onComplete({
        ...task,
        status: TaskStatus.RETURNED,
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
        isOpen={signatureModalOpen}
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
              <div className="mx-auto max-w-3xl space-y-4">
                <TaskModalPanel
                  title="选择驳回目标"
                  description="只能选择历史上已处理过的节点作为驳回目标，驳回后流程将回退到该节点。"
                >
                  {!historyNodesLoaded ? (
                    <TaskEmptyBlock title="正在加载历史节点..." loading />
                  ) : historyNodes.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {historyNodes.map((node) => (
                        <button
                          key={node.key}
                          type="button"
                          onClick={() => setRejectTargetNode(node.key)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition first:pt-0 last:pb-0',
                            rejectTargetNode === node.key
                              ? 'rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/20 dark:text-cyan-200'
                              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900/60',
                          )}
                        >
                          <CornerUpLeft
                            size={16}
                            className={cn(
                              rejectTargetNode === node.key
                                ? 'text-cyan-700 dark:text-cyan-200'
                                : 'text-slate-400 dark:text-slate-500',
                            )}
                          />
                          <span className="font-medium">{node.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <TaskEmptyBlock
                      title="当前没有可驳回的历史节点"
                      description="若需终止流程，请在详情区直接执行拒绝。"
                    />
                  )}
                </TaskModalPanel>

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
                    disabled={submitting || !rejectTargetNode || !rejectReason.trim()}
                  >
                    {submitting ? '处理中...' : '确认驳回'}
                  </Button>
                </div>
              </div>
            ) : delegationMode ? (
              <div className="mx-auto max-w-4xl space-y-4">
                <TaskModalPanel
                  title="选择转办对象"
                  description="转办后当前待办会转交给新的处理人，原审批轨迹会保留本次操作记录。"
                >
                  {visibleDelegateUsers.length === 0 ? (
                    <TaskEmptyBlock title="暂无可转办用户" />
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
                                ? 'rounded-lg bg-cyan-50 dark:bg-cyan-950/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-900/60',
                            )}
                          >
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} className="h-10 w-10 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                {user.name?.slice(0, 1) || 'U'}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  'truncate font-medium',
                                  active
                                    ? 'text-cyan-700 dark:text-cyan-200'
                                    : 'text-slate-900 dark:text-slate-100',
                                )}
                              >
                                {user.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
              <div className="space-y-4">
                <TaskModalPanel title="基本信息" description="查看当前任务的节点状态、摘要和责任信息。">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {task.workflowName}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <TaskModalBadge className={statusMeta.className}>
                          {statusMeta.icon}
                          {statusMeta.label}
                        </TaskModalBadge>
                        <TaskModalBadge className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                          当前节点 {task.nodeName || task.currentNodeName || '-'}
                        </TaskModalBadge>
                      </div>
                      {summaryParts.length > 0 ? (
                        <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
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

                  {!canAct && !viewOnly && task.status === TaskStatus.PENDING ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      您当前没有处理权限。当前待办归属：{task.assigneeRole || '指定人员'}。
                    </div>
                  ) : null}
                </TaskModalPanel>

                {task.totalSteps && task.totalSteps > 0 ? (
                  <TaskModalPanel title="流程进度">
                    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <TaskField
                          label="当前进度"
                          value={`${task.currentStepIndex || '-'} / ${task.totalSteps}`}
                          valueClassName="font-medium"
                        />
                        <TaskField label="当前节点" value={task.nodeName || task.currentNodeName || '-'} />
                        <TaskField label="下一节点" value={task.nextNodeName || '-'} />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>完成度</span>
                          <span>{progressRate}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-600 dark:bg-cyan-400"
                            style={{ width: `${progressRate}%` }}
                          />
                        </div>
                        {task.stepsDetail && task.stepsDetail.length > 0 ? (
                          <div className="mt-4 flex items-start gap-0 overflow-x-auto pb-1">
                            {task.stepsDetail.map((step, index) =>
                              renderStepNode(step, index, task.stepsDetail?.length || 0),
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {task.previousNodeName ? (
                              <span className="truncate max-w-[40%]">
                                {task.previousOperatorName || task.previousNodeName}
                              </span>
                            ) : null}
                            <ChevronRight size={12} />
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
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

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-4">
                    {task.formId && !currentFormDef ? (
                      <TaskModalPanel title="表单定义缺失">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                          未加载到表单定义，当前显示原始业务字段。
                        </div>
                      </TaskModalPanel>
                    ) : null}

                    {currentFormDef && task.formData ? (
                      <TaskModalPanel
                        title="表单内容"
                        description={
                          canAct && !viewOnly && task.allowEdit
                            ? '当前字段允许编辑，保存审批操作时会一并提交变更。'
                            : '当前以只读方式展示表单内容。'
                        }
                      >
                        <FormRenderer
                          formDef={currentFormDef}
                          data={editedFormData}
                          readonly={!(canAct && !viewOnly && task.allowEdit)}
                          hideActions
                          onChange={(id, value) =>
                            setEditedFormData((previous) => ({ ...previous, [id]: value }))
                          }
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

                    {attachmentFiles.length > 0 ? (
                      <TaskModalPanel title="附件">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {attachmentFiles.map((file, index) => (
                            <div
                              key={`${file.url}-${index}`}
                              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0 flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                  <FileText size={15} />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {file.name}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {file.isImg ? '图片附件' : '文件附件'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                >
                                  <ExternalLink size={14} />
                                  查看
                                </a>
                                <a
                                  href={file.url}
                                  download={file.name}
                                  className="btn btn-secondary btn-sm"
                                >
                                  <Download size={14} />
                                  下载
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TaskModalPanel>
                    ) : null}
                  </div>

                  <div className="space-y-4 xl:border-l xl:border-slate-200 xl:pl-5 dark:xl:border-slate-800">
                    {task.logs && task.logs.length > 0 ? (
                      <TaskModalPanel title="流转记录">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {task.logs.map((log, index) => (
                            <div key={`${log.time}-${index}`} className="py-3 first:pt-0 last:pb-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {log.operator}
                                  <span className="font-normal text-slate-500 dark:text-slate-400">
                                    {' '}
                                    · {log.action}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {log.time}
                                </div>
                              </div>
                              {log.comment ? (
                                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
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

                {canAct && !viewOnly ? (
                  <TaskModalPanel title="审批操作">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
                      <Textarea
                        rows={5}
                        placeholder="请输入审批意见..."
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                      />

                      <div className="space-y-3 xl:border-l xl:border-slate-200 xl:pl-5 dark:xl:border-slate-800">
                        {hasBtn('ADD_SIGN') ? (
                          <div className="grid gap-2 sm:grid-cols-2">
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
                          </div>
                        ) : null}

                        {confirmAction ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
                            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-200">
                              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                              <div className="flex-1">
                                确认{confirmAction === 'APPROVED' ? '同意' : '拒绝'}此任务？
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
                                取消
                              </Button>
                              <Button
                                size="sm"
                                variant={confirmAction === 'APPROVED' ? 'default' : 'destructive'}
                                onClick={() => void handleAction(confirmAction)}
                                disabled={submitting}
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
                              onClick={() => setConfirmAction('REJECTED')}
                              disabled={submitting}
                            >
                              拒绝
                            </Button>
                          ) : null}
                          {hasBtn('APPROVE') ? (
                            <Button onClick={() => setConfirmAction('APPROVED')} disabled={submitting}>
                              {submitting ? '处理中...' : '同意'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TaskModalPanel>
                ) : viewOnly ? (
                  <TaskModalPanel title="说明">
                    <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">
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
