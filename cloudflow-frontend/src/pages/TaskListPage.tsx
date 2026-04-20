import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Kanban,
  LayoutList,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/utils/cn';
import { useAuth } from '../context/AuthContext';
import { usePolling } from '../hooks/usePolling';
import { logTask } from '../lib/logger';
import { TaskBoard } from '../components/TaskBoard';
import { TaskHandleModal } from '../components/TaskHandleModal';
import { TaskList } from '../components/TaskList';
import {
  getFormDefinition,
  getFormDefinitions,
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
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspacePageContent,
  WorkspaceStatusPage,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspacePaginationBar,
  WorkspaceSectionCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace/WorkspacePanels';
import { WorkspaceHeroMetricsSection } from '@/components/workspace/WorkspaceHeroMetrics';

const PAGE_SIZE = 12;

type ProcessOption = { key: string; name: string };
type TaskListPageMode = 'pending' | 'applications';
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

const TaskFilterTab = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-xl px-3.5 py-2 text-sm font-medium transition',
      active
        ? 'bg-white text-cyan-700 shadow-sm dark:bg-slate-950 dark:text-cyan-200'
        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
    )}
  >
    {children}
  </button>
);

const TaskWorkCard = ({
  task,
  onOpen,
}: {
  task: UnifiedTask;
  onOpen: (task: UnifiedTask) => void;
}) => {
  const dueLabel = task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : null;
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
        'group w-full rounded-[24px] border p-5 text-left shadow-sm transition hover:-translate-y-0.5',
        'bg-white hover:border-cyan-200 hover:bg-cyan-50/30 dark:bg-slate-950/88 dark:hover:bg-slate-900/90',
        isOverdue
          ? 'border-rose-200 dark:border-rose-900/40'
          : 'border-slate-200 dark:border-slate-800',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
            {task.title}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            协作待办会在看板中支持拖拽状态流转。
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium',
            isDone
              ? 'border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : task.status === 'DOING'
                ? 'border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                : 'border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
          )}
        >
          {task.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            当前负责人
          </div>
          <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {task.assigneeName || '待认领'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            创建时间
          </div>
          <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {createdLabel}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <TaskFilterBadge>
          {task.priority === 2 ? '高优先级' : task.priority === 1 ? '中优先级' : '低优先级'}
        </TaskFilterBadge>
        {dueLabel ? (
          <TaskFilterBadge>
            截止 {dueLabel}
            {isOverdue ? ' · 已超期' : ''}
          </TaskFilterBadge>
        ) : (
          <TaskFilterBadge>无截止时间</TaskFilterBadge>
        )}
      </div>
    </button>
  );
};

