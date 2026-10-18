import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Clock, AlertCircle, Loader2, RefreshCw, Filter } from 'lucide-react';
import { getTodoTasks, getDoneTasks, getTasksCount } from '@/services/api/workflow';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { TaskHandleModal } from '@/components/TaskHandleModal';
import { ApprovalWithdrawalButton } from '@/components/workflow/ApprovalWithdrawalButton';
import { PendingSignatureButton } from '@/components/workflow/PendingSignatureButton';
import { Button, Input } from '@/components/common';
import { mapBackendTaskToFrontend } from '@/utils/mappers';
import { isTaskInCurrentTodo } from '@/utils/workflowPermissions';
import { getErrorMessage } from '@/utils/errorMessage';
import { TaskStatus, type Task as WorkflowTask } from '@/types';
import { useNetworkStatus } from '@/hooks/useOffline';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { captureMobileScope, readMobileSnapshot, removeMobileSnapshot, saveMobileSnapshot } from '@/utils/mobileSnapshots';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';

type TabType = 'all' | 'pending' | 'urgent' | 'done';
type PriorityType = 'high' | 'medium' | 'low';
type TaskFilters = { keyword: string; startUserName: string; startTimeFrom: string; startTimeTo: string };
const EMPTY_FILTERS: TaskFilters = { keyword: '', startUserName: '', startTimeFrom: '', startTimeTo: '' };
const PAGE_SIZE = 20;

interface Task {
  id: string;
  taskName: string;
  processName: string;
  applicantName: string;
  createTime: string;
  dueDate?: string;
  priority?: PriorityType;
  status: string;
  workflowTask?: WorkflowTask;
}

