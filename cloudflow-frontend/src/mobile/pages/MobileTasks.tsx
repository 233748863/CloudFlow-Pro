import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Clock, AlertCircle, Loader2, RefreshCw, Filter } from 'lucide-react';
import { getTodoTasks, getTasksCount } from '@/services/api/workflow';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';

type TabType = 'all' | 'pending' | 'urgent';
type PriorityType = 'high' | 'medium' | 'low';

interface Task {
  id: string;
  taskName: string;
  processName: string;
  applicantName: string;
  createTime: string;
  dueDate?: string;
  priority?: PriorityType;
  status: string;
}

export const MobileTasks: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [taskCounts, setTaskCounts] = useState({ pending: 0, completed: 0, myApplications: 0 });

  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    try {
      const [tasksRes, countsRes] = await Promise.allSettled([
        getTodoTasks(),
        getTasksCount(),
      ]);

      if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) {
        setTasks(tasksRes.value as Task[]);
      }

      if (countsRes.status === 'fulfilled' && countsRes.value) {
        setTaskCounts(countsRes.value);
      }
    } catch (err: any) {
      toast.error(err.message || '加载任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchTasks();
    toast.success('刷新成功');
  };

  const { isRefreshing, pullDistance, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 过滤任务
  const filteredTasks = tasks.filter(task => {
    if (activeTab === 'pending') return task.status === 'pending';
    if (activeTab === 'urgent') {
      // 紧急任务：高优先级或即将到期
      const isHighPriority = task.priority === 'high';
      const isDueSoon = task.dueDate && new Date(task.dueDate).getTime() - Date.now() < 24 * 60 * 60 * 1000;
      return isHighPriority || isDueSoon;
    }
    return true;
  });

  // 获取优先级样式
  const getPriorityStyle = (priority?: PriorityType) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-600 border-red-200';
      case 'medium':
        return 'bg-orange-100 text-orange-600 border-orange-200';
      case 'low':
        return 'bg-green-100 text-green-600 border-green-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // 获取优先级标签
  const getPriorityLabel = (priority?: PriorityType) => {
    switch (priority) {
      case 'high':
        return '高';
      case 'medium':
        return '中';
      case 'low':
        return '低';
      default:
        return '普通';
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (hours < 1) return '刚刚';
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return timeStr;
    }
  };

  // 检查是否即将到期
  const isDueSoon = (dueDate?: string) => {
    if (!dueDate) return false;
    const diff = new Date(dueDate).getTime() - Date.now();
    return diff > 0 && diff < 24 * 60 * 60 * 1000;
  };

  // 检查是否已过期
  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate).getTime() < Date.now();
  };

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-3" size={32} />
          <p className="text-sm text-slate-500">加载任务...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* Pull to Refresh */}
      {isPulling && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-20"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="bg-white rounded-full p-2 shadow-lg">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-indigo-600" size={24} />
            ) : (
              <RefreshCw
                className="text-indigo-600 transition-transform"
                size={24}
                style={{ transform: `rotate(${Math.min((pullDistance / 80) * 360, 360)}deg)` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900 flex-1">我的任务</h1>
        <button className="p-2" aria-label="筛选">
          <Filter size={20} className="text-slate-600" />
        </button>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-indigo-600">{taskCounts.pending}</div>
          <div className="text-xs text-slate-500 mt-1">待办</div>
        </div>
        <div className="text-center border-l border-r border-slate-200">
          <div className="text-2xl font-bold text-green-600">{taskCounts.completed}</div>
          <div className="text-xs text-slate-500 mt-1">已完成</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-600">{taskCounts.myApplications}</div>
          <div className="text-xs text-slate-500 mt-1">我的申请</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-6">
        {(['all', 'pending', 'urgent'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500'
            }`}
          >
            {tab === 'all' ? '全部' : tab === 'pending' ? '待办' : '紧急'}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="p-4 space-y-3">
        {filteredTasks.length > 0 ? (
          filteredTasks.map(task => (
            <div
              key={task.id}
              onClick={() => navigate(`/tasks/${task.id}`)}
              className="bg-white rounded-lg p-4 shadow-sm border border-slate-100 active:bg-slate-50 transition-colors"
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  size={20}
                  className={`mt-0.5 flex-shrink-0 ${
                    task.priority === 'high' ? 'text-red-500' : 'text-slate-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-medium text-slate-900 line-clamp-2">
                      {task.taskName}
                    </h3>
                    <span
                      className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${getPriorityStyle(
                        task.priority
                      )}`}
                    >
                      {getPriorityLabel(task.priority)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                      {task.processName}
                    </span>
                    <span className="text-xs text-slate-500">申请人：{task.applicantName}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{formatTime(task.createTime)}</span>
                    </div>
                    {task.dueDate && (
                      <div
                        className={`flex items-center gap-1 ${
                          isOverdue(task.dueDate)
                            ? 'text-red-500'
                            : isDueSoon(task.dueDate)
                            ? 'text-orange-500'
                            : ''
                        }`}
                      >
                        <AlertCircle size={12} />
                        <span>
                          {isOverdue(task.dueDate)
                            ? '已逾期'
                            : isDueSoon(task.dueDate)
                            ? '即将到期'
                            : '截止：' + new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg p-12 text-center">
            <CheckCircle2 size={48} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {activeTab === 'pending'
                ? '暂无待办任务'
                : activeTab === 'urgent'
                ? '暂无紧急任务'
                : '暂无任务'}
            </p>
            <p className="text-xs text-slate-400 mt-1">所有任务已处理完毕</p>
          </div>
        )}
      </div>
    </div>
  );
};