export const TaskListPage = ({ type }: { type: TaskListPageMode }) => {
  const { user } = useAuth();

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

  const fetchTasks = useCallback(
    async (showLoading = true) => {
      if (!user) return;

      try {
        if (showLoading) setLoading(true);
        setError(null);

        let processTasks: Task[] = [];
        let workTaskRes: any[] = [];

        if (type === 'applications') {
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
          if (type === 'pending') {
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
        if (type === 'applications') {
          setProcessDefOptions(options);
        } else {
          setTodoProcessDefOptions(options);
        }
      })
      .catch((processDefError) => {
        console.error('Failed to fetch process definitions:', processDefError);
        if (!hasShownProcessDefLoadWarningRef.current) {
          toast.warning('流程类型筛选加载失败，已切换为无筛选选项模式');
          hasShownProcessDefLoadWarningRef.current = true;
        }
      });
  }, [type]);

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
    setIsModalOpen(false);
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
    } catch {
      toast.error('更新任务状态失败');
    }
  };

  const processTasks = rawTasks;
  const workTasks = tasks.filter((task) => task.type === 'WORK');
  const filteredUnifiedTasks = tasks.filter((task) => {
    if (filterType === 'process') return task.type === 'PROCESS';
    if (filterType === 'work') return task.type === 'WORK';
    return true;
  });
  const visibleProcessTasks = type === 'pending' ? (filterType === 'work' ? [] : processTasks) : processTasks;
  const visibleWorkTasks =
    type === 'pending' && filterType !== 'process'
      ? filteredUnifiedTasks.filter((task) => task.type === 'WORK')
      : [];
  const visibleTotalCount =
    type === 'applications' ? visibleProcessTasks.length : visibleProcessTasks.length + visibleWorkTasks.length;
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, pageNum - 2);
    const end = Math.min(totalPages, start + 4);
    const normalizedStart = Math.max(1, end - 4);
    return Array.from(
      { length: end - normalizedStart + 1 },
      (_, index) => normalizedStart + index,
    );
  }, [pageNum, totalPages]);

  const todayLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const headerTitle = type === 'pending' ? '任务中心' : '我的申请';
  const currentViewLabel = type === 'pending' ? (viewMode === 'list' ? '列表视图' : '看板视图') : '申请列表';
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
  const runningApplicationCount = processTasks.filter(
    (task) => task.backendStatus === 'RUNNING' || task.status === TaskStatus.PENDING,
  ).length;
  const completedApplicationCount = processTasks.filter((task) =>
    [
      TaskStatus.APPROVED,
      TaskStatus.REJECTED,
      TaskStatus.RETURNED,
      TaskStatus.TIMED_OUT,
    ].includes(task.status),
  ).length;
  const dueSoonCount = filteredUnifiedTasks.filter((task) => {
    if (!task.dueDate) return false;
    const distance = new Date(task.dueDate).getTime() - Date.now();
    return distance > 0 && distance <= 48 * 60 * 60 * 1000;
  }).length;
  const heroDescription =
    type === 'pending'
      ? `当前视图共展示 ${visibleTotalCount} 条任务，其中流程审批 ${visibleProcessTasks.length} 条、协作待办 ${visibleWorkTasks.length} 条。`
      : `按状态、流程、关键词和时间范围筛选我的申请，当前页展示 ${visibleProcessTasks.length} 条，共 ${total} 条。`;

  const heroMetrics =
    type === 'pending'
      ? [
          {
            label: '当前视图',
            value: `${visibleTotalCount} 条`,
            hint: currentTypeLabel,
            icon: <ClipboardCheck size={16} />,
            iconWrapClassName:
              'stat-icon border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
          },
          {
            label: '流程审批',
            value: `${processTasks.length} 条`,
            hint: currentPendingProcessLabel,
            icon: <LayoutList size={16} />,
            iconWrapClassName:
              'stat-icon border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
          },
          {
            label: '协作待办',
            value: `${workTasks.length} 条`,
            hint: dueSoonCount > 0 ? `${dueSoonCount} 条 48 小时内到期` : '暂无临近到期任务',
            icon: <Kanban size={16} />,
            iconWrapClassName:
              'stat-icon border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
          },
          {
            label: '当前模式',
            value: currentViewLabel,
            hint: '已接入统一任务工作台骨架',
            icon: <RefreshCw size={16} />,
            iconWrapClassName:
              'stat-icon border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200',
          },
        ]
      : [
          {
            label: '申请总量',
            value: `${total} 条`,
            hint: currentStatusLabel,
            icon: <ClipboardCheck size={16} />,
            iconWrapClassName:
              'stat-icon border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
          },
          {
            label: '当前页',
            value: `${visibleProcessTasks.length} 条`,
            hint: `第 ${pageNum} / ${totalPages} 页`,
            icon: <LayoutList size={16} />,
            iconWrapClassName:
              'stat-icon border border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
          },
          {
            label: '进行中',
            value: `${runningApplicationCount} 条`,
            hint: `${completedApplicationCount} 条已结束`,
            icon: <Clock3 size={16} />,
            iconWrapClassName:
              'stat-icon border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
          },
          {
            label: '流程筛选',
            value: currentApplicationProcessLabel,
            hint: priorityFilter ? `优先级 ${priorityFilter}` : '未限制优先级',
            icon: <CheckCircle2 size={16} />,
            iconWrapClassName:
              'stat-icon border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200',
          },
        ];

  const activeFilterBadges = [
    type === 'pending' && todoKeyword ? `关键词：${todoKeyword}` : null,
    type === 'pending' && todoStartUserName ? `申请人：${todoStartUserName}` : null,
    type === 'pending' && todoProcessDefKey ? `流程：${currentPendingProcessLabel}` : null,
    type === 'pending' && (todoStartTimeFrom || todoStartTimeTo)
      ? `时间：${todoStartTimeFrom || '开始'} - ${todoStartTimeTo || '结束'}`
      : null,
    type === 'applications' && keyword ? `关键词：${keyword}` : null,
    type === 'applications' && statusFilter !== 'ALL' ? `状态：${currentStatusLabel}` : null,
    type === 'applications' && processDefKey ? `流程：${currentApplicationProcessLabel}` : null,
    type === 'applications' && priorityFilter ? `优先级：${priorityFilter}` : null,
    type === 'applications' && (startTimeFrom || startTimeTo)
      ? `时间：${startTimeFrom || '开始'} - ${startTimeTo || '结束'}`
      : null,
  ].filter((item): item is string => Boolean(item));

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <WorkspaceStatusPage
        icon={<LayoutList size={28} />}
        title={`正在加载${headerTitle}...`}
        description="正在同步当前用户可见的任务与申请记录，请稍候。"
        actions={
          <Button variant="outline" className="rounded-2xl" onClick={handleRefresh}>
            <RefreshCw size={16} />
            刷新状态
          </Button>
        }
        panelClassName="py-14"
      />
    );
  }

  if (error) {
    return (
      <WorkspaceStatusPage
        icon={<LayoutList size={28} />}
        title={`${headerTitle}加载失败`}
        description={error}
        actions={<Button onClick={() => void fetchTasks()}>重试加载</Button>}
        panelClassName="py-14"
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <TaskFilterBadge>
                <Calendar size={14} className="mr-1 inline" />
                {todayLabel}
              </TaskFilterBadge>
              <TaskFilterBadge>{timeLabel}</TaskFilterBadge>
              <TaskFilterBadge>{currentViewLabel}</TaskFilterBadge>
              <TaskFilterBadge>{type === 'pending' ? currentTypeLabel : currentStatusLabel}</TaskFilterBadge>
            </div>
          }
          title={headerTitle}
          description={heroDescription}
          actions={
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {type === 'pending' ? (
                <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                  <TaskFilterTab active={viewMode === 'list'} onClick={() => setViewMode('list')}>
                    <LayoutList size={16} className="mr-1.5 inline" />
                    列表
                  </TaskFilterTab>
                  <TaskFilterTab active={viewMode === 'board'} onClick={() => setViewMode('board')}>
                    <Kanban size={16} className="mr-1.5 inline" />
                    看板
                  </TaskFilterTab>
                </div>
              ) : null}
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
                刷新
              </Button>
            </div>
          }
          metrics={heroMetrics}
          contentClassName="p-4 sm:p-5"
        />

        <WorkspaceSectionCard
          eyebrow={type === 'pending' ? '筛选与分组' : '筛选与分页'}
          title={type === 'pending' ? '任务筛选' : '申请筛选'}
          description={
            type === 'pending'
              ? '在统一工作台里切换任务类型、流程范围和时间条件，快速聚焦当前待处理内容。'
              : '按状态、流程、优先级和时间筛选我的申请，保持列表结果与分页同步。'
          }
          headerAside={
            <div className="flex flex-wrap items-center gap-2">
              <TaskFilterBadge>{type === 'pending' ? `共 ${visibleTotalCount} 条` : `总计 ${total} 条`}</TaskFilterBadge>
              {activeFilterBadges.length > 0 ? <TaskFilterBadge>{`已启用 ${activeFilterBadges.length} 个条件`}</TaskFilterBadge> : null}
            </div>
          }
          className={workspaceGlassSurfaceClassName}
          bodyClassName="space-y-4"
        >
          {type === 'pending' ? (
            <>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
                {filterTypeTabs.map((tab) => (
                  <TaskFilterTab
                    key={tab.key}
                    active={filterType === tab.key}
                    onClick={() => setFilterType(tab.key)}
                  >
                    {tab.label}
                  </TaskFilterTab>
                ))}
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(220px,1fr)_minmax(180px,0.8fr)_minmax(0,1.1fr)]">
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
                  <SelectTrigger>
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
                  />
                  <DatePicker
                    type="date"
                    value={todoStartTimeTo}
                    onChange={(event) => setTodoStartTimeTo(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="soft" onClick={handleTodoSearch}>
                  <Search size={16} />
                  应用筛选
                </Button>
                {hasTodoActiveFilters ? (
                  <Button variant="ghost" onClick={handleClearTodoFilters}>
                    <X size={16} />
                    清除条件
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
                {statusTabs.map((tab) => (
                  <TaskFilterTab
                    key={tab.key}
                    active={statusFilter === tab.key}
                    onClick={() => handleStatusChange(tab.key)}
                  >
                    {tab.label}
                  </TaskFilterTab>
                ))}
              </div>

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
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                  />
                  <DatePicker
                    type="date"
                    value={startTimeTo}
                    onChange={(event) => handleTimeRangeChange(startTimeFrom, event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="soft" onClick={handleSearch}>
                  <Search size={16} />
                  应用筛选
                </Button>
                {hasActiveFilters ? (
                  <Button variant="ghost" onClick={handleClearFilters}>
                    <X size={16} />
                    清除条件
                  </Button>
                ) : null}
              </div>
            </>
          )}

          {activeFilterBadges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              {activeFilterBadges.map((badge) => (
                <TaskFilterBadge key={badge}>{badge}</TaskFilterBadge>
              ))}
            </div>
          ) : null}
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          eyebrow={type === 'pending' ? '任务结果' : '申请结果'}
          title={type === 'pending' ? '当前任务内容' : '当前申请记录'}
          description={
            type === 'pending'
              ? viewMode === 'board'
                ? '流程审批与协作待办统一进入看板视图，流程任务只读打开，协作任务支持拖拽。'
                : '列表视图聚合流程审批与协作待办，便于顺序处理和阅读摘要。'
              : '申请列表保留审批详情弹层与撤回能力，分页结果与筛选条件联动。'
          }
          headerAside={
            <div className="flex flex-wrap items-center gap-2">
              <TaskFilterBadge>
                {type === 'pending' ? currentTypeLabel : `第 ${pageNum} / ${totalPages} 页`}
              </TaskFilterBadge>
              {type === 'pending' ? <TaskFilterBadge>{currentViewLabel}</TaskFilterBadge> : null}
            </div>
          }
          className={workspaceGlassSurfaceClassName}
          bodyClassName="space-y-6"
        >
          {viewMode === 'board' && type === 'pending' ? (
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
              <WorkspaceEmptyPanel
                variant="glass"
                icon={<Kanban size={24} />}
                title="当前筛选条件下没有任务"
                description="可以调整任务类型、流程范围或时间条件后再查看。"
              />
            )
          ) : visibleTotalCount === 0 ? (
            <WorkspaceEmptyPanel
              variant="glass"
              icon={<ClipboardCheck size={24} />}
              title={type === 'pending' ? '暂无待处理任务' : '暂无申请记录'}
              description={
                type === 'pending'
                  ? '当前筛选条件下没有可处理的流程审批或协作待办。'
                  : '当前筛选条件下没有匹配的申请记录。'
              }
            />
          ) : (
            <>
              {visibleProcessTasks.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        流程审批
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {type === 'applications'
                          ? `当前页 ${visibleProcessTasks.length} 条，总计 ${total} 条`
                          : `当前筛选下 ${visibleProcessTasks.length} 条流程待办`}
                      </div>
                    </div>
                    <TaskFilterBadge>
                      {type === 'applications' ? currentStatusLabel : currentPendingProcessLabel}
                    </TaskFilterBadge>
                  </div>

                  <TaskList
                    tasks={visibleProcessTasks}
                    onTaskClick={(task) => {
                      setSelectedTask(task);
                      setIsModalOpen(true);
                    }}
                    showRecallButton={type === 'applications'}
                    onRecallSuccess={() => void fetchTasks(false)}
                  />
                </div>
              ) : null}

              {visibleWorkTasks.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        协作待办
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        看板模式下可直接拖拽状态，列表模式下用于快速查看摘要。
                      </div>
                    </div>
                    <TaskFilterBadge>{`${visibleWorkTasks.length} 条`}</TaskFilterBadge>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {visibleWorkTasks.map((task) => (
                      <TaskWorkCard
                        key={task.id}
                        task={task}
                        onOpen={(openedTask) => logTask.debug('Open work task card', openedTask)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {type === 'applications' && totalPages > 1 ? (
            <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
              <WorkspacePaginationBar
                total={total}
                pageNum={pageNum}
                totalPages={totalPages}
                onPrev={() => setPageNum((previous) => Math.max(1, previous - 1))}
                onNext={() => setPageNum((previous) => Math.min(totalPages, previous + 1))}
                prevDisabled={pageNum <= 1}
                nextDisabled={pageNum >= totalPages}
              />

              <div className="flex flex-wrap items-center justify-center gap-2">
                {pageNumbers.map((page) => (
                  <Button
                    key={page}
                    type="button"
                    size="sm"
                    variant={page === pageNum ? 'default' : 'outline'}
                    onClick={() => setPageNum(page)}
                  >
                    {page}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </WorkspaceSectionCard>

        <TaskHandleModal
          isOpen={isModalOpen}
          task={selectedTask}
          availableForms={savedForms}
          currentUser={user}
          onClose={() => setIsModalOpen(false)}
          onComplete={handleTaskUpdate}
          viewOnly={type === 'applications'}
        />
      </WorkspacePageContent>
    </div>
  );
};

export default TaskListPage;