export const MobileTasks: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const isOnline = useNetworkStatus();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<WorkflowTask | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [taskCounts, setTaskCounts] = useState({ pending: 0, completed: 0, myApplications: 0 });
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterError, setFilterError] = useState('');
  const [error, setError] = useState('');
  const doneMode = activeTab === 'done';
  const requestSequence = useRef(0);

  // 获取任务列表
  const fetchTasks = useCallback(async (showLoading = true) => {
    const sequence = ++requestSequence.current;
    const version = getAuthSessionVersion();
    const scope = captureMobileScope();
    const isCurrent = () => sequence === requestSequence.current && version === getAuthSessionVersion();
    if (showLoading) setLoading(true);
    setError('');
    if (!isOnline) {
      const saved = doneMode ? null : readMobileSnapshot(scope, 'todo');
      setSelectedTask(null);
      setTasks(saved?.data.tasks ?? []);
      setTaskCounts(saved?.data.counts ?? { pending: 0, completed: 0, myApplications: 0 });
      setTotal(saved?.data.total ?? 0);
      setSavedAt(saved?.savedAt ?? null);
      setError(saved ? '' : doneMode ? '已办记录需联网查看' : '当前离线，此账号尚无可用待办摘要');
      setLoading(false);
      return false;
    }
    setSavedAt(null);
    try {
      const [tasksRes, countsRes] = await Promise.allSettled([
        (doneMode ? getDoneTasks : getTodoTasks)({ pageNum, pageSize: PAGE_SIZE,
          keyword: filters.keyword || undefined, startUserName: filters.startUserName || undefined,
          startTimeFrom: filters.startTimeFrom || undefined, startTimeTo: filters.startTimeTo || undefined }),
        getTasksCount(),
      ]);
      if (!isCurrent()) return false;
      if (tasksRes.status === 'rejected') throw tasksRes.reason;

      if (tasksRes.status === 'fulfilled' && tasksRes.value) {
        const val = tasksRes.value;
        const list = Array.isArray(val) ? val : (val as { records?: unknown[]; rows?: unknown[] }).records || (val as { rows?: unknown[] }).rows || [];
        const resultTotal = Array.isArray(val) ? val.length : Number((val as { total?: number }).total || 0);
        setTotal(resultTotal);
        const lastPage = Math.max(1, Math.ceil(resultTotal / PAGE_SIZE));
        if (pageNum > lastPage) { setPageNum(lastPage); return false; }
        const mapped = list.map((record): Task => {
          const raw = record as Parameters<typeof mapBackendTaskToFrontend>[0] & { priority?: string };
          const workflowTask = mapBackendTaskToFrontend(raw);
          return { id: workflowTask.id, taskName: workflowTask.nodeName, processName: workflowTask.workflowName,
            applicantName: workflowTask.applicantName, createTime: workflowTask.createdTime, dueDate: workflowTask.dueDate,
            priority: ['HIGH', 'URGENT'].includes(raw.priority || '') ? 'high' : raw.priority === 'LOW' ? 'low' : 'medium',
            status: workflowTask.status === TaskStatus.PENDING ? 'pending' : workflowTask.status, workflowTask };
        });
        setTasks(mapped);
        if (!doneMode && pageNum === 1 && !Object.values(filters).some(Boolean)
          && countsRes.status === 'fulfilled' && countsRes.value) {
          saveMobileSnapshot(scope, 'todo', { tasks: mapped, counts: countsRes.value,
            total: resultTotal });
        }
      }

      if (countsRes.status === 'fulfilled' && countsRes.value) {
        setTaskCounts(countsRes.value);
      }
      return true;
    } catch (failure) {
      if (isCurrent()) {
        setTasks([]);
        setError(getErrorMessage(failure, '加载任务失败，请重试'));
      }
      return false;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [doneMode, pageNum, filters, isOnline, user?.id, user?.tenantId]);

  const applyFilters = () => {
    if (draftFilters.startTimeFrom && draftFilters.startTimeTo && draftFilters.startTimeFrom > draftFilters.startTimeTo) {
      setFilterError('开始日期不能晚于结束日期'); return;
    }
    setFilters({ ...draftFilters, keyword: draftFilters.keyword.trim(), startUserName: draftFilters.startUserName.trim() });
    setPageNum(1); setSelectedTask(null); setFilterError(''); setFilterOpen(false);
  };

  const handleTaskChanged = (updated: WorkflowTask) => {
    removeMobileSnapshot(captureMobileScope(), 'todo');
    removeMobileSnapshot(captureMobileScope(), 'dashboard');
    requestSequence.current++;
    setTasks(current => current.flatMap(task => task.id !== updated.id ? [task]
      : user && isTaskInCurrentTodo(updated, user) ? [{ ...task, workflowTask: updated }] : []));
    setSelectedTask(null);
    void fetchTasks();
  };

  useEffect(() => {
    fetchTasks();
    return () => { requestSequence.current++; };
  }, [fetchTasks]);

  // 下拉刷新
  const handleRefresh = async () => {
    if (await fetchTasks()) toast.success('刷新成功');
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
        return 'bg-cf-surface-3 text-cf-muted border-slate-200';
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
          <Loader2 className="animate-spin text-[#0d95b5] mx-auto mb-3" size={32} />
          <p className="text-sm text-cf-subtle">加载任务...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cf-bg)] relative">
      {/* Pull to Refresh */}
      {isPulling && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-20"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="bg-[var(--cf-surface-strong)] rounded-full p-2 shadow-none">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-[#0d95b5]" size={24} />
            ) : (
              <RefreshCw
                className="text-[#0d95b5] transition-transform"
                size={24}
                style={{ transform: `rotate(${Math.min((pullDistance / 80) * 360, 360)}deg)` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[var(--cf-surface-strong)] border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-cf-muted" />
        </button>
        <h1 className="text-lg font-semibold text-cf-title flex-1">我的任务</h1>
        {isOnline && <PendingSignatureButton onSuccess={() => void fetchTasks(false)} />}
        <button type="button" className="min-h-[44px] min-w-[44px] p-2 disabled:opacity-50" aria-label="筛选"
          aria-expanded={filterOpen} disabled={!isOnline} onClick={() => { setDraftFilters({ ...filters }); setFilterError(''); setFilterOpen(true); }}>
          <Filter size={20} className="text-cf-muted" />
        </button>
      </div>

      {/* Stats */}
      <div className="bg-[var(--cf-surface-strong)] border-b border-slate-200 px-4 py-3 grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-[#0d95b5]">{taskCounts.pending}</div>
          <div className="text-xs text-cf-subtle mt-1">待办</div>
        </div>
        <div className="text-center border-l border-r border-slate-200">
          <div className="text-2xl font-bold text-green-600">{taskCounts.completed}</div>
          <div className="text-xs text-cf-subtle mt-1">已完成</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-cf-muted">{taskCounts.myApplications}</div>
          <div className="text-xs text-cf-subtle mt-1">我的申请</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[var(--cf-surface-strong)] border-b border-slate-200 px-4 flex gap-6">
        {(['all', 'pending', 'urgent', ...(hasPermission('workflow:task:done') ? ['done'] : [])] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setPageNum(1); setSelectedTask(null); }}
            aria-pressed={activeTab === tab}
            className={`min-h-[44px] min-w-[44px] py-3 text-sm font-medium border-b-2 transition-colors ${
 activeTab === tab
 ? 'border-[#0d95b5] text-[#0d95b5]'
 : 'border-transparent text-cf-subtle'
 }`}
          >
            {tab === 'all' ? '全部' : tab === 'pending' ? '待办' : tab === 'done' ? '已办' : '紧急'}
          </button>
        ))}
      </div>

      {isOnline && Object.values(filters).some(Boolean) && <p role="status" className="px-4 pt-4 text-sm text-cf-subtle">
        当前筛选：{[filters.keyword, filters.startUserName && `申请人 ${filters.startUserName}`,
          filters.startTimeFrom && `从 ${filters.startTimeFrom}`, filters.startTimeTo && `至 ${filters.startTimeTo}`].filter(Boolean).join(' · ')}
      </p>}
      {savedAt && <p role="status" className="px-4 pt-4 text-sm text-cf-subtle">离线只读 · 保存于 {new Date(savedAt).toLocaleString()} · 共{total}条，已保存最近{tasks.length}条</p>}
      {error && <div role="alert" className="px-4 pt-4 text-sm text-red-700 dark:text-red-300">
        <p>{error}</p><Button className="mt-2 min-h-[44px]" onClick={() => void fetchTasks()}>重新加载</Button>
      </div>}

      {/* Task List */}
      <div className="p-4 space-y-3">
        {filteredTasks.length > 0 ? (
          filteredTasks.map(task => (
            <div
              key={task.workflowTask?.historyId || task.id}
              data-history-id={task.workflowTask?.historyId}
              data-task-id={task.id}
              onClick={() => { if (isOnline && task.workflowTask) setSelectedTask(task.workflowTask); }}
              onKeyDown={event => { if (isOnline && task.workflowTask && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedTask(task.workflowTask); } }}
              className="bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border border-slate-100 active:bg-[var(--cf-bg)] transition-colors"
              role="button"
              aria-disabled={!isOnline || !task.workflowTask}
              tabIndex={isOnline && task.workflowTask ? 0 : -1}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  size={20}
                  className={`mt-0.5 flex-shrink-0 ${
 task.priority === 'high' ? 'text-red-500' : 'text-cf-faint'
 }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-medium text-cf-title line-clamp-2">
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

                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="max-w-full break-words text-xs bg-[#effbfe] text-[#0d95b5] px-2 py-0.5 rounded">
                      {task.processName}
                    </span>
                    <span className="text-xs text-cf-subtle">申请人：{task.applicantName}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-cf-faint">
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
              {doneMode && isOnline && task.workflowTask && <div className="admin-users-row-actions mt-2">
                <ApprovalWithdrawalButton task={task.workflowTask} onSuccess={() => void fetchTasks()} />
              </div>}
            </div>
          ))
        ) : !error ? (
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-12 text-center">
            <CheckCircle2 size={48} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-cf-subtle">
              {doneMode ? '暂无已办记录' : activeTab === 'pending'
                ? '暂无待办任务'
                : activeTab === 'urgent'
                ? '暂无紧急任务'
                : '暂无任务'}
            </p>
            <p className="text-xs text-cf-faint mt-1">{doneMode ? '完成审批后可在此查看记录' : '当前没有符合筛选条件的任务'}</p>
          </div>
        ) : null}
      </div>
      {isOnline && !error && <nav aria-label={doneMode ? '已办分页' : '待办分页'} className="flex flex-wrap items-center justify-between gap-2 px-4 pb-6 text-sm text-cf-subtle">
        <Button variant="outline" className="min-h-[44px]" disabled={pageNum <= 1} onClick={() => { setSelectedTask(null); setPageNum(current => current - 1); }}>上一页</Button>
        <span>第{pageNum}页 · 共{total}条</span>
        <Button variant="outline" className="min-h-[44px]" disabled={pageNum * PAGE_SIZE >= total} onClick={() => { setSelectedTask(null); setPageNum(current => current + 1); }}>下一页</Button>
      </nav>}
      <MobileFilterDrawer open={filterOpen && isOnline} title={doneMode ? '已办筛选' : '待办筛选'} onClose={() => setFilterOpen(false)}
        onApply={applyFilters} onReset={() => { setDraftFilters({ ...EMPTY_FILTERS }); setFilterError(''); }}>
        <div className="space-y-4">
          <label className="block text-sm text-cf-title">流程标题或编号
            <Input className="mt-2 min-h-[44px]" value={draftFilters.keyword} onChange={event => setDraftFilters(current => ({ ...current, keyword: event.target.value }))} />
          </label>
          <label className="block text-sm text-cf-title">申请人
            <Input className="mt-2 min-h-[44px]" value={draftFilters.startUserName} onChange={event => setDraftFilters(current => ({ ...current, startUserName: event.target.value }))} />
          </label>
          <label className="block text-sm text-cf-title">开始日期
            <Input type="date" className="mt-2 min-h-[44px]" max={draftFilters.startTimeTo || undefined} value={draftFilters.startTimeFrom}
              onChange={event => setDraftFilters(current => ({ ...current, startTimeFrom: event.target.value }))} />
          </label>
          <label className="block text-sm text-cf-title">结束日期
            <Input type="date" className="mt-2 min-h-[44px]" min={draftFilters.startTimeFrom || undefined} value={draftFilters.startTimeTo}
              onChange={event => setDraftFilters(current => ({ ...current, startTimeTo: event.target.value }))} />
          </label>
          {filterError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{filterError}</p>}
        </div>
      </MobileFilterDrawer>
      {user && isOnline && <TaskHandleModal task={selectedTask} isOpen={Boolean(selectedTask)} currentUser={user} availableForms={[]}
        onClose={() => setSelectedTask(null)} onComplete={handleTaskChanged} />}
    </div>
  );
};
