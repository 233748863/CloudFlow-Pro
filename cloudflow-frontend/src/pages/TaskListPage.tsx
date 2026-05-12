import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Kanban,
  LayoutList,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  Button,
  DatePicker,
  Input,
  LoadingSpinner,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { cn } from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { logTask } from '../lib/logger';
import { TaskBoard } from '../components/TaskBoard';
import { TaskHandleModal } from '../components/TaskHandleModal';
import { TaskList } from '../components/TaskList';
import {
  getFormDefinition,
  getFormDefinitions,
  getDoneTasks,
  getMyInstances,
  getProcessDefinitions,
  getTodoTasks,
} from '../services/api/workflow';
import { getWorkTasks, updateWorkTaskStatus } from '../services/api/workTask';
import { FormDefinition, Role, Task, TaskStatus, UnifiedTask } from '../types';
import {
  mapBackendInstanceToTask,
  mapBackendTaskToFrontend,
  mapTaskToUnified,
  mapWorkTaskToUnified,
} from '../utils/mappers';

const PAGE_SIZE = 12;

type ProcessOption = { key: string; name: string };
type TaskListPageMode = 'pending' | 'applications';
type ApprovalCenterMode = TaskListPageMode | 'done';
type FilterType = 'all' | 'process' | 'work';
type ViewMode = 'list' | 'board';
type ApplicationStatus = 'ALL' | 'RUNNING' | 'COMPLETED' | 'REJECTED' | 'REVOKED';

const mapBackendForm = (f: any): FormDefinition => {
  let fields: any[] = [];
  const raw =
    typeof f?.fieldsJson === 'string'
      ? f.fieldsJson
      : typeof f?.formSchema === 'string'
        ? f.formSchema
        : null;

  if (raw) {
    try {
      fields = JSON.parse(raw);
    } catch {
      try {
        const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        fields = JSON.parse(sanitized);
      } catch {
        fields = [];
      }
    }
  }

  return {
    id: String(f?.formId || ''),
    name: f?.formName || '未命名表单',
    fields,
  };
};

const statusTabs: Array<{ key: ApplicationStatus; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'RUNNING', label: '进行中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'REJECTED', label: '已拒绝' },
  { key: 'REVOKED', label: '已撤回' },
];

const filterTypeTabs: Array<{ key: FilterType; label: string }> = [
  { key: 'all', label: '全部任务' },
  { key: 'process', label: '流程审批' },
  { key: 'work', label: '协作待办' },
];

const centerModeTabs: Array<{ key: ApprovalCenterMode; label: string }> = [
  { key: 'pending', label: '待办' },
  { key: 'done', label: '已办' },
  { key: 'applications', label: '我的申请' },
];

