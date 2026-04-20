import React, { useMemo, useState } from 'react';
import { Clock, GripVertical, KanbanSquare, MoveRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { UnifiedTask, WorkTaskStatus } from '../types';

interface TaskBoardProps {
  tasks: UnifiedTask[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: UnifiedTask) => void;
}

const columns = [
  {
    id: WorkTaskStatus.TODO,
    title: '待处理',
    hint: '尚未开始的流程审批与协作待办',
    headerClassName:
      'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200',
  },
  {
    id: WorkTaskStatus.DOING,
    title: '进行中',
    hint: '正在处理的协作任务',
    headerClassName:
      'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  },
  {
    id: WorkTaskStatus.DONE,
    title: '已完成',
    hint: '已完成或已结束的任务',
    headerClassName:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
];

const TaskBoardChip = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
      className,
    )}
  >
    {children}
  </span>
);

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
            'flex min-h-[420px] flex-col overflow-hidden rounded-[24px] border bg-white shadow-sm dark:bg-slate-950/88',
            hoverColumn === column.id
              ? 'border-cyan-300 ring-2 ring-cyan-100 dark:border-cyan-800 dark:ring-cyan-950/40'
              : 'border-slate-200 dark:border-slate-800',
          )}
        >
          <div
            className={cn(
              'border-b px-5 py-4',
              column.headerClassName,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">{column.title}</div>
                <div className="mt-1 text-xs opacity-80">{column.hint}</div>
              </div>
              <TaskBoardChip className="border border-white/60 bg-white/80 text-current dark:border-white/10 dark:bg-slate-950/50">
                {column.tasks.length} 条
              </TaskBoardChip>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {column.tasks.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-900/60">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
                  <KanbanSquare size={20} />
                </div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">暂无任务</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  协作任务可拖拽到此列，流程审批保持只读。
                </div>
              </div>
            ) : (
              column.tasks.map((task) => {
                const isProcessTask = task.type === 'PROCESS';
                const isOverdue = Boolean(
                  task.dueDate && task.status !== WorkTaskStatus.DONE && new Date(task.dueDate) < new Date(),
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
                      'cursor-pointer rounded-[20px] border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-950',
                      isProcessTask
                        ? 'border-slate-200 dark:border-slate-800'
                        : 'border-cyan-100 hover:border-cyan-200 dark:border-cyan-900/40 dark:hover:border-cyan-800',
                      isOverdue && 'border-rose-200 dark:border-rose-900/40',
                      draggedTaskId === task.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                          {task.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {isProcessTask ? '流程审批 · 点击打开详情' : '协作待办 · 可拖拽切换状态'}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <TaskBoardChip
                          className={
                            isProcessTask
                              ? 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                              : task.status === WorkTaskStatus.DONE
                                ? 'border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                                : task.status === WorkTaskStatus.DOING
                                  ? 'border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
                                  : 'border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                          }
                        >
                          {isProcessTask ? '审批' : task.statusLabel}
                        </TaskBoardChip>

                        {!isProcessTask ? (
                          <TaskBoardChip className="border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                            <GripVertical size={12} />
                            拖拽
                          </TaskBoardChip>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          负责人
                        </div>
                        <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {task.assigneeName || '待认领'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          优先级
                        </div>
                        <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {task.priority === 2 ? '高' : task.priority === 1 ? '中' : '低'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <TaskBoardChip className="border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        创建于{' '}
                        {task.createdTime ? new Date(task.createdTime).toLocaleDateString('zh-CN') : '暂无'}
                      </TaskBoardChip>

                      {task.dueDate ? (
                        <TaskBoardChip
                          className={cn(
                            'border',
                            isOverdue
                              ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
                              : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
                          )}
                        >
                          <Clock size={12} />
                          截止 {new Date(task.dueDate).toLocaleDateString('zh-CN')}
                        </TaskBoardChip>
                      ) : (
                        <TaskBoardChip className="border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                          <MoveRight size={12} />
                          无截止时间
                        </TaskBoardChip>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskBoard;
