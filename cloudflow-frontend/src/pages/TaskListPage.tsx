import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, FormDefinition, UnifiedTask, WorkTaskStatus } from '../types';
import { TaskList } from '../components/TaskList';
import { TaskHandleModal } from '../components/TaskHandleModal';
import { TaskBoard } from '../components/TaskBoard';
import { getTodoTasks, getMyInstances, getFormDefinitions } from '../services/api/workflow';
import { getWorkTasks, updateWorkTaskStatus } from '../services/api/workTask';
import { useAuth } from '../context/AuthContext';
import { mapBackendTaskToFrontend, mapBackendInstanceToTask, mapTaskToUnified, mapWorkTaskToUnified } from '../utils/mappers';
import { LayoutList, Kanban, Plus, RefreshCw } from 'lucide-react';
import { SkeletonCard } from '../components/ui/Skeleton';
import { EmptyTasks, EmptyError } from '../components/ui/EmptyState';
import { toast } from 'sonner';
import { usePolling } from '../hooks/usePolling';
import { logTask } from '../lib/logger';

export const TaskListPage = ({ type }: { type: 'pending' | 'applications' }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [rawTasks, setRawTasks] = useState<Task[]>([]); // Keep raw process tasks for List view compatibility
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [filterType, setFilterType] = useState<'all' | 'process' | 'work'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = async (showLoading = true) => {
    if (!user) return;
    try {
        if (showLoading) setLoading(true);
        setError(null);
        
        const promises: Promise<any>[] = [
            getTodoTasks(),
            getMyInstances()
        ];
        
        // Only fetch work tasks if looking at pending (todo) list
        if (type === 'pending') {
            promises.push(getWorkTasks());
        } else {
            promises.push(Promise.resolve([]));
        }

        const [todoRes, myInstRes, workTaskRes] = await Promise.all(promises);

        let processTasks: Task[] = [];
        if (Array.isArray(todoRes)) {
            processTasks = [...processTasks, ...todoRes.map(mapBackendTaskToFrontend)];
        }
        if (Array.isArray(myInstRes)) {
            processTasks = [...processTasks, ...myInstRes.map(mapBackendInstanceToTask)];
        }
        
        // Filter process tasks based on 'type' prop (pending vs applications)
        const filteredProcessTasks = processTasks.filter(t => {
            if (type === 'pending') {
                return t.status === TaskStatus.PENDING && (
                    t.assigneeId === user.id ||
                    (t.assigneeRole === user.role && !t.assigneeId) ||
                    user.role === 'ADMIN'
                );
            } else {
                return t.applicantId === user.id;
            }
        });
        
        setRawTasks(filteredProcessTasks);

        let unified: UnifiedTask[] = filteredProcessTasks.map(mapTaskToUnified);
        
        if (workTaskRes && Array.isArray(workTaskRes)) {
             const workTasks = workTaskRes.map(mapWorkTaskToUnified);
             unified = [...unified, ...workTasks];
        }

        setTasks(unified);
    } catch (e) {
        logTask.error("Fetch tasks failed", e);
        const errMsg = e instanceof Error ? e.message : '加载任务失败';
        setError(errMsg);
        toast.error(errMsg);
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  };

  // 定时刷新任务列表（30秒间隔）
  const { refresh: pollingRefresh } = usePolling(
    () => fetchTasks(false),
    {
      interval: 30000,
      immediate: false,
      enabled: !!user && !loading,
      onError: (err) => logTask.error('任务列表定时刷新失败:', err),
    }
  );

  useEffect(() => {
    fetchTasks();
    getFormDefinitions().then(res => {
        if(Array.isArray(res)) {
            const mapped = res.map((f: any) => {
                let fields = [];
                try {
                    if (typeof f.fieldsJson === 'string') {
                        // 尝试清理可能存在的转义问题
                        let cleanedJson = f.fieldsJson;
                        
                        // 修复常见的转义问题
                        // 1. 替换错误的反斜杠转义
                        cleanedJson = cleanedJson.replace(/\\/g, '\\\\');
                        
                        // 2. 如果上面的修复导致双重转义，尝试原始字符串
                        try {
                            fields = JSON.parse(cleanedJson);
                        } catch {
                            // 如果清理后的版本失败，尝试原始版本
                            fields = JSON.parse(f.fieldsJson);
                        }
                    } else {
                        fields = f.fieldsJson || [];
                    }
                } catch (e) {
                    console.warn(`无法解析表单 "${f.formName}" 的 fieldsJson，使用空数组`, e);
                    fields = [];
                }
                return {
                    id: f.formId,
                    name: f.formName,
                    fields
                };
            });
            setSavedForms(mapped);
        }
    }).catch(err => {
        console.error('Failed to fetch form definitions:', err);
    });
  }, [user, type]);

  const handleTaskUpdate = () => {
      fetchTasks();
      setIsModalOpen(false);
  };

  const handleRefresh = () => {
      setRefreshing(true);
      fetchTasks(false);
  };

  const handleTaskMove = async (taskId: string, newStatus: string) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (task.type === 'WORK') {
          try {
              await updateWorkTaskStatus(taskId, newStatus);
              toast.success('任务状态已更新');
              fetchTasks(false);
          } catch (e) {
              toast.error('更新任务状态失败');
          }
      } else {
          toast.info('流程任务请点击进入详情进行处理');
      }
  };

  const filteredUnifiedTasks = tasks.filter(t => {
      if (filterType === 'process') return t.type === 'PROCESS';
      if (filterType === 'work') return t.type === 'WORK';
      return true;
  });

  if (!user) return null;

  // Loading 状态
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">{type === 'pending' ? '任务中心' : '我的申请'}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error 状态
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">{type === 'pending' ? '任务中心' : '我的申请'}</h2>
        </div>
        <EmptyError onRetry={() => fetchTasks()} />
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
        <div className="flex justify-between items-center shrink-0">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-4">
                {type === 'pending' ? '任务中心' : '我的申请'}
                
                {type === 'pending' && (
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutList size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('board')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'board' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Kanban size={18} />
                        </button>
                    </div>
                )}
            </h2>

            {type === 'pending' && (
                <div className="flex gap-2">
                     <select 
                        className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                     >
                        <option value="all">全部任务</option>
                        <option value="process">流程审批</option>
                        <option value="work">协作待办</option>
                     </select>
                     
                     <button 
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1"
                     >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        刷新
                     </button>
                </div>
            )}
        </div>
        
        <div className="flex-1 overflow-hidden min-h-[400px]">
            {viewMode === 'list' ? (
                 rawTasks.length === 0 && filteredUnifiedTasks.filter(t=>t.type==='WORK').length === 0 ? (
                    <EmptyTasks />
                ) : (
                    <div className="space-y-8">
                         {/* Process Tasks */}
                         {(filterType === 'all' || filterType === 'process') && rawTasks.length > 0 && (
                             <div>
                                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">流程审批 ({rawTasks.length})</h3>
                                 <TaskList 
                                    tasks={rawTasks} 
                                    onTaskClick={(task) => { setSelectedTask(task); setIsModalOpen(true); }}
                                    showRecallButton={type === 'applications'}
                                    onRecallSuccess={() => fetchTasks(false)}
                                />
                             </div>
                         )}

                         {/* Work Tasks (Simple List View - to be implemented inside TaskList or separate) */}
                         {(filterType === 'all' || filterType === 'work') && filteredUnifiedTasks.filter(t=>t.type==='WORK').length > 0 && (
                             <div>
                                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 mt-6">协作待办 ({filteredUnifiedTasks.filter(t=>t.type==='WORK').length})</h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                     {filteredUnifiedTasks.filter(t=>t.type==='WORK').map(t => (
                                         <div key={t.id} className="bg-white border border-slate-200 p-5 rounded-xl hover:shadow-lg transition-all">
                                             <div className="flex justify-between items-start mb-2">
                                                 <h4 className="font-bold text-slate-800">{t.title}</h4>
                                                 <span className={`text-xs px-2 py-1 rounded font-medium 
                                                     ${t.status === 'DONE' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                     {t.statusLabel}
                                                 </span>
                                             </div>
                                             <p className="text-xs text-slate-500 mt-2">创建于: {t.createdTime ? new Date(t.createdTime).toLocaleDateString() : '-'}</p>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                    </div>
                )
            ) : (
                <TaskBoard 
                    tasks={filteredUnifiedTasks}
                    onTaskMove={handleTaskMove}
                    onTaskClick={(task) => {
                        if (task.type === 'PROCESS') {
                            setSelectedTask(task.sourceData as Task);
                            setIsModalOpen(true);
                        } else {
                            logTask.debug("Edit work task", task);
                        }
                    }}
                />
            )}
        </div>

        <TaskHandleModal 
            isOpen={isModalOpen} 
            task={selectedTask} 
            availableForms={savedForms}
            currentUser={user}
            onClose={() => setIsModalOpen(false)}
            onComplete={handleTaskUpdate}
        />
    </div>
  );
};
