import React, { useState } from 'react';
import { Task, TaskStatus } from '../../types';
import { completeTask } from '../../services/api/workflow';
import { Check, X, ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';

interface MobileTaskHandlerProps {
  task: Task;
  onComplete: (task: Task) => void;
  onBack: () => void;
}

/**
 * 移动端任务处理组件
 * 适配移动端屏幕，提供简洁的审批操作界面
 */
export const MobileTaskHandler: React.FC<MobileTaskHandlerProps> = ({
  task,
  onComplete,
  onBack,
}) => {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);

  const handleAction = async (action: 'APPROVE' | 'REJECT') => {
    if (submitting) return;

    try {
      setSubmitting(true);
      await completeTask({
        taskId: task.id,
        action,
        comment: comment || undefined,
      });

      const statusMap = { APPROVE: TaskStatus.APPROVED, REJECT: TaskStatus.REJECTED };
      const updatedTask = { ...task, status: statusMap[action] };
      toast.success(action === 'APPROVE' ? '已同意' : '已拒绝');
      onComplete(updatedTask);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--cf-bg)] text-[var(--cf-text)]">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <h2 className="flex-1 truncate text-base font-semibold text-slate-800 dark:text-slate-100">
          {task.workflowName || task.nodeName || '任务详情'}
        </h2>
        <span className={`px-2 py-0.5 text-xs rounded-md ${
          task.status === TaskStatus.PENDING
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
            : task.status === TaskStatus.APPROVED
            ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200'
            : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200'
        }`}>
          {task.status === TaskStatus.PENDING ? '待处理' : task.status === TaskStatus.APPROVED ? '已通过' : '已拒绝'}
        </span>
      </div>

      {/* 任务信息 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 基本信息 */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400">申请人</span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{task.applicantName || '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400">创建时间</span>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {task.createdTime ? new Date(task.createdTime).toLocaleString('zh-CN') : '-'}
            </span>
          </div>
          {task.dueDate && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 dark:text-slate-400">截止时间</span>
              <span className="text-sm text-red-600 dark:text-red-300">
                {new Date(task.dueDate).toLocaleString('zh-CN')}
              </span>
            </div>
          )}
        </div>

        {/* 表单数据 */}
        {task.formData && Object.keys(task.formData).length > 0 && (
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">表单信息</h3>
            <div className="space-y-2">
              {Object.entries(task.formData).map(([key, value]) => (
                <div key={key} className="flex justify-between items-start">
                  <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{key}</span>
                  <span className="ml-4 text-right text-sm text-slate-800 dark:text-slate-100">
                    {String(value || '-')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 审批意见 */}
        {showCommentBox && (
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">审批意见</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="请输入审批意见（可选）"
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-300 bg-[var(--cf-surface-strong)] px-3 py-2 text-sm text-[var(--cf-text)] focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700"
            />
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {task.status === TaskStatus.PENDING && (
        <div className="safe-area-bottom sticky bottom-0 border-t border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800">
          {!showCommentBox && (
            <button
              onClick={() => setShowCommentBox(true)}
              className="mb-3 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              <MessageSquare size={14} />
              添加审批意见
            </button>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => handleAction('REJECT')}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              <X size={16} />
              拒绝
            </button>
            <button
              onClick={() => handleAction('APPROVE')}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              <Check size={16} />
              同意
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
