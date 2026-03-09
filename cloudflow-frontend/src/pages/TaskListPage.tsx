import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Task, TaskStatus, FormDefinition, UnifiedTask, WorkTaskStatus, Role } from '../types';
import { TaskList } from '../components/TaskList';
import { TaskHandleModal } from '../components/TaskHandleModal';
import { TaskBoard } from '../components/TaskBoard';
import { getTodoTasks, getMyInstances, getFormDefinition, getFormDefinitions, getProcessDefinitions } from '../services/api/workflow';
import { getWorkTasks, updateWorkTaskStatus } from '../services/api/workTask';
import { useAuth } from '../context/AuthContext';
import { mapBackendTaskToFrontend, mapBackendInstanceToTask, mapTaskToUnified, mapWorkTaskToUnified } from '../utils/mappers';
import { LayoutList, Kanban, RefreshCw, Search, ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { DatePicker, EmptyError, EmptyTasks, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SkeletonCard } from '@/components/ui';
import { toast } from 'sonner';
import { usePolling } from '../hooks/usePolling';
import { logTask } from '../lib/logger';

// 每页条数
const PAGE_SIZE = 12;

/**
 * 统一解析后端表单结构，仅接受 fieldsJson / formSchema。
 */
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
  } else {
    fields = [];
  }

  return {
    id: String(f?.formId || ''),
    name: f?.formName || '未命名表单',
    fields,
  };
};