const buildProcessOptions = (source: any[]): ProcessOption[] => {
  const latestByKey = new Map<string, any>();

  for (const def of source) {
    const defKey = String(def.processKey || '').trim();
    if (!defKey) continue;

    const current = latestByKey.get(defKey);
    if (!current) {
      latestByKey.set(defKey, def);
      continue;
    }

    const currentPublished = String(current.status || '').toUpperCase() === 'PUBLISHED';
    const nextPublished = String(def.status || '').toUpperCase() === 'PUBLISHED';
    const currentVersion = Number(current.version || 0);
    const nextVersion = Number(def.version || 0);

    if (
      (nextPublished && !currentPublished) ||
      (nextPublished === currentPublished && nextVersion >= currentVersion)
    ) {
      latestByKey.set(defKey, def);
    }
  }

  return Array.from(latestByKey.values())
    .map((def: any) => {
      const defKey = String(def.processKey || '').trim();
      const defName = def.processName || defKey;
      return { key: defKey, name: defName };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
};

const TaskFilterBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
    {children}
  </span>
);

const TaskCompactWorkCard = ({
  task,
  onOpen,
}: {
  task: UnifiedTask;
  onOpen: (task: UnifiedTask) => void;
}) => {
  const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '无截止时间';
  const createdLabel = task.createdTime
    ? new Date(task.createdTime).toLocaleDateString('zh-CN')
    : '暂无';
  const isDone = task.status === 'DONE';
  const isOverdue = Boolean(task.dueDate && !isDone && new Date(task.dueDate) < new Date());

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={cn(
        'w-full px-4 py-4 text-left transition-colors hover:bg-slate-50',
        isOverdue
          ? 'text-rose-600 dark:text-rose-300'
          : 'text-slate-500 dark:text-slate-400',
        'dark:hover:bg-slate-900/40',
      )}
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.7fr)_160px_120px] lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-6 text-slate-900 dark:text-slate-100">
            {task.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>负责人 {task.assigneeName || '待认领'}</span>
            <span>创建 {createdLabel}</span>
            <span className={cn(isOverdue && 'text-rose-600 dark:text-rose-300')}>
              截止 {dueLabel}
            </span>
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 lg:border-l lg:border-slate-100 lg:pl-6 dark:lg:border-slate-800">
          <div>状态</div>
          <div
            className={cn(
              'text-sm font-medium',
              isDone
                ? 'text-emerald-700 dark:text-emerald-200'
                : task.status === 'DOING'
                  ? 'text-amber-700 dark:text-amber-200'
                  : 'text-cyan-700 dark:text-cyan-200',
            )}
          >
            {task.statusLabel}
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 lg:border-l lg:border-slate-100 lg:pl-6 dark:lg:border-slate-800">
          <div>优先级</div>
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {task.priority === 2 ? '高' : task.priority === 1 ? '中' : '低'}
          </div>
        </div>
      </div>
    </button>
  );
};

