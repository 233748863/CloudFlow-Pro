import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftCircle,
  Ban,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Edit3,
  GitBranch,
  GitMerge,
  RotateCcw,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';
import { recallProcess } from '../services/api/workflow';
import { StepDetail, Task, TaskStatus } from '../types';
import { getWorkflowSummaryParts } from '../utils/workflowFormDisplay';

interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  showRecallButton?: boolean;
  onRecallSuccess?: () => void;
}

const statusBadgeMap: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  [TaskStatus.PENDING]: {
    label: '待处理',
    icon: <Clock size={12} />,
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
  [TaskStatus.TIMED_OUT]: {
    label: '已超时',
    icon: <AlertTriangle size={12} />,
    className:
      'border border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
  },
  [TaskStatus.RETURNED]: {
    label: '已退回',
    icon: <ArrowLeftCircle size={12} />,
    className:
      'border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  },
  [TaskStatus.MODIFIED]: {
    label: '已修改',
    icon: <Edit3 size={12} />,
    className:
      'border border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
  },
  [TaskStatus.DELEGATED]: {
    label: '已转办',
    icon: <UserPlus size={12} />,
    className:
      'border border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-200',
  },
};

const TaskChip = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
      className,
    )}
  >
    {children}
  </span>
);

const getStatusBadge = (status: TaskStatus, task?: Task) => {
  if (task?.backendStatus === 'REVOKED') {
    return (
      <TaskChip className="border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <Ban size={12} />
        已撤回
      </TaskChip>
    );
  }

  const config = statusBadgeMap[status];
  if (!config) return null;

  return (
    <TaskChip className={config.className}>
      {config.icon}
      {config.label}
    </TaskChip>
  );
};

const isOverdue = (task: Task) =>
  Boolean(task.dueDate && new Date(task.dueDate) < new Date() && task.status === TaskStatus.PENDING);

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

          {step.branches && step.branches.length > 0 ? (
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
                            <TaskChip className="mt-1 border border-amber-100 bg-amber-50 text-[7px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                              {branchStep.signType === 'ALL'
                                ? '全签'
                                : branchStep.signType === 'ANY'
                                  ? '或签'
                                  : branchStep.signType === 'SEQUENTIAL'
                                    ? '顺序签'
                                    : `${branchStep.passPercent || 0}%`}
                            </TaskChip>
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
          title={
            isCompleted && step.operatorName
              ? `实际处理: ${step.operatorName}`
              : `${step.approverTypeLabel}: ${step.approverDescription}`
          }
        >
          {isCompleted && step.operatorName ? step.operatorName : step.approverDescription}
        </span>
        {step.signType ? (
          <TaskChip className="mt-1 border border-amber-100 bg-amber-50 text-[7px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <Users size={8} />
            {step.signType === 'ALL'
              ? '全签'
              : step.signType === 'ANY'
                ? '或签'
                : step.signType === 'SEQUENTIAL'
                  ? '顺序签'
                  : `${step.passPercent}%`}
          </TaskChip>
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

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onTaskClick,
  showRecallButton = false,
  onRecallSuccess,
}) => {
  const [recalling, setRecalling] = useState<string | null>(null);
  const [confirmRecall, setConfirmRecall] = useState<string | null>(null);

  const handleRecall = async (event: React.MouseEvent, task: Task) => {
    event.stopPropagation();

    if (!task.processInstanceId) {
      toast.error('无法获取流程实例 ID');
      return;
    }

    setRecalling(task.id);
    try {
      await recallProcess(task.processInstanceId);
      toast.success('流程已撤回');
      setConfirmRecall(null);
      onRecallSuccess?.();
    } catch (error) {
      console.error('撤回失败:', error);
      toast.error(error instanceof Error ? error.message : '撤回失败，请重试');
    } finally {
      setRecalling(null);
    }
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
          <ClipboardCheck size={24} />
        </div>
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100">暂无流程任务</div>
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          当前筛选条件下没有匹配的审批记录。
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {tasks.map((task) => {
        const canRecall = showRecallButton && task.status === TaskStatus.PENDING;
        const overdue = isOverdue(task);
        const summaryParts =
          task.formData && Object.keys(task.formData).length > 0
            ? getWorkflowSummaryParts(task.formData as Record<string, any>, 3)
            : [];
        const progressRate =
          task.totalSteps && task.currentStepIndex
            ? Math.min(100, Math.round((task.currentStepIndex / task.totalSteps) * 100))
            : 0;

        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={() => onTaskClick?.(task)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onTaskClick?.(task);
              }
            }}
            className={cn(
              'group rounded-[24px] border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-950/88',
              overdue
                ? 'border-rose-200 hover:border-rose-300 dark:border-rose-900/40 dark:hover:border-rose-800/60'
                : 'border-slate-200 hover:border-cyan-200 dark:border-slate-800 dark:hover:border-cyan-900',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold leading-6 text-slate-900 transition-colors group-hover:text-cyan-700 dark:text-slate-100 dark:group-hover:text-cyan-200">
                  {task.workflowName}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 dark:bg-cyan-500" />
                  当前节点：{task.nodeName}
                </div>
              </div>
              {getStatusBadge(task.status, task)}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  当前处理人
                </div>
                <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {task.assigneeName || task.assigneeId || '待认领'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  发起人
                </div>
                <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {task.applicantName}
                </div>
              </div>
            </div>

            {summaryParts.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {summaryParts.map((part) => (
                  <TaskChip
                    key={part}
                    className="border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                  >
                    {part}
                  </TaskChip>
                ))}
              </div>
            ) : null}

            {task.totalSteps && task.totalSteps > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">流程进度</span>
                  <span className="font-medium text-cyan-700 dark:text-cyan-200">
                    {task.currentStepIndex || '-'} / {task.totalSteps} · {progressRate}%
                  </span>
                </div>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
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
                  <div className="mt-4 flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                    {task.previousNodeName ? (
                      <span className="truncate max-w-[40%]" title={`上一步: ${task.previousNodeName}`}>
                        {task.previousOperatorName || task.previousNodeName}
                      </span>
                    ) : null}
                    <ChevronRight size={10} />
                    <span className="truncate font-medium text-cyan-700 dark:text-cyan-200">
                      {task.nodeName || task.currentNodeName || '当前'}
                    </span>
                    {task.nextNodeName ? (
                      <>
                        <ChevronRight size={10} />
                        <span className="truncate max-w-[30%]">{task.nextNodeName}</span>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-2">
                <TaskChip className="border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  创建 {new Date(task.createdTime).toLocaleDateString('zh-CN')}
                </TaskChip>
                {task.dueDate ? (
                  <TaskChip
                    className={cn(
                      'border',
                      overdue
                        ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
                        : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
                    )}
                  >
                    <Clock size={12} />
                    截止 {new Date(task.dueDate).toLocaleDateString('zh-CN')}
                  </TaskChip>
                ) : null}
              </div>
            </div>

            {canRecall ? (
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                {confirmRecall === task.id ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      确认撤回该流程？
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmRecall(null);
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={recalling === task.id}
                        onClick={(event) => void handleRecall(event, task)}
                      >
                        <RotateCcw size={14} />
                        {recalling === task.id ? '撤回中...' : '确认撤回'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="soft"
                    size="sm"
                    className="w-full justify-center"
                    onClick={(event) => {
                      event.stopPropagation();
                      setConfirmRecall(task.id);
                    }}
                  >
                    <RotateCcw size={14} />
                    撤回流程
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default TaskList;
