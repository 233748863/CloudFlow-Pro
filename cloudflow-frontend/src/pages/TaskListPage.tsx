import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, FormDefinition, UnifiedTask, WorkTaskStatus } from '../types';
import { TaskList } from '../components/TaskList';
import { TaskHandleModal } from '../components/TaskHandleModal';
import { TaskBoard } from '../components/TaskBoard';
import { getTodoTasks, getMyInstances, getFormDefinitions } from '../services/api/workflow';
import { getWorkTasks, updateWorkTaskStatus } from '../services/api/workTask';
import { useAuth } from '../context/AuthContext';
import { mapBackendTaskToFrontend, mapBackendInstanceToTask, mapTaskToUnified, mapWorkTaskToUnified } from '../utils/mappers';
import { LayoutList, Kanban, Plus } from 'lucide-react';

export const TaskListPage = ({ type }: { type: 'pending' | 'applications' }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [rawTasks, setRawTasks] = useState<Task[]>([]); // Keep raw process tasks for List view compatibility
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [filterType, setFilterType] = useState<'all' | 'process' | 'work'>('all');

  const fetchTasks = async () => {
    if (!user) return;
    try {
        const promises: Promise<any>[] = [
            getTodoTasks(user.id),
            getMyInstances(user.id)
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
        console.error("Fetch tasks failed", e);
    }
  };

  useEffect(() => {
    fetchTasks();
    getFormDefinitions().then(res => {
        if(Array.isArray(res)) {
            const mapped = res.map((f: any) => ({
                id: f.formId,
                name: f.formName,
                fields: typeof f.fieldsJson === 'string' ? JSON.parse(f.fieldsJson) : (f.fieldsJson || [])
            }));
            setSavedForms(mapped);
        }
    });
  }, [user, type]);

  const handleTaskUpdate = () => {
      fetchTasks();
      setIsModalOpen(false);
  };

  const handleTaskMove = async (taskId: string, newStatus: string) => {
      // Find task type
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (task.type === 'WORK') {
          await updateWorkTaskStatus(taskId, newStatus);
          fetchTasks(); // Refresh
      } else {
          // Process tasks cannot be moved via drag and drop easily (need form submission)
          alert("流程任务请点击进入详情进行处理");
      }
  };

  const filteredUnifiedTasks = tasks.filter(t => {
      if (filterType === 'process') return t.type === 'PROCESS';
      if (filterType === 'work') return t.type === 'WORK';
      return true;
  });

  if (!user) return null;

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
                     
                     <button className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1">
                        <Plus size={16} />
                        新建任务
                     </button>
                </div>
            )}
        </div>
        
        <div className="flex-1 overflow-hidden min-h-[400px]">
            {viewMode === 'list' ? (
                 rawTasks.length === 0 && filteredUnifiedTasks.filter(t=>t.type==='WORK').length === 0 ? (
                    <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <p className="text-slate-400">暂无相关数据</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                         {/* Process Tasks */}
                         {(filterType === 'all' || filterType === 'process') && rawTasks.length > 0 && (
                             <div>
                                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">流程审批 ({rawTasks.length})</h3>
                                 <TaskList 
                                    tasks={rawTasks} 
                                    onTaskClick={(task) => { setSelectedTask(task); setIsModalOpen(true); }}
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
                            // Open WorkTask edit modal (todo)
                            console.log("Edit work task", task);
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
