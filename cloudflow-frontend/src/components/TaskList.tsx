import React, { useState } from 'react';
import { Ban, Eye, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, TableRowActions } from '@/components/common';
import { cn } from '@/utils/cn';
import { recallProcess } from '../services/api/workflow';
import { Task, TaskStatus } from '../types';
import { getWorkflowSummaryParts } from '../utils/workflowFormDisplay';

interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  showRecallButton?: boolean;
  primaryActionLabel?: string;
  onRecallSuccess?: () => void;
}

const statusBadgeMap: Record<string, { label: string; className: string }> = {
  [TaskStatus.PENDING]: {
    label: '待处理',
    className:
      'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200',
  },
  [TaskStatus.APPROVED]: {
    label: '已通过',
    className:
      'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
  [TaskStatus.REJECTED]: {
    label: '已拒绝',
    className:
      'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
  },
  [TaskStatus.RETURNED]: {
    label: '已退回',
    className:
      'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  },
  [TaskStatus.MODIFIED]: {
    label: '已修改',
    className:
      'border-sky-100 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200',
  },
  [TaskStatus.DELEGATED]: {
    label: '已转办',
    className:
      'border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200',
  },
  [TaskStatus.TIMED_OUT]: {
    label: '已超时',
    className:
      'border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
  },
};

const InlineBadge = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
      className,
    )}
  >
    {children}
  </span>
);

const getStatusBadge = (task: Task) => {
  if (task.backendStatus === 'REVOKED') {
    return (
      <InlineBadge className="border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <Ban size={12} />
        已撤回
      </InlineBadge>
    );
  }

  const config = statusBadgeMap[task.status];
  if (!config) {
    return null;
  }

  return <InlineBadge className={config.className}>{config.label}</InlineBadge>;
};

const formatDate = (value?: string) => {
  if (!value) {
    return '-';
  }

  try {
    return new Date(value).toLocaleDateString('zh-CN');
  } catch {
    return value;
  }
};

const isOverdue = (task: Task) =>
  Boolean(task.dueDate && new Date(task.dueDate) < new Date() && task.status === TaskStatus.PENDING);

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onTaskClick,
  showRecallButton = false,
  primaryActionLabel,
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
    return null;
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {tasks.map((task) => {
        const canRecall = showRecallButton && task.status === TaskStatus.PENDING;
        const overdue = isOverdue(task);
        const actionLabel = primaryActionLabel || (showRecallButton ? '详情' : '处理');
        const summaryText =
          task.formData && Object.keys(task.formData).length > 0
            ? getWorkflowSummaryParts(task.formData as Record<string, any>, 3).join(' · ')
            : '';
        const progressText =
          task.totalSteps && task.totalSteps > 0
            ? `${task.currentStepIndex || 0}/${task.totalSteps}`
            : task.nodeName || task.currentNodeName || '-';

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
            className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40"
          >
            <div className="flex flex-col gap-3 px-4 py-4 lg:grid lg:grid-cols-[minmax(0,1.9fr)_200px_160px_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {task.workflowName}
                  </div>
                  {getStatusBadge(task)}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>节点 {task.nodeName || '-'}</span>
                  <span>申请人 {task.applicantName || '-'}</span>
                  <span>创建 {formatDate(task.createdTime)}</span>
                  {task.dueDate ? (
                    <span className={cn(overdue && 'text-rose-600 dark:text-rose-300')}>
                      截止 {formatDate(task.dueDate)}
                      {overdue ? ' · 已逾期' : ''}
                    </span>
                  ) : null}
                </div>

                {summaryText ? (
                  <div className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
                    {summaryText}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 lg:border-l lg:border-slate-100 lg:pl-6 dark:lg:border-slate-800">
                <div>当前处理人</div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {task.assigneeName || task.assigneeId || '待认领'}
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 lg:border-l lg:border-slate-100 lg:pl-6 dark:lg:border-slate-800">
                <div>流程进度</div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {progressText}
                </div>
              </div>

              <div
                className="flex flex-wrap items-center justify-end gap-2 lg:border-l lg:border-slate-100 lg:pl-6 dark:lg:border-slate-800"
                onClick={(event) => event.stopPropagation()}
              >
                {canRecall && confirmRecall === task.id ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setConfirmRecall(null)}>
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
                  </>
                ) : (
                  <TableRowActions
                    align="end"
                    className="gap-1"
                    actions={[
                      {
                        label: actionLabel,
                        icon: <Eye size={14} />,
                        onClick: (event) => {
                          event.stopPropagation();
                          onTaskClick?.(task);
                        },
                        tone: 'neutral',
                        className:
                          'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900',
                      },
                      {
                        label: '撤回',
                        icon: <RotateCcw size={14} />,
                        onClick: (event) => {
                          event.stopPropagation();
                          setConfirmRecall(task.id);
                        },
                        tone: 'warning',
                        hidden: !canRecall,
                        className: 'rounded-lg',
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaskList;
