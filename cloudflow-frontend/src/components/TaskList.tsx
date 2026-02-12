import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, XCircle, ArrowLeftCircle, Edit3, UserPlus, RotateCcw } from 'lucide-react';
import { Task, TaskStatus } from '../types';
import { recallProcess } from '../services/api/workflow';
import { toast } from 'sonner';

interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  showRecallButton?: boolean; // 是否显示撤回按钮（仅在"我的申请"页面显示）
  onRecallSuccess?: () => void; // 撤回成功后的回调
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskClick, showRecallButton = false, onRecallSuccess }) => {
  const [recalling, setRecalling] = useState<string | null>(null);
  const [confirmRecall, setConfirmRecall] = useState<string | null>(null);

  const handleRecall = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation(); // 阻止触发任务点击事件
    
    if (!task.processInstanceId) {
      toast.error('无法获取流程实例ID');
      return;
    }

    setRecalling(task.id);
    try {
      await recallProcess(task.processInstanceId);
      toast.success('流程已撤回');
      setConfirmRecall(null);
      onRecallSuccess?.();
    } catch (err) {
      console.error('撤回失败:', err);
      toast.error(err instanceof Error ? err.message : '撤回失败，请重试');
    } finally {
      setRecalling(null);
    }
  };
  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PENDING:
        return (
          <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-indigo-600/20">
            <Clock size={12} />
            待处理
          </span>
        );
      case TaskStatus.APPROVED:
        return (
          <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 size={12} />
            已通过
          </span>
        );
      case TaskStatus.REJECTED:
        return (
          <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-red-600/20">
            <XCircle size={12} />
            已拒绝
          </span>
        );
      case TaskStatus.TIMED_OUT:
        return (
          <span className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-orange-600/20">
            <AlertTriangle size={12} />
            已超时
          </span>
        );
      case TaskStatus.RETURNED:
        return (
          <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-yellow-600/20">
            <ArrowLeftCircle size={12} />
            已退回
          </span>
        );
       case TaskStatus.MODIFIED:
        return (
          <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-blue-600/20">
            <Edit3 size={12} />
            已修改
          </span>
        );
       case TaskStatus.DELEGATED:
        return (
          <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-purple-600/20">
            <UserPlus size={12} />
            已转办
          </span>
        );
      default:
        return null;
    }
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-slate-400 text-sm">暂无任务</p>
      </div>
    );
  }

  // 检查任务是否超时
  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    return new Date(task.dueDate) < new Date() && task.status === TaskStatus.PENDING;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tasks.map((task) => {
        const canRecall = showRecallButton && task.status === TaskStatus.PENDING;
        
        return (
        <div 
          key={task.id}
          onClick={() => onTaskClick?.(task)}
          className={`bg-white border rounded-xl p-5 hover:shadow-lg transition-all duration-300 cursor-pointer group relative overflow-hidden ${
            isOverdue(task) 
              ? 'border-red-300 hover:border-red-400 ring-1 ring-red-100' 
              : 'border-slate-200 hover:border-indigo-500/30'
          }`}
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          
          <div className="flex justify-between items-start mb-3 relative z-10">
            <div>
                <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1" title={task.workflowName}>
                    {task.workflowName}
                </h3>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                    {task.nodeName}
                </p>
            </div>
            {getStatusBadge(task.status)}
          </div>
          
          <div className="space-y-2 mb-4 relative z-10 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">当前处理:</span>
                <span className="text-slate-700 font-bold">{task.assigneeName || task.assigneeId || '待认领'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">申请人:</span>
                <span className="text-slate-700">{task.applicantName}</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium">
            <span>创建: {new Date(task.createdTime).toLocaleDateString()}</span>
            {task.dueDate && (
                 <span className="text-orange-500 flex items-center gap-1 bg-orange-50 px-1.5 py-0.5 rounded">
                    <Clock size={10} />
                    截止: {new Date(task.dueDate).toLocaleDateString()}
                 </span>
            )}
          </div>

          {/* 撤回按钮 - 仅在"我的申请"页面且流程运行中时显示 */}
          {canRecall && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              {confirmRecall === task.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-600 flex-1">确认撤回此流程？</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmRecall(null);
                    }}
                    className="px-2 py-1 text-xs text-slate-500 border border-slate-200 rounded hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={(e) => handleRecall(e, task)}
                    disabled={recalling === task.id}
                    className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {recalling === task.id ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        撤回中...
                      </>
                    ) : (
                      <>
                        <RotateCcw size={12} />
                        确认
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRecall(task.id);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center gap-1"
                >
                  <RotateCcw size={12} />
                  撤回流程
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};
