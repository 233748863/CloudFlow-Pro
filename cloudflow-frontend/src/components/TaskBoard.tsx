import React, { useState } from 'react';
import { UnifiedTask, WorkTaskStatus } from '../types';
import { Clock, MoreHorizontal } from 'lucide-react';

interface TaskBoardProps {
  tasks: UnifiedTask[];
  onTaskMove: (taskId: string, newStatus: string) => void;
  onTaskClick: (task: UnifiedTask) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({ tasks, onTaskMove, onTaskClick }) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const columns = [
    { id: WorkTaskStatus.TODO, title: '待处理', color: 'bg-slate-100', borderColor: 'border-slate-200' },
    { id: WorkTaskStatus.DOING, title: '进行中', color: 'bg-pink-50', borderColor: 'border-pink-100' },
    { id: WorkTaskStatus.DONE, title: '已完成', color: 'bg-emerald-50', borderColor: 'border-emerald-200' }
  ];

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (draggedTaskId) {
      onTaskMove(draggedTaskId, status);
      setDraggedTaskId(null);
    }
  };

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-4">
      {columns.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id);
        return (
          <div 
            key={col.id}
            className={`flex-1 min-w-[300px] rounded-xl border ${col.borderColor} bg-white flex flex-col h-full max-h-[calc(100vh-200px)]`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            {/* 标题栏 */}
            <div className={`p-4 border-b ${col.borderColor} ${col.color} rounded-t-xl flex justify-between items-center sticky top-0 z-30`}>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700">{col.title}</h3>
                <span className="bg-white/50 px-2 py-0.5 rounded text-xs font-bold text-slate-500">
                  {colTasks.length}
                </span>
              </div>
              <MoreHorizontal size={16} className="text-slate-400 cursor-pointer hover:text-slate-600" />
            </div>

            {/* Task List */}
            <div className="p-3 space-y-3 overflow-y-auto flex-1">
              {colTasks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p>暂无任务</p>
                  <p className="text-xs mt-1">拖拽任务到此处</p>
                </div>
              ) : (
                colTasks.map(task => (
                <div
                  key={task.id}
                  draggable={task.type !== 'PROCESS'}
                  onDragStart={(e) => {
                    if (task.type === 'PROCESS') {
                      e.preventDefault();
                      return;
                    }
                    handleDragStart(e, task.id);
                  }}
                  onClick={() => onTaskClick(task)}
                  className={`bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all
                    ${task.type === 'PROCESS' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
                    ${draggedTaskId === task.id ? 'opacity-50' : 'opacity-100'}
                  `}
                >
                  {/* 优先级标签 */}
                  <div className="flex justify-between items-start mb-2">
                     <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
                        ${task.priority === 2 ? 'bg-red-50 text-red-600' : 
                          task.priority === 1 ? 'bg-yellow-50 text-yellow-600' : 
                          'bg-slate-100 text-slate-500'}
                     `}>
                        {task.priority === 2 ? '高优先级' : task.priority === 1 ? '中优先级' : '低优先级'}
                     </span>
                     {task.type === 'PROCESS' && (
                         <span className="text-[10px] bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded">审批</span>
                     )}
                  </div>

                  <h4 className="text-sm font-bold text-slate-800 mb-1 line-clamp-2">{task.title}</h4>
                  
                  <div className="flex items-center justify-between text-xs text-slate-400 mt-3">
                    <div className="flex items-center gap-1">
                       <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                          {(task.assigneeName || 'U')[0]}
                       </div>
                       <span>{task.assigneeName || '待认领'}</span>
                    </div>
                    {task.dueDate && (
                        <div className={`flex items-center gap-1 ${new Date(task.dueDate) < new Date() ? 'text-red-500' : ''}`}>
                            <Clock size={12} />
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                        </div>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