export const TaskListPage = ({ type }: { type: TaskListPageMode }) => {
  const { user } = useAuth();

  const [centerMode, setCenterMode] = useState<ApprovalCenterMode>(type);
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [rawTasks, setRawTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);

  const hasShownFormLoadWarningRef = useRef(false);
  const hasShownProcessDefLoadWarningRef = useRef(false);
  const hasShownFormListLoadWarningRef = useRef(false);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterType, setFilterType] = useState<FilterType>('all');

  const [todoKeyword, setTodoKeyword] = useState('');
  const [todoSearchInput, setTodoSearchInput] = useState('');
  const [todoProcessDefKey, setTodoProcessDefKey] = useState('');
  const [todoStartTimeFrom, setTodoStartTimeFrom] = useState('');
  const [todoStartTimeTo, setTodoStartTimeTo] = useState('');
  const [todoStartUserName, setTodoStartUserName] = useState('');
  const [todoProcessDefOptions, setTodoProcessDefOptions] = useState<ProcessOption[]>([]);

  const [statusFilter, setStatusFilter] = useState<ApplicationStatus>('ALL');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [processDefKey, setProcessDefKey] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [startTimeFrom, setStartTimeFrom] = useState('');
  const [startTimeTo, setStartTimeTo] = useState('');
  const [processDefOptions, setProcessDefOptions] = useState<ProcessOption[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setCenterMode(type);
    setPageNum(1);
  }, [type]);

  const fetchTasks = useCallback(
    async (showLoading = true) => {
      if (!user) return;

      try {
        if (showLoading) setLoading(true);
        setError(null);

        let processTasks: Task[] = [];
        let workTaskRes: any[] = [];

        if (centerMode === 'applications') {
          const res = await getMyInstances({
            pageNum,
            pageSize: PAGE_SIZE,
            status: statusFilter !== 'ALL' ? statusFilter : undefined,
            keyword: keyword || undefined,
            processDefKey: processDefKey || undefined,
            priority: priorityFilter || undefined,
            startTimeFrom: startTimeFrom || undefined,
            startTimeTo: startTimeTo || undefined,
          });

          let records: any[] = [];
          let totalCount = 0;

          if (res && typeof res === 'object') {
            records = res.records || res.rows || [];
            totalCount = res.total || 0;
          }

          if (Array.isArray(res)) {
            records = res;
            totalCount = res.length;
          }

          processTasks = records.map(mapBackendInstanceToTask);
          setTotal(totalCount);
        } else if (centerMode === 'done') {
          const doneRes = await getDoneTasks({
            pageNum,
            pageSize: PAGE_SIZE,
            keyword: todoKeyword || undefined,
            processDefKey: todoProcessDefKey || undefined,
            startTimeFrom: todoStartTimeFrom || undefined,
            startTimeTo: todoStartTimeTo || undefined,
            startUserName: todoStartUserName || undefined,
          });

          let records: any[] = [];
          let totalCount = 0;

          if (doneRes && typeof doneRes === 'object') {
            records = doneRes.records || doneRes.rows || [];
            totalCount = doneRes.total || 0;
          }

          if (Array.isArray(doneRes)) {
            records = doneRes;
            totalCount = doneRes.length;
          }

          processTasks = records.map(mapBackendTaskToFrontend);
          setTotal(totalCount || records.length);
        } else {
          const todoParams: Record<string, string> = {};
          if (todoKeyword) todoParams.keyword = todoKeyword;
          if (todoProcessDefKey) todoParams.processDefKey = todoProcessDefKey;
          if (todoStartTimeFrom) todoParams.startTimeFrom = todoStartTimeFrom;
          if (todoStartTimeTo) todoParams.startTimeTo = todoStartTimeTo;
          if (todoStartUserName) todoParams.startUserName = todoStartUserName;

          const [todoRes, workRes] = await Promise.all([
            getTodoTasks(Object.keys(todoParams).length > 0 ? todoParams : undefined),
            getWorkTasks(),
          ]);

          let todoList: any[] = [];

          if (todoRes && typeof todoRes === 'object' && !Array.isArray(todoRes)) {
            todoList = todoRes.records || todoRes.rows || [];
          } else if (Array.isArray(todoRes)) {
            todoList = todoRes;
          }

          processTasks = todoList.map(mapBackendTaskToFrontend);
          workTaskRes = Array.isArray(workRes) ? workRes : [];
        }

        const filteredProcessTasks = processTasks.filter((task) => {
          if (centerMode === 'pending') {
            return (
              task.status === TaskStatus.PENDING &&
              (task.assigneeId === user.id || (task.assigneeRole === user.role && !task.assigneeId))
            );
          }

          return true;
        });

        setRawTasks(filteredProcessTasks);

        let unifiedTasks: UnifiedTask[] = filteredProcessTasks.map(mapTaskToUnified);

        if (workTaskRes.length > 0) {
          unifiedTasks = [...unifiedTasks, ...workTaskRes.map(mapWorkTaskToUnified)];
        }

        setTasks(unifiedTasks);
      } catch (requestError) {
        logTask.error('Fetch tasks failed', requestError);
        const message =
          requestError instanceof Error ? requestError.message : '加载任务失败，请稍后重试';
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      keyword,
      pageNum,
      priorityFilter,
      processDefKey,
      startTimeFrom,
      startTimeTo,
      statusFilter,
      todoKeyword,
      todoProcessDefKey,
      todoStartTimeFrom,
      todoStartTimeTo,
      todoStartUserName,
      centerMode,
      type,
      user,
    ],
  );

  usePolling(() => fetchTasks(false), {
    interval: 30000,
    immediate: false,
    enabled: !!user && !loading,
    onError: (pollingError) => logTask.error('任务列表定时刷新失败:', pollingError),
  });

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    getProcessDefinitions({ latestOnly: false })
      .then((res) => {
        if (!Array.isArray(res)) return;

        const options = buildProcessOptions(res);
        setProcessDefOptions(options);
        setTodoProcessDefOptions(options);
      })
      .catch((processDefError) => {
        console.error('Failed to fetch process definitions:', processDefError);
        if (!hasShownProcessDefLoadWarningRef.current) {
          toast.warning('流程类型筛选加载失败，已切换为无筛选选项模式');
          hasShownProcessDefLoadWarningRef.current = true;
        }
      });
  }, []);

  useEffect(() => {
    if (!user || user.role !== Role.ADMIN) {
      setSavedForms([]);
      return;
    }

    getFormDefinitions()
      .then((res) => {
        if (Array.isArray(res)) {
          setSavedForms(res.map((item: any) => mapBackendForm(item)));
        }
      })
      .catch((formListError) => {
        console.error('Failed to fetch form definitions:', formListError);
        if (!hasShownFormListLoadWarningRef.current) {
          toast.warning('表单定义加载失败，审批详情将回退原始业务数据展示');
          hasShownFormListLoadWarningRef.current = true;
        }
      });
  }, [user]);

  useEffect(() => {
    const formIds = Array.from(
      new Set(
        rawTasks
          .map((task) => task.formId)
          .filter((formId): formId is string => typeof formId === 'string' && formId.trim() !== ''),
      ),
    );

    const existingIds = new Set(savedForms.map((form) => form.id));
    const missingIds = formIds.filter((id) => !existingIds.has(id));

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;
    let failedCount = 0;

    Promise.all(
      missingIds.map((id) =>
        getFormDefinition(id)
          .then((res) => mapBackendForm(res))
          .catch((loadError) => {
            failedCount += 1;
            logTask.warn(`按 formId 懒加载表单失败: ${id}`, loadError);
            return null;
          }),
      ),
    ).then((forms) => {
      if (cancelled) return;

      if (failedCount > 0 && !hasShownFormLoadWarningRef.current) {
        toast.warning('部分任务绑定表单加载失败，将显示原始业务数据');
        hasShownFormLoadWarningRef.current = true;
      }

      const loadedForms = forms.filter((item): item is FormDefinition => Boolean(item));
      if (loadedForms.length === 0) return;

      setSavedForms((previous) => {
        const nextMap = new Map(previous.map((item) => [item.id, item] as const));
        for (const form of loadedForms) {
          nextMap.set(form.id, form);
        }
        return Array.from(nextMap.values());
      });
    });

    return () => {
      cancelled = true;
    };
  }, [rawTasks, savedForms]);

  const handleTaskUpdate = () => {
    void fetchTasks();
    setSelectedTask(null);
    setIsModalOpen(false);
  };

  const handleCloseTaskModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchTasks(false);
  };

  const handleStatusChange = (nextStatus: ApplicationStatus) => {
    setStatusFilter(nextStatus);
    setPageNum(1);
  };

  const handleProcessDefKeyChange = (key: string) => {
    setProcessDefKey(key === 'ALL_TYPES' ? '' : key);
    setPageNum(1);
  };

  const handlePriorityChange = (value: string) => {
    setPriorityFilter(value === 'ALL_PRIORITIES' ? '' : value);
    setPageNum(1);
  };

  const handleTodoProcessDefKeyChange = (key: string) => {
    setTodoProcessDefKey(key === 'ALL_TYPES' ? '' : key);
    setPageNum(1);
  };

  const handleTimeRangeChange = (from: string, to: string) => {
    setStartTimeFrom(from);
    setStartTimeTo(to);
    setPageNum(1);
  };

  const handleClearFilters = () => {
    setStatusFilter('ALL');
    setKeyword('');
    setSearchInput('');
    setProcessDefKey('');
    setPriorityFilter('');
    setStartTimeFrom('');
    setStartTimeTo('');
    setPageNum(1);
  };

  const handleClearTodoFilters = () => {
    setTodoKeyword('');
    setTodoSearchInput('');
    setTodoProcessDefKey('');
    setTodoStartTimeFrom('');
    setTodoStartTimeTo('');
    setTodoStartUserName('');
    setPageNum(1);
  };

  const handleSearch = () => {
    setKeyword(searchInput);
    setPageNum(1);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleTodoSearch = () => {
    setTodoKeyword(todoSearchInput);
    setPageNum(1);
  };

  const handleTodoSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleTodoSearch();
    }
  };

  const handleTaskMove = async (taskId: string, newStatus: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    if (task.type !== 'WORK') {
      toast.info('流程任务请点击进入详情进行处理');
      return;
    }

    try {
      await updateWorkTaskStatus(taskId, newStatus);
      toast.success('协作任务状态已更新');
      void fetchTasks(false);
    } catch (error) {
      toast.error(getErrorMessage(error, '更新任务状态失败'));
    }
  };

  const processTasks = rawTasks;
  const filteredUnifiedTasks = tasks.filter((task) => {
    if (filterType === 'process') return task.type === 'PROCESS';
    if (filterType === 'work') return task.type === 'WORK';
    return true;
  });
  const visibleProcessTasks =
    centerMode === 'pending' ? (filterType === 'work' ? [] : processTasks) : processTasks;
  const visibleWorkTasks =
    centerMode === 'pending' && filterType !== 'process'
      ? filteredUnifiedTasks.filter((task) => task.type === 'WORK')
      : [];
  const visibleTotalCount =
    centerMode === 'pending' ? visibleProcessTasks.length + visibleWorkTasks.length : visibleProcessTasks.length;
  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    Boolean(keyword) ||
    Boolean(processDefKey) ||
    Boolean(priorityFilter) ||
    Boolean(startTimeFrom) ||
    Boolean(startTimeTo);
  const hasTodoActiveFilters =
    Boolean(todoKeyword) ||
    Boolean(todoProcessDefKey) ||
    Boolean(todoStartTimeFrom) ||
    Boolean(todoStartTimeTo) ||
    Boolean(todoStartUserName);
  const currentViewLabel =
    centerMode === 'pending' ? (viewMode === 'list' ? '列表视图' : '看板视图') : '列表视图';
  const currentTypeLabel =
    filterType === 'process' ? '流程审批' : filterType === 'work' ? '协作待办' : '全部任务';
  const currentStatusLabel =
    statusFilter === 'RUNNING'
      ? '进行中'
      : statusFilter === 'COMPLETED'
        ? '已完成'
        : statusFilter === 'REJECTED'
          ? '已拒绝'
          : statusFilter === 'REVOKED'
            ? '已撤回'
            : '全部状态';
  const currentPendingProcessLabel =
    todoProcessDefOptions.find((item) => item.key === todoProcessDefKey)?.name || '全部流程';
  const currentApplicationProcessLabel =
    processDefOptions.find((item) => item.key === processDefKey)?.name || '全部流程';

  const activeFilterBadges = [
    centerMode !== 'applications' && todoKeyword ? `关键词：${todoKeyword}` : null,
    centerMode !== 'applications' && todoStartUserName ? `申请人：${todoStartUserName}` : null,
    centerMode !== 'applications' && todoProcessDefKey ? `流程：${currentPendingProcessLabel}` : null,
    centerMode !== 'applications' && (todoStartTimeFrom || todoStartTimeTo)
      ? `时间：${todoStartTimeFrom || '开始'} - ${todoStartTimeTo || '结束'}`
      : null,
    centerMode === 'applications' && keyword ? `关键词：${keyword}` : null,
    centerMode === 'applications' && statusFilter !== 'ALL' ? `状态：${currentStatusLabel}` : null,
    centerMode === 'applications' && processDefKey ? `流程：${currentApplicationProcessLabel}` : null,
    centerMode === 'applications' && priorityFilter ? `优先级：${priorityFilter}` : null,
    centerMode === 'applications' && (startTimeFrom || startTimeTo)
      ? `时间：${startTimeFrom || '开始'} - ${startTimeTo || '结束'}`
      : null,
  ].filter((item): item is string => Boolean(item));
  const pageTitle =
    centerMode === 'pending' ? '审批待办' : centerMode === 'done' ? '我的已办' : '我的申请';
  const resultTitle =
    centerMode === 'pending' ? '当前待办内容' : centerMode === 'done' ? '当前已办记录' : '当前申请记录';

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="px-4 py-4 md:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <LoadingSpinner size="lg" className="mx-auto mb-3" />
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            正在加载{pageTitle}
          </div>
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            正在同步当前用户可见的任务与申请记录。
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-4 md:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {pageTitle}加载失败
          </div>
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {error}
          </div>
          <div className="mt-4">
            <Button onClick={() => void fetchTasks()}>
              重试加载
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-6">
      <TablePageLayout
        filters={(
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <SegmentedControl className="min-h-10 flex-wrap">
                  {centerModeTabs.map((tab) => (
                    <SegmentedControlItem
                      key={tab.key}
                      size="sm"
                      active={centerMode === tab.key}
                      onClick={() => {
                        setCenterMode(tab.key);
                        setPageNum(1);
                      }}
                    >
                      {tab.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>

                <div className="flex flex-wrap items-center gap-2">
                  {centerMode === 'pending' ? (
                    <SegmentedControl className="min-h-10 flex-wrap">
                      {filterTypeTabs.map((tab) => (
                        <SegmentedControlItem
                          key={tab.key}
                          size="sm"
                          active={filterType === tab.key}
                          onClick={() => setFilterType(tab.key)}
                        >
                          {tab.label}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                  ) : null}
                  {centerMode === 'applications' ? (
                    <SegmentedControl className="min-h-10 flex-wrap">
                      {statusTabs.map((tab) => (
                        <SegmentedControlItem
                          key={tab.key}
                          size="sm"
                          active={statusFilter === tab.key}
                          onClick={() => handleStatusChange(tab.key)}
                        >
                          {tab.label}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                  ) : null}
                  {centerMode === 'pending' ? (
                    <SegmentedControl className="min-h-10">
                      <SegmentedControlItem size="sm" active={viewMode === 'list'} onClick={() => setViewMode('list')}>
                        <LayoutList size={16} />
                        列表
                      </SegmentedControlItem>
                      <SegmentedControlItem size="sm" active={viewMode === 'board'} onClick={() => setViewMode('board')}>
                        <Kanban size={16} />
                        看板
                      </SegmentedControlItem>
                    </SegmentedControl>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                    <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
                    刷新
                  </Button>
                </div>
              </div>

              {centerMode !== 'applications' ? (
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(0,1.05fr)]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      type="text"
                      placeholder="搜索流程标题或编号"
                      value={todoSearchInput}
                      onChange={(event) => setTodoSearchInput(event.target.value)}
                      onKeyDown={handleTodoSearchKeyDown}
                      className="pl-10"
                    />
                  </div>

                  <Select value={todoProcessDefKey || 'ALL_TYPES'} onValueChange={handleTodoProcessDefKeyChange}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="全部流程类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL_TYPES">全部流程类型</SelectItem>
                      {todoProcessDefOptions.map((option) => (
                        <SelectItem key={option.key} value={String(option.key)}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      type="text"
                      placeholder="申请人姓名"
                      value={todoStartUserName}
                      onChange={(event) => setTodoStartUserName(event.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DatePicker
                      type="date"
                      value={todoStartTimeFrom}
                      onChange={(event) => setTodoStartTimeFrom(event.target.value)}
                      placeholder="开始日期"
                      className="h-10"
                    />
                    <DatePicker
                      type="date"
                      value={todoStartTimeTo}
                      onChange={(event) => setTodoStartTimeTo(event.target.value)}
                      placeholder="结束日期"
                      className="h-10"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(220px,1fr)_minmax(150px,0.8fr)_minmax(0,1.1fr)]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      type="text"
                      placeholder="搜索流程标题、编号或摘要"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="pl-10"
                    />
                  </div>

                  <Select value={processDefKey || 'ALL_TYPES'} onValueChange={handleProcessDefKeyChange}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="全部流程类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL_TYPES">全部流程类型</SelectItem>
                      {processDefOptions.map((option) => (
                        <SelectItem key={option.key} value={String(option.key)}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={priorityFilter || 'ALL_PRIORITIES'} onValueChange={handlePriorityChange}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="全部优先级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL_PRIORITIES">全部优先级</SelectItem>
                      <SelectItem value="URGENT">紧急</SelectItem>
                      <SelectItem value="HIGH">高</SelectItem>
                      <SelectItem value="NORMAL">普通</SelectItem>
                      <SelectItem value="LOW">低</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <DatePicker
                      type="date"
                      value={startTimeFrom}
                      onChange={(event) => handleTimeRangeChange(event.target.value, startTimeTo)}
                      placeholder="开始日期"
                      className="h-10"
                    />
                    <DatePicker
                      type="date"
                      value={startTimeTo}
                      onChange={(event) => handleTimeRangeChange(startTimeFrom, event.target.value)}
                      placeholder="结束日期"
                      className="h-10"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {activeFilterBadges.map((badge) => (
                    <TaskFilterBadge key={badge}>{badge}</TaskFilterBadge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={centerMode !== 'applications' ? handleTodoSearch : handleSearch}>
                    <Search size={16} />
                    应用筛选
                  </Button>
                  {(centerMode !== 'applications' ? hasTodoActiveFilters : hasActiveFilters) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={centerMode !== 'applications' ? handleClearTodoFilters : handleClearFilters}
                    >
                      <X size={16} />
                      清空
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex flex-col">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                  {resultTitle}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {centerMode === 'pending' ? `共 ${visibleTotalCount} 条` : `共 ${total} 条`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <TaskFilterBadge>
                  {centerMode === 'pending'
                    ? currentTypeLabel
                    : centerMode === 'done'
                      ? currentPendingProcessLabel
                      : currentStatusLabel}
                </TaskFilterBadge>
                {centerMode === 'pending' ? <TaskFilterBadge>{currentViewLabel}</TaskFilterBadge> : null}
                {centerMode === 'applications' && processDefKey ? (
                  <TaskFilterBadge>{currentApplicationProcessLabel}</TaskFilterBadge>
                ) : null}
              </div>
            </div>

            <div className="px-4 py-4">
              {viewMode === 'board' && centerMode === 'pending' ? (
                filteredUnifiedTasks.length > 0 ? (
                  <TaskBoard
                    tasks={filteredUnifiedTasks}
                    onTaskMove={handleTaskMove}
                    onTaskClick={(task) => {
                      if (task.type === 'PROCESS') {
                        setSelectedTask(task.sourceData as Task);
                        setIsModalOpen(true);
                        return;
                      }

                      logTask.debug('Open work task card from board', task);
                    }}
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                    当前筛选条件下暂无待办任务
                  </div>
                )
              ) : visibleTotalCount === 0 ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                  {centerMode === 'pending'
                    ? '当前筛选条件下暂无待处理任务'
                    : centerMode === 'done'
                      ? '当前筛选条件下暂无已办记录'
                      : '当前筛选条件下暂无申请记录'}
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleProcessTasks.length > 0 ? (
                    <section className="space-y-3 py-5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            流程审批
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {centerMode !== 'pending'
                              ? `当前页 ${visibleProcessTasks.length} 条，总计 ${total} 条`
                              : `当前筛选下 ${visibleProcessTasks.length} 条流程待办`}
                          </div>
                        </div>
                        <TaskFilterBadge>
                          {centerMode === 'applications' ? currentStatusLabel : currentPendingProcessLabel}
                        </TaskFilterBadge>
                      </div>

                      <TaskList
                        tasks={visibleProcessTasks}
                        onTaskClick={(task) => {
                          setSelectedTask(task);
                          setIsModalOpen(true);
                        }}
                        showRecallButton={centerMode === 'applications'}
                        primaryActionLabel={centerMode === 'pending' ? '处理' : '详情'}
                        onRecallSuccess={() => void fetchTasks(false)}
                      />
                    </section>
                  ) : null}

                  {visibleWorkTasks.length > 0 ? (
                    <section className="space-y-3 py-5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            协作待办
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            当前筛选下 {visibleWorkTasks.length} 条协作待办
                          </div>
                        </div>
                        <TaskFilterBadge>协作待办</TaskFilterBadge>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {visibleWorkTasks.map((task) => (
                          <TaskCompactWorkCard
                            key={task.id}
                            task={task}
                            onOpen={(openedTask) => logTask.debug('Open work task card', openedTask)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={
          centerMode !== 'pending' && total > PAGE_SIZE ? (
            <Pagination
              total={total}
              page={pageNum}
              pageSize={PAGE_SIZE}
              showPageSizeSelector={false}
              onPageChange={setPageNum}
              onPageSizeChange={() => undefined}
            />
          ) : null
        }
      />
      <TaskHandleModal
        isOpen={isModalOpen}
        task={selectedTask}
        availableForms={savedForms}
        currentUser={user}
        onClose={handleCloseTaskModal}
        onComplete={handleTaskUpdate}
        viewOnly={centerMode !== 'pending'}
      />
    </div>
  );
};

export default TaskListPage;
