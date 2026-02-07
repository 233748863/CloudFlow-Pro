import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, XCircle, ArrowLeftCircle, Edit3, UserPlus } from 'lucide-react';
import { Task, TaskStatus } from '../types';

interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskClick }) => {
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tasks.map((task) => (
        <div 
          key={task.id}
          onClick={() => onTaskClick?.(task)}
          className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-indigo-500/30 transition-all duration-300 cursor-pointer group relative overflow-hidden"
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
        </div>
      ))}
    </div>
  );
};
