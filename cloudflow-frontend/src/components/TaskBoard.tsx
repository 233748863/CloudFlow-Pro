import React, { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { UnifiedTask, WorkTaskStatus } from '../types';

interface TaskBoardProps {
  tasks: UnifiedTask[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: UnifiedTask) => void;
}

const columns = [
  { id: WorkTaskStatus.TODO, title: '待处理' },
  { id: WorkTaskStatus.DOING, title: '进行中' },
  { id: WorkTaskStatus.DONE, title: '已完成' },
];

const InlineBadge = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium',
      className,
    )}
  >
    {children}
  </span>
);

const formatDate = (value?: string) => {
  if (!value) return '无截止时间';
  try {
    return new Date(value).toLocaleDateString('zh-CN');
  } catch {
    return value;
  }
};

export const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskMove, onTaskClick }) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);

  const tasksByColumn = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        tasks: tasks.filter((task) => task.status === column.id),
      })),
    [tasks],
  );

  const handleDragStart = (event: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: React.DragEvent, status: string) => {
    event.preventDefault();
    setHoverColumn(status);
  };

  const handleDrop = (event: React.DragEvent, status: string) => {
    event.preventDefault();
    if (draggedTaskId) {
      onTaskMove(draggedTaskId, status);
    }
    setDraggedTaskId(null);
    setHoverColumn(null);
  };

  const clearDragState = () => {
    setDraggedTaskId(null);
    setHoverColumn(null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {tasksByColumn.map((column) => (
        <div
          key={column.id}
          onDragOver={(event) => handleDragOver(event, column.id)}
          onDragLeave={() => setHoverColumn((current) => (current === column.id ? null : current))}
          onDrop={(event) => handleDrop(event, column.id)}
          className={cn(
            'flex min-h-[24rem] flex-col overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950',
            hoverColumn === column.id && 'border-cyan-300 dark:border-cyan-700',
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-sm font-medium text-cf-title">{column.title}</div>
            <div className="text-xs text-cf-subtle">{column.tasks.length} 条</div>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto">
            {column.tasks.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-xs text-cf-subtle">
                当前列暂无内容
              </div>
            ) : (
              <div className="grid gap-3 p-3">
                {column.tasks.map((task) => {
                  const isProcessTask = task.type === 'PROCESS';
                  const isOverdue = Boolean(
                    task.dueDate &&
                      task.status !== WorkTaskStatus.DONE &&
                      new Date(task.dueDate) < new Date(),
                  );

                  return (
                    <div
                      key={task.id}
                      draggable={!isProcessTask}
                      onDragStart={(event) => {
                        if (isProcessTask) {
                          event.preventDefault();
                          return;
                        }
                        handleDragStart(event, task.id);
                      }}
                      onDragEnd={clearDragState}
                    onClick={() => onTaskClick(task)}
                    className={cn(
                        'rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 transition-colors hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/70',
                        draggedTaskId === task.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-cf-title">
                            {task.title}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cf-subtle">
                            <span>{isProcessTask ? '流程审批' : '协作待办'}</span>
                            <span>负责人 {task.assigneeName || '待认领'}</span>
                            <span className={cn(isOverdue && 'text-rose-600 dark:text-rose-300')}>
                              截止 {formatDate(task.dueDate)}
                            </span>
                          </div>
                        </div>

                        <InlineBadge
                          className={
                            isProcessTask
                              ? 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted dark:border-slate-800 dark:bg-slate-950'
                              : task.status === WorkTaskStatus.DONE
                                ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                                : task.status === WorkTaskStatus.DOING
                                  ? 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200'
                                  : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                          }
                        >
                          {isProcessTask ? '审批' : task.statusLabel}
                        </InlineBadge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-cf-subtle">
                        <InlineBadge className="border-slate-200 bg-[var(--cf-surface-strong)] text-cf-subtle dark:border-slate-800 dark:bg-slate-950">
                          创建 {formatDate(task.createdTime)}
                        </InlineBadge>
                        <InlineBadge
                          className={cn(
                            isOverdue
                              ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
                              : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-subtle dark:border-slate-800 dark:bg-slate-950',
                          )}
                        >
                          <Clock size={12} />
                          {formatDate(task.dueDate)}
                        </InlineBadge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskBoard;