export const TaskListPage = ({ type }: { type: 'pending' | 'applications' }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [rawTasks, setRawTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const hasShownFormLoadWarningRef = useRef(false);
  const hasShownProcessDefLoadWarningRef = useRef(false);
  const hasShownFormListLoadWarningRef = useRef(false);
  
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [filterType, setFilterType] = useState<'all' | 'process' | 'work'>('all');

  // 任务中心搜索条件状态
  const [todoKeyword, setTodoKeyword] = useState('');
  const [todoSearchInput, setTodoSearchInput] = useState('');
  const [todoProcessDefKey, setTodoProcessDefKey] = useState('');
  const [todoStartTimeFrom, setTodoStartTimeFrom] = useState('');
  const [todoStartTimeTo, setTodoStartTimeTo] = useState('');
  const [todoStartUserName, setTodoStartUserName] = useState('');
  const [todoProcessDefOptions, setTodoProcessDefOptions] = useState<{ key: string; name: string }[]>([]);

  // "我的申请"服务端分页和筛选状态
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'RUNNING' | 'COMPLETED' | 'REJECTED' | 'REVOKED'>('ALL');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState(''); // 输入框值（回车或点击搜索时才同步到 keyword）
  const [processDefKey, setProcessDefKey] = useState(''); // 流程类型筛选
  const [priorityFilter, setPriorityFilter] = useState(''); // 优先级筛选
  const [startTimeFrom, setStartTimeFrom] = useState(''); // 开始时间范围（起）
  const [startTimeTo, setStartTimeTo] = useState(''); // 开始时间范围（止）
  const [processDefOptions, setProcessDefOptions] = useState<{ key: string; name: string }[]>([]); // 流程定义选项
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = useCallback(async (showLoading = true) => {
    if (!user) return;
    try {
        if (showLoading) setLoading(true);
        setError(null);
        
        let processTasks: Task[] = [];
        let workTaskRes: any[] = [];

        if (type === 'applications') {
            // "我的申请"模式：服务端分页+条件查询
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
            
            // 从 PageResult 中提取数据
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
            // "任务中心"模式：支持服务端条件查询
            const todoParams: any = {};
            if (todoKeyword) todoParams.keyword = todoKeyword;
            if (todoProcessDefKey) todoParams.processDefKey = todoProcessDefKey;
            if (todoStartTimeFrom) todoParams.startTimeFrom = todoStartTimeFrom;
            if (todoStartTimeTo) todoParams.startTimeTo = todoStartTimeTo;
            if (todoStartUserName) todoParams.startUserName = todoStartUserName;

            const [todoRes, workRes] = await Promise.all([
                getTodoTasks(Object.keys(todoParams).length > 0 ? todoParams : undefined),
                getWorkTasks()
            ]);
            // 兼容 PageResult 和数组两种返回格式
            let todoList: any[] = [];
            if (todoRes && typeof todoRes === 'object' && !Array.isArray(todoRes)) {
                todoList = todoRes.records || todoRes.rows || [];
            } else if (Array.isArray(todoRes)) {
                todoList = todoRes;
            }
            processTasks = todoList.map(mapBackendTaskToFrontend);
            workTaskRes = Array.isArray(workRes) ? workRes : [];
        }

        // 过滤流程任务（仅任务中心需要前端过滤）
        const filteredProcessTasks = processTasks.filter(t => {
            if (type === 'pending') {
                return t.status === TaskStatus.PENDING && (
                    t.assigneeId === user.id ||
                    (t.assigneeRole === user.role && !t.assigneeId)
                );
            } else {
                // 我的申请：服务端已过滤，直接返回
                return true;
            }
        });
        
        setRawTasks(filteredProcessTasks);

        let unified: UnifiedTask[] = filteredProcessTasks.map(mapTaskToUnified);
        
        if (workTaskRes.length > 0) {
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
  }, [user, type, pageNum, statusFilter, keyword, processDefKey, priorityFilter, startTimeFrom, startTimeTo, todoKeyword, todoProcessDefKey, todoStartTimeFrom, todoStartTimeTo, todoStartUserName]);

  // 定时刷新（30秒）
  usePolling(
    () => fetchTasks(false),
    {
      interval: 30000,
      immediate: false,
      enabled: !!user && !loading,
      onError: (err) => logTask.error('任务列表定时刷新失败:', err),
    }
  );

  // 初始加载和依赖变化时重新请求
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 加载流程定义选项（用于流程类型筛选，任务中心和我的申请都需要）
  useEffect(() => {
    getProcessDefinitions({ latestOnly: false }).then(res => {
      if (Array.isArray(res)) {
        // 按 processKey 聚合：优先已发布版本，其次版本号更高，避免筛选项展示旧版/草稿名称
        const latestByKey = new Map<string, any>();
        for (const def of res) {
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

        const options: { key: string; name: string }[] = Array.from(latestByKey.values())
          .map((def: any) => {
            const defKey = String(def.processKey || '').trim();
            const defName = def.processName || defKey;
            return { key: defKey, name: defName };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

        if (type === 'applications') {
          setProcessDefOptions(options);
        } else {
          setTodoProcessDefOptions(options);
        }
      }
    }).catch(err => {
      console.error('Failed to fetch process definitions:', err);
      if (!hasShownProcessDefLoadWarningRef.current) {
        toast.warning('流程类型筛选加载失败，已切换为无筛选选项模式');
        hasShownProcessDefLoadWarningRef.current = true;
      }
    });
  }, [type]);

  // 加载表单定义（只需一次）
  useEffect(() => {
    if (!user || user.role !== Role.ADMIN) {
      setSavedForms([]);
      return;
    }

    getFormDefinitions().then(res => {
        if(Array.isArray(res)) {
            const mapped = res.map((f: any) => mapBackendForm(f));
            setSavedForms(mapped);
        }
    }).catch(err => {
        console.error('Failed to fetch form definitions:', err);
        if (!hasShownFormListLoadWarningRef.current) {
          toast.warning('表单定义加载失败，审批详情将回退原始业务数据展示');
          hasShownFormListLoadWarningRef.current = true;
        }
    });
  }, [user]);

  // 非管理员无法获取全量表单时，按任务中的 formId 懒加载，保证审批详情可展示动态表单
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
          .catch((err) => {
            failedCount += 1;
            logTask.warn(`按 formId 懒加载表单失败: ${id}`, err);
            return null;
          }),
      ),
    ).then((forms) => {
      if (cancelled) return;
      if (failedCount > 0 && !hasShownFormLoadWarningRef.current) {
        toast.warning('部分任务绑定表单加载失败，将显示原始业务数据');
        hasShownFormLoadWarningRef.current = true;
      }
      const loadedForms = forms.filter((item): item is FormDefinition => !!item);
      if (loadedForms.length === 0) return;

      setSavedForms((prev) => {
        const nextMap = new Map(prev.map((item) => [item.id, item] as const));
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
      fetchTasks();
      setIsModalOpen(false);
  };

  const handleRefresh = () => {
      setRefreshing(true);
      fetchTasks(false);
  };

  // 筛选条件变更时重置页码
  const handleStatusChange = (newStatus: typeof statusFilter) => {
      setStatusFilter(newStatus);
      setPageNum(1);
  };

  const handleProcessDefKeyChange = (key: string) => {
      setProcessDefKey(key);
      setPageNum(1);
  };

  const handlePriorityChange = (val: string) => {
      setPriorityFilter(val);
      setPageNum(1);
  };

  const handleTimeRangeChange = (from: string, to: string) => {
      setStartTimeFrom(from);
      setStartTimeTo(to);
      setPageNum(1);
  };

  // 清除所有筛选条件
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

  // 是否有活跃的筛选条件（我的申请）
  const hasActiveFilters = statusFilter !== 'ALL' || keyword || processDefKey || priorityFilter || startTimeFrom || startTimeTo;

  // 是否有活跃的筛选条件（任务中心）
  const hasTodoActiveFilters = todoKeyword || todoProcessDefKey || todoStartTimeFrom || todoStartTimeTo || todoStartUserName;

  // "我的申请"搜索提交
  const handleSearch = () => {
      setKeyword(searchInput);
      setPageNum(1);
  };

  // "我的申请"回车搜索
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          handleSearch();
      }
  };

  // 任务中心搜索提交
  const handleTodoSearch = () => {
      setTodoKeyword(todoSearchInput);
  };

  // 任务中心回车搜索
  const handleTodoSearchKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          handleTodoSearch();
      }
  };

  // 清除任务中心所有筛选条件
  const handleClearTodoFilters = () => {
      setTodoKeyword('');
      setTodoSearchInput('');
      setTodoProcessDefKey('');
      setTodoStartTimeFrom('');
      setTodoStartTimeTo('');
      setTodoStartUserName('');
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

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        {/* 标题栏 */}
        <div className="flex justify-between items-center shrink-0">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-4">
                {type === 'pending' ? '任务中心' : '我的申请'}
                
                {type === 'pending' && (
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-pink-500' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutList size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('board')}
                            className={`p-1.5 rounded-md transition-all ${viewMode === 'board' ? 'bg-white shadow text-pink-500' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Kanban size={18} />
                        </button>
                    </div>
                )}
            </h2>

            <div className="flex gap-2 items-center">
                {/* 任务中心的类型筛选 */}
                {type === 'pending' && (
                    <Select value={filterType} onValueChange={v => setFilterType(v as 'all' | 'process' | 'work')}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部任务</SelectItem>
                      <SelectItem value="process">流程审批</SelectItem>
                      <SelectItem value="work">协作待办</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {/* "我的申请"搜索框 */}
                {type === 'applications' && (
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="搜索标题/编号..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg pl-9 pr-3 py-2 w-56 focus:ring-pink-400 focus:border-pink-400 focus:outline-none"
                        />
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        {searchInput && searchInput !== keyword && (
                            <button
                                onClick={handleSearch}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-pink-500 hover:text-pink-600"
                            >
                                搜索
                            </button>
                        )}
                    </div>
                )}

                <button 
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    刷新
                </button>
            </div>
        </div>
        
        {/* 任务中心筛选区域 */}
        {type === 'pending' && (
            <div className="flex flex-col gap-3 shrink-0">
                {/* 第一行：搜索框 + 申请人 + 清除筛选 */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* 关键字搜索 */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="搜索流程标题/编号..."
                            value={todoSearchInput}
                            onChange={(e) => setTodoSearchInput(e.target.value)}
                            onKeyDown={handleTodoSearchKeyDown}
                            className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg pl-9 pr-3 py-1.5 w-56 focus:ring-pink-400 focus:border-pink-400 focus:outline-none"
                        />
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        {todoSearchInput && todoSearchInput !== todoKeyword && (
                            <button
                                onClick={handleTodoSearch}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-pink-500 hover:text-pink-600"
                            >
                                搜索
                            </button>
                        )}
                    </div>

                    {/* 流程类型筛选 */}
                    {todoProcessDefOptions.length > 0 && (
                        <Select value={todoProcessDefKey} onValueChange={v => setTodoProcessDefKey(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部流程类型</SelectItem>
                      {todoProcessDefOptions.map(opt => (
                        <SelectItem key={opt.key} value={String(opt.key)}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                    )}

                    {/* 申请人搜索 */}
                    <input
                        type="text"
                        placeholder="申请人姓名..."
                        value={todoStartUserName}
                        onChange={(e) => setTodoStartUserName(e.target.value)}
                        className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg px-3 py-1.5 w-32 focus:ring-pink-400 focus:border-pink-400 focus:outline-none"
                    />

                    {/* 时间范围筛选 */}
                    <div className="flex items-center gap-1.5 text-sm">
                        <Calendar size={14} className="text-slate-400" />
                        <DatePicker
                            type="date"
                            value={todoStartTimeFrom}
                            onChange={(e) => setTodoStartTimeFrom(e.target.value)}
                        />
                        <span className="text-slate-400">至</span>
                        <DatePicker
                            type="date"
                            value={todoStartTimeTo}
                            onChange={(e) => setTodoStartTimeTo(e.target.value)}
                        />
                    </div>

                    {/* 清除筛选 */}
                    {hasTodoActiveFilters && (
                        <button
                            onClick={handleClearTodoFilters}
                            className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                        >
                            <X size={12} />
                            清除筛选
                        </button>
                    )}
                </div>
            </div>
        )}

        {/* "我的申请"筛选区域 */}
        {type === 'applications' && (
            <div className="flex flex-col gap-3 shrink-0">
                {/* 第一行：状态筛选Tab + 清除筛选 */}
                <div className="flex items-center gap-3">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                        {([
                            { key: 'ALL', label: '全部', color: '' },
                            { key: 'RUNNING', label: '进行中', color: 'text-pink-500' },
                            { key: 'COMPLETED', label: '已完成', color: 'text-emerald-600' },
                            { key: 'REJECTED', label: '已拒绝', color: 'text-red-600' },
                            { key: 'REVOKED', label: '已撤回', color: 'text-amber-600' },
                        ] as const).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => handleStatusChange(tab.key)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                    statusFilter === tab.key 
                                        ? 'bg-white shadow text-slate-800' 
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {hasActiveFilters && (
                        <button
                            onClick={handleClearFilters}
                            className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                        >
                            <X size={12} />
                            清除筛选
                        </button>
                    )}
                </div>

                {/* 第二行：流程类型 + 时间范围 */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* 流程类型筛选 */}
                    {processDefOptions.length > 0 && (
                        <Select value={processDefKey} onValueChange={v => setProcessDefKey(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部流程类型</SelectItem>
                      {processDefOptions.map(opt => (
                        <SelectItem key={opt.key} value={String(opt.key)}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                    )}

                    {/* 优先级筛选 */}
                    <Select value={priorityFilter} onValueChange={v => setPriorityFilter(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部优先级</SelectItem>
                      <SelectItem value="URGENT">紧急</SelectItem>
                      <SelectItem value="HIGH">高</SelectItem>
                      <SelectItem value="NORMAL">普通</SelectItem>
                      <SelectItem value="LOW">低</SelectItem>
                    </SelectContent>
                  </Select>

                    {/* 时间范围筛选 */}
                    <div className="flex items-center gap-1.5 text-sm">
                        <Calendar size={14} className="text-slate-400" />
                        <DatePicker
                            type="date"
                            value={startTimeFrom}
                            onChange={(e) => handleTimeRangeChange(e.target.value, startTimeTo)}
                        />
                        <span className="text-slate-400">至</span>
                        <DatePicker
                            type="date"
                            value={startTimeTo}
                            onChange={(e) => handleTimeRangeChange(startTimeFrom, e.target.value)}
                        />
                    </div>
                </div>
            </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden min-h-[400px]">
            {viewMode === 'list' ? (
                 rawTasks.length === 0 && filteredUnifiedTasks.filter(t=>t.type==='WORK').length === 0 ? (
                    <EmptyTasks />
                ) : (
                    <div className="space-y-8">
                         {/* 流程任务 */}
                         {(filterType === 'all' || filterType === 'process') && rawTasks.length > 0 && (
                             <div>
                                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
                                     流程审批 ({type === 'applications' ? `${rawTasks.length} / 共${total}条` : rawTasks.length})
                                 </h3>
                                 <TaskList 
                                    tasks={rawTasks} 
                                    onTaskClick={(task) => { setSelectedTask(task); setIsModalOpen(true); }}
                                    showRecallButton={type === 'applications'}
                                    onRecallSuccess={() => fetchTasks(false)}
                                />
                             </div>
                         )}

                         {/* 协作待办 */}
                         {(filterType === 'all' || filterType === 'work') && filteredUnifiedTasks.filter(t=>t.type==='WORK').length > 0 && (
                             <div>
                                 <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 mt-6">协作待办 ({filteredUnifiedTasks.filter(t=>t.type==='WORK').length})</h3>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                     {filteredUnifiedTasks.filter(t=>t.type==='WORK').map(t => (
                                         <div key={t.id} className="bg-white border border-slate-200 p-5 rounded-xl hover:shadow-lg transition-all">
                                             <div className="flex justify-between items-start mb-2">
                                                 <h4 className="font-bold text-slate-800">{t.title}</h4>
                                                 <span className={`text-xs px-2 py-1 rounded font-medium 
                                                     ${t.status === 'DONE' ? 'bg-emerald-50 text-emerald-600' : 'bg-pink-50 text-pink-500'}`}>
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

        {/* "我的申请"分页器 */}
        {type === 'applications' && total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 shrink-0">
                <span className="text-sm text-slate-500">
                    共 {total} 条，第 {pageNum}/{totalPages} 页
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPageNum(p => Math.max(1, p - 1))}
                        disabled={pageNum <= 1}
                        className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    
                    {/* 页码按钮 */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        // 计算显示的页码范围
                        let start = Math.max(1, pageNum - 2);
                        let end = Math.min(totalPages, start + 4);
                        start = Math.max(1, end - 4);
                        const page = start + i;
                        if (page > totalPages) return null;
                        return (
                            <button
                                key={page}
                                onClick={() => setPageNum(page)}
                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                    page === pageNum
                                        ? 'bg-pink-500 text-white shadow'
                                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {page}
                            </button>
                        );
                    })}
                    
                    <button
                        onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}
                        disabled={pageNum >= totalPages}
                        className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        )}

        <TaskHandleModal 
            isOpen={isModalOpen} 
            task={selectedTask} 
            availableForms={savedForms}
            currentUser={user}
            onClose={() => setIsModalOpen(false)}
            onComplete={handleTaskUpdate}
            viewOnly={type === 'applications'}
        />
    </div>
  );
};
