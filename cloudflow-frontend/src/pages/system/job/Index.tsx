import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlarmClock,
  CalendarClock,
  CircleAlert,
  Edit3,
  FileClock,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Pagination,
  PermissionGuard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  WarningConfirmDialog,
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import {
  addJob,
  deleteJobs,
  getJob,
  getJobHandlers,
  getJobList,
  JobQuery,
  JobStatus,
  JobTriggerResult,
  JobTriggerType,
  SysJob,
  SysJobHandler,
  SysJobPayload,
  toggleJob,
  triggerJob,
  updateJob,
  validateJobSchedule,
} from '@/services/api/job';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import {
  InfrastructureBadge,
  InfrastructureField,
  InfrastructurePageHeader,
  InfrastructureStats,
  InfrastructureTableStateRow,
} from '../_components/InfrastructurePrimitives';

const ALL_VALUE = '__all__';

const EMPTY_FORM: SysJobPayload = {
  jobName: '',
  jobGroup: 'DEFAULT',
  serviceName: '',
  handlerName: '',
  handlerParam: '',
  triggerType: 'CRON',
  cronExpression: '0 0 * * * *',
  intervalMs: 60000,
  status: 'ENABLED',
  concurrentFlag: 0,
  misfireStrategy: 'IGNORE',
  retryCount: 0,
  retryIntervalSec: 60,
  dispatchRetryCount: 3,
  dispatchRetryIntervalSec: 10,
  timeoutSeconds: 1800,
  lockTimeSeconds: 300,
  criticalFlag: 0,
  logSuccessFlag: 1,
  alarmOnFailFlag: 1,
  alarmReceiver: '',
  remark: '',
};

type JobFilters = {
  jobName: string;
  jobGroup: string;
  serviceName: string;
  status: '' | JobStatus;
  triggerType: '' | JobTriggerType;
};

const EMPTY_FILTERS: JobFilters = {
  jobName: '',
  jobGroup: '',
  serviceName: '',
  status: '',
  triggerType: '',
};

const normalizeJobForm = (job: SysJob): SysJobPayload => ({
  ...EMPTY_FORM,
  ...job,
  jobId: job.jobId,
  handlerParam: job.handlerParam || '',
  cronExpression: job.cronExpression || '',
  alarmReceiver: job.alarmReceiver || '',
  remark: job.remark || '',
});

const formatInterval = (value?: number) => {
  if (!value) return '-';
  if (value % 3600000 === 0) return `${value / 3600000} 小时`;
  if (value % 60000 === 0) return `${value / 60000} 分钟`;
  if (value % 1000 === 0) return `${value / 1000} 秒`;
  return `${value} 毫秒`;
};

const FlagControl: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <div className="flex min-h-[72px] items-center justify-between gap-4 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-3 dark:border-slate-800 dark:bg-slate-900/70">
    <div>
      <p className="text-sm font-medium text-cf-title">{label}</p>
      <p className="mt-1 text-xs leading-5 text-cf-subtle">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

export const JobIndexPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState<JobQuery>({ pageNum: 1, pageSize: 10 });
  const [filters, setFilters] = useState<JobFilters>(EMPTY_FILTERS);
  const [jobs, setJobs] = useState<SysJob[]>([]);
  const [handlers, setHandlers] = useState<SysJobHandler[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const editorRequest = useRef(0);
  const [editingJob, setEditingJob] = useState<SysJob | null>(null);
  const [form, setForm] = useState<SysJobPayload>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [scheduleChecking, setScheduleChecking] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<{
    valid: boolean;
    message: string;
    nextFireTimes: string[];
  } | null>(null);
  const [triggerTarget, setTriggerTarget] = useState<SysJob | null>(null);
  const [triggerParam, setTriggerParam] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<JobTriggerResult | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SysJob | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{ job: SysJob; status: JobStatus } | null>(null);

  useEffect(() => () => { editorRequest.current += 1; }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getJobList(query);
      setJobs(result.rows || []);
      setTotal(Number(result.total || 0));
    } catch (loadError) {
      const message = getErrorMessage(loadError, '定时任务加载失败');
      setError(message);
      setJobs([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadHandlers = useCallback(async () => {
    try {
      setHandlers((await getJobHandlers()) || []);
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, 'Handler 列表加载失败'));
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadHandlers();
  }, [loadHandlers]);

  const serviceOptions = useMemo(
    () => Array.from(new Set(handlers.map((item) => item.serviceName))).sort(),
    [handlers],
  );
  const offlineHandlers = useMemo(
    () => new Set(
      handlers
        .filter((item) => item.status === 'OFFLINE')
        .map((item) => `${item.serviceName}:${item.handlerName}`),
    ),
    [handlers],
  );
  const handlerOptions = useMemo(
    () =>
      handlers.filter(
        (item) => item.serviceName === form.serviceName && item.status === 'ONLINE',
      ),
    [form.serviceName, handlers],
  );
  const stats = useMemo(
    () => [
      {
        label: '任务总数',
        value: String(total),
        meta: `当前页 ${jobs.length}`,
        icon: <CalendarClock size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '运行中',
        value: String(jobs.filter((item) => item.status === 'ENABLED').length),
        meta: '本页启用',
        icon: <Activity size={18} />,
        tone: 'green' as const,
      },
      {
        label: '关键任务',
        value: String(jobs.filter((item) => item.criticalFlag === 1).length),
        meta: '需二次确认',
        icon: <CircleAlert size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '在线 Handler',
        value: String(handlers.filter((item) => item.status === 'ONLINE').length),
        meta: `已上报 ${handlers.length}`,
        icon: <AlarmClock size={18} />,
        tone: 'violet' as const,
      },
    ],
    [handlers, jobs, total],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      jobName: filters.jobName.trim() || undefined,
      jobGroup: filters.jobGroup.trim() || undefined,
      serviceName: filters.serviceName || undefined,
      status: filters.status || undefined,
      triggerType: filters.triggerType || undefined,
    }));
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    setQuery((current) => ({ pageNum: 1, pageSize: current.pageSize }));
  };

  const openCreate = () => {
    editorRequest.current += 1;
    setEditorLoading(false);
    setEditingJob(null);
    setForm({ ...EMPTY_FORM });
    setScheduleFeedback(null);
    setEditorOpen(true);
  };

  const openEdit = async (job: SysJob) => {
    if (!job.jobId) return;
    const requestId = ++editorRequest.current;
    setEditorLoading(true);
    try {
      const detail = await getJob(job.jobId);
      if (requestId !== editorRequest.current) return;
      setEditingJob(detail);
      setForm(normalizeJobForm(detail));
      setScheduleFeedback(null);
      setEditorOpen(true);
    } catch (loadError) {
      if (requestId === editorRequest.current) {
        toast.error(getErrorMessage(loadError, '任务详情加载失败'));
      }
    } finally {
      if (requestId === editorRequest.current) setEditorLoading(false);
    }
  };

  const closeEditor = () => {
    if (submitting) return;
    editorRequest.current += 1;
    setEditorLoading(false);
    setEditorOpen(false);
    setEditingJob(null);
    setScheduleFeedback(null);
  };

  const checkSchedule = async () => {
    setScheduleChecking(true);
    try {
      const result = await validateJobSchedule({
        triggerType: form.triggerType,
        cronExpression: form.triggerType === 'CRON' ? form.cronExpression?.trim() : undefined,
        intervalMs: form.triggerType === 'CRON' ? undefined : Number(form.intervalMs || 0),
      });
      setScheduleFeedback(result);
      return result.valid;
    } catch (checkError) {
      const message = getErrorMessage(checkError, '调度规则校验失败');
      setScheduleFeedback({ valid: false, message, nextFireTimes: [] });
      return false;
    } finally {
      setScheduleChecking(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.jobName.trim() || !form.serviceName || !form.handlerName) {
      toast.error('任务名称、归属服务和 Handler 必填');
      return;
    }
    if (!(await checkSchedule())) {
      toast.error('请先修正调度规则');
      return;
    }

    const payload: SysJobPayload = {
      ...form,
      jobId: editingJob?.jobId,
      jobName: form.jobName.trim(),
      jobGroup: form.jobGroup.trim() || 'DEFAULT',
      handlerParam: form.handlerParam?.trim() || undefined,
      cronExpression:
        form.triggerType === 'CRON' ? form.cronExpression?.trim() || undefined : undefined,
      intervalMs: form.triggerType === 'CRON' ? undefined : Number(form.intervalMs || 0),
      alarmReceiver: form.alarmReceiver?.trim() || undefined,
      remark: form.remark?.trim() || undefined,
      confirmCritical: editingJob?.criticalFlag === 1,
    };

    setSubmitting(true);
    try {
      if (editingJob?.jobId) {
        await updateJob(payload);
        toast.success('定时任务已更新并即时重新注册');
      } else {
        await addJob(payload);
        toast.success('定时任务已创建并即时生效');
      }
      setEditorOpen(false);
      await loadJobs();
    } catch (submitError) {
      toast.error(getErrorMessage(submitError, editingJob ? '任务更新失败' : '任务创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget?.job.jobId) return;
    try {
      await toggleJob(
        toggleTarget.job.jobId,
        toggleTarget.status,
        toggleTarget.job.criticalFlag === 1,
      );
      toast.success(toggleTarget.status === 'ENABLED' ? '任务已启用' : '任务已暂停');
      setToggleTarget(null);
      await loadJobs();
    } catch (toggleError) {
      toast.error(getErrorMessage(toggleError, '任务状态切换失败'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.jobId) return;
    try {
      await deleteJobs([deleteTarget.jobId], deleteTarget.criticalFlag === 1);
      toast.success('定时任务已删除');
      setDeleteTarget(null);
      if (jobs.length === 1 && query.pageNum > 1) {
        setQuery((current) => ({ ...current, pageNum: current.pageNum - 1 }));
      } else {
        await loadJobs();
      }
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, '任务删除失败'));
    }
  };

  const openTrigger = (job: SysJob) => {
    setTriggerTarget(job);
    setTriggerParam(job.handlerParam || '');
    setTriggerResult(null);
  };

  const handleTrigger = async () => {
    if (!triggerTarget?.jobId) return;
    setTriggering(true);
    try {
      const result = await triggerJob(triggerTarget.jobId, triggerParam.trim() || undefined);
      setTriggerResult(result);
      if (result.accepted) {
        toast.success('任务已受理');
      } else {
        toast.warning(result.reason || '任务未被执行服务受理');
      }
      await loadJobs();
    } catch (triggerError) {
      toast.error(getErrorMessage(triggerError, '手动触发失败'));
    } finally {
      setTriggering(false);
    }
  };

  const hasActiveFilters = Boolean(
    query.jobName || query.jobGroup || query.serviceName || query.status || query.triggerType,
  );

  const pageActions = (
    <div className="grid gap-5">
      <InfrastructurePageHeader
        kicker="CENTRAL JOB PLATFORM"
        title="定时任务"
        description="集中维护调度规则、执行服务、容错策略和运行状态"
      >
        <PermissionGuard permissions={['system:job:log']} hidden>
          <Button variant="outline" size="sm" onClick={() => navigate('/job/log')}>
            <FileClock size={16} />
            执行日志
          </Button>
        </PermissionGuard>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void Promise.all([loadJobs(), loadHandlers()]);
          }}
          disabled={loading}
        >
          <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          刷新
        </Button>
        <PermissionGuard permissions={['system:job:add']} hidden>
          <Button size="sm" onClick={openCreate}>
            <Plus size={16} />
            新增任务
          </Button>
        </PermissionGuard>
      </InfrastructurePageHeader>
      <InfrastructureStats items={stats} />
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-job-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">任务名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              type="search"
              value={filters.jobName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, jobName: event.target.value }))
              }
              placeholder="按任务名称搜索"
            />
          </div>
        </label>
        <label>
          <span className="input-label">任务分组</span>
          <Input
            value={filters.jobGroup}
            onChange={(event) =>
              setFilters((current) => ({ ...current, jobGroup: event.target.value }))
            }
            placeholder="例如 HR"
          />
        </label>
        <label>
          <span className="input-label">归属服务</span>
          <Select
            value={filters.serviceName || ALL_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                serviceName: value === ALL_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部服务" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部服务</SelectItem>
              {serviceOptions.map((service) => (
                <SelectItem key={service} value={service}>
                  {service}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">触发类型</span>
          <Select
            value={filters.triggerType || ALL_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                triggerType: value === ALL_VALUE ? '' : (value as JobTriggerType),
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部类型</SelectItem>
              <SelectItem value="CRON">CRON</SelectItem>
              <SelectItem value="FIXED_RATE">固定频率</SelectItem>
              <SelectItem value="FIXED_DELAY">固定延迟</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">状态</span>
          <Select
            value={filters.status || ALL_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value === ALL_VALUE ? '' : (value as JobStatus),
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
              <SelectItem value="ENABLED">启用</SelectItem>
              <SelectItem value="PAUSED">暂停</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">共 {total} 项</span>
          <Button type="submit" size="sm">查询</Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1320px]">
        <thead>
          <tr>
            <th>任务</th>
            <th>服务 / Handler</th>
            <th>调度规则</th>
            <th>容错策略</th>
            <th>最近 / 下次触发</th>
            <th>状态</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <InfrastructureTableStateRow colSpan={7} title="正在加载定时任务..." loading />
          ) : error ? (
            <InfrastructureTableStateRow colSpan={7} title="定时任务加载失败" description={error} />
          ) : jobs.length === 0 ? (
            <InfrastructureTableStateRow colSpan={7} title="暂无符合条件的定时任务" />
          ) : (
            jobs.map((job) => (
              <tr key={job.jobId}>
                <td>
                  <div className="min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-cf-title">{job.jobName}</strong>
                      {job.criticalFlag === 1 ? (
                        <InfrastructureBadge tone="warning">关键</InfrastructureBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-cf-subtle">
                      {job.jobGroup || 'DEFAULT'} · ID {job.jobId}
                    </p>
                  </div>
                </td>
                <td>
                  <div className="min-w-[210px]">
                    <span className="text-sm font-medium text-cf-title">{job.serviceName}</span>
                    <code className="mt-1 block max-w-[240px] truncate text-xs text-cf-subtle">
                      {job.handlerName}
                    </code>
                    {offlineHandlers.has(`${job.serviceName}:${job.handlerName}`) ? (
                      <div className="mt-2">
                        <InfrastructureBadge tone="danger">执行服务离线</InfrastructureBadge>
                      </div>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="min-w-[190px]">
                    <InfrastructureBadge tone="info">
                      {job.triggerType === 'CRON'
                        ? 'CRON'
                        : job.triggerType === 'FIXED_RATE'
                          ? '固定频率'
                          : '固定延迟'}
                    </InfrastructureBadge>
                    <code className="mt-2 block text-xs text-cf-body">
                      {job.triggerType === 'CRON'
                        ? job.cronExpression || '-'
                        : formatInterval(job.intervalMs)}
                    </code>
                  </div>
                </td>
                <td>
                  <div className="min-w-[150px] text-xs leading-6 text-cf-subtle">
                    <p>{job.misfireStrategy}</p>
                    <p>执行重试 {job.retryCount} 次</p>
                    <p>超时 {job.timeoutSeconds} 秒</p>
                  </div>
                </td>
                <td>
                  <div className="min-w-[176px] text-xs leading-6">
                    <p className="text-cf-subtle">上次：{job.lastFireTime || '-'}</p>
                    <p className="text-cf-body">下次：{job.nextFireTime || '-'}</p>
                  </div>
                </td>
                <td>
                  <div className="grid gap-2">
                    <InfrastructureBadge tone={job.status === 'ENABLED' ? 'success' : 'neutral'}>
                      {job.status === 'ENABLED' ? '启用' : '暂停'}
                    </InfrastructureBadge>
                    {Number(job.consecutiveFailCount || 0) > 0 ? (
                      <span className="text-xs text-rose-600 dark:text-rose-300">
                        连续失败 {job.consecutiveFailCount} 次
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="text-right">
                  <div className="admin-users-row-actions">
                    <PermissionGuard permissions={['system:job:log']} hidden>
                      <button
                        type="button"
                        data-tooltip="查看执行日志"
                        aria-label="查看执行日志"
                        onClick={() => navigate(`/job/log?jobId=${job.jobId}`)}
                      >
                        <FileClock size={15} />
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permissions={['system:job:trigger']} hidden>
                      <button
                        type="button"
                        data-tooltip="手动触发"
                        aria-label="手动触发"
                        onClick={() => openTrigger(job)}
                      >
                        <Play size={15} />
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permissions={['system:job:toggle']} hidden>
                      <button
                        type="button"
                        data-tooltip={job.status === 'ENABLED' ? '暂停任务' : '启用任务'}
                        aria-label={job.status === 'ENABLED' ? '暂停任务' : '启用任务'}
                        onClick={() =>
                          setToggleTarget({
                            job,
                            status: job.status === 'ENABLED' ? 'PAUSED' : 'ENABLED',
                          })
                        }
                      >
                        <Power size={15} />
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permissions={['system:job:edit']} hidden>
                      <button
                        type="button"
                        data-tooltip="编辑任务"
                        aria-label="编辑任务"
                        aria-busy={editorLoading}
                        disabled={editorLoading}
                        onClick={() => void openEdit(job)}
                      >
                        {editorLoading ? <RefreshCw size={15} className="animate-spin" /> : <Edit3 size={15} />}
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permissions={['system:job:remove']} hidden>
                      <button
                        type="button"
                        className="danger"
                        data-tooltip="删除任务"
                        aria-label="删除任务"
                        onClick={() => setDeleteTarget(job)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
      onPageSizeChange={(pageSize) =>
        setQuery((current) => ({ ...current, pageNum: 1, pageSize }))
      }
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-job-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={editorOpen}
        onClose={closeEditor}
        title={editingJob ? '编辑定时任务' : '新增定时任务'}
        description="保存后由 auth 集中调度器即时注册，无需重启服务。"
        width="extra-wide"
        headerAside={
          editingJob?.criticalFlag === 1 ? (
            <InfrastructureBadge tone="warning">关键任务</InfrastructureBadge>
          ) : null
        }
        bodyClassName="admin-dialog-stack"
        footer={
          <>
            <Button type="button" variant="outline" onClick={closeEditor} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" form="job-editor-form" disabled={submitting || scheduleChecking}>
              {submitting ? '保存中...' : editingJob ? '保存修改' : '创建任务'}
            </Button>
          </>
        }
      >
        <form id="job-editor-form" onSubmit={handleSubmit} className="grid gap-5">
          <section className="card p-4">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-cf-title">执行目标</h4>
              <p className="mt-1 text-xs text-cf-subtle">仅可选择已上报且在线的 Handler。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfrastructureField label="任务名称 *">
                <Input
                  data-autofocus
                  value={form.jobName}
                  maxLength={100}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, jobName: event.target.value }))
                  }
                  placeholder="例如 员工入职转正提醒"
                />
              </InfrastructureField>
              <InfrastructureField label="任务分组">
                <Input
                  value={form.jobGroup}
                  maxLength={50}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, jobGroup: event.target.value }))
                  }
                  placeholder="例如 HR"
                />
              </InfrastructureField>
              <InfrastructureField label="归属服务 *">
                <Select
                  value={form.serviceName}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      serviceName: value,
                      handlerName: handlers.some(
                        (item) =>
                          item.serviceName === value &&
                          item.handlerName === current.handlerName &&
                          item.status === 'ONLINE',
                      )
                        ? current.handlerName
                        : '',
                    }))
                  }
                  searchable
                  searchPlaceholder="搜索服务"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择服务" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceOptions.map((service) => (
                      <SelectItem key={service} value={service}>
                        {service}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InfrastructureField>
              <InfrastructureField label="Handler *">
                <Select
                  value={form.handlerName}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, handlerName: value }))
                  }
                  disabled={!form.serviceName}
                  searchable
                  searchPlaceholder="搜索 Handler"
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.serviceName ? '选择 Handler' : '请先选择服务'} />
                  </SelectTrigger>
                  <SelectContent className="min-w-[320px]">
                    {handlerOptions.map((handler) => (
                      <SelectItem
                        key={handler.handlerId}
                        value={handler.handlerName}
                        label={handler.handlerName}
                      >
                        <div>
                          <p className="font-mono text-xs">{handler.handlerName}</p>
                          <p className="mt-1 text-xs text-cf-subtle">
                            {handler.handlerDesc || '暂无说明'}
                          </p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </InfrastructureField>
              <InfrastructureField
                label="Handler 参数"
                hint="支持 JSON 或普通文本；手动触发时可临时覆盖。"
                className="md:col-span-2 xl:col-span-4"
              >
                <Textarea
                  rows={3}
                  value={form.handlerParam || ''}
                  maxLength={500}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, handlerParam: event.target.value }))
                  }
                  placeholder='例如 {"tenantId":100000}'
                />
              </InfrastructureField>
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-cf-title">调度规则</h4>
                <p className="mt-1 text-xs text-cf-subtle">
                  CRON 使用 6 位 Spring 表达式，固定调度使用毫秒间隔。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void checkSchedule()}
                disabled={scheduleChecking}
              >
                <AlarmClock size={15} className={cn(scheduleChecking && 'animate-pulse')} />
                {scheduleChecking ? '校验中...' : '校验规则'}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfrastructureField label="触发类型">
                <Select
                  value={form.triggerType}
                  onValueChange={(value) => {
                    setForm((current) => ({
                      ...current,
                      triggerType: value as JobTriggerType,
                    }));
                    setScheduleFeedback(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRON">CRON 表达式</SelectItem>
                    <SelectItem value="FIXED_RATE">固定频率</SelectItem>
                    <SelectItem value="FIXED_DELAY">固定延迟</SelectItem>
                  </SelectContent>
                </Select>
              </InfrastructureField>
              {form.triggerType === 'CRON' ? (
                <InfrastructureField label="CRON 表达式 *" className="md:col-span-1 xl:col-span-2">
                  <Input
                    value={form.cronExpression || ''}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        cronExpression: event.target.value,
                      }));
                      setScheduleFeedback(null);
                    }}
                    placeholder="0 0 * * * *"
                    className="font-mono"
                  />
                </InfrastructureField>
              ) : (
                <InfrastructureField
                  label="执行间隔（毫秒）*"
                  hint={`当前：${formatInterval(form.intervalMs)}`}
                  className="md:col-span-1 xl:col-span-2"
                >
                  <Input
                    type="number"
                    min={1}
                    value={form.intervalMs ?? ''}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        intervalMs: Number(event.target.value),
                      }));
                      setScheduleFeedback(null);
                    }}
                  />
                </InfrastructureField>
              )}
              <InfrastructureField label="错过策略">
                <Select
                  value={form.misfireStrategy}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      misfireStrategy: value as SysJobPayload['misfireStrategy'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IGNORE">跳过</SelectItem>
                    <SelectItem value="FIRE_ONCE">补跑一次</SelectItem>
                    <SelectItem value="FIRE_ALL">全部补跑</SelectItem>
                  </SelectContent>
                </Select>
              </InfrastructureField>
            </div>
            {scheduleFeedback ? (
              <div
                className={cn(
                  'mt-4 rounded-md border p-3 text-sm',
                  scheduleFeedback.valid
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
                )}
              >
                <p className="font-medium">{scheduleFeedback.message}</p>
                {scheduleFeedback.nextFireTimes.length > 0 ? (
                  <p className="mt-2 font-mono text-xs leading-6">
                    未来 5 次：{scheduleFeedback.nextFireTimes.join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="card p-4">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-cf-title">容错与运行控制</h4>
              <p className="mt-1 text-xs text-cf-subtle">
                执行重试用于业务失败，调用重试用于调度器无法连接执行服务。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfrastructureField label="执行失败重试次数">
                <Input
                  type="number"
                  min={0}
                  value={form.retryCount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, retryCount: Number(event.target.value) }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="执行重试间隔（秒）">
                <Input
                  type="number"
                  min={0}
                  value={form.retryIntervalSec}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      retryIntervalSec: Number(event.target.value),
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="调用失败重试次数">
                <Input
                  type="number"
                  min={0}
                  value={form.dispatchRetryCount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dispatchRetryCount: Number(event.target.value),
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="调用重试间隔（秒）">
                <Input
                  type="number"
                  min={0}
                  value={form.dispatchRetryIntervalSec}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dispatchRetryIntervalSec: Number(event.target.value),
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="超时阈值（秒）">
                <Input
                  type="number"
                  min={1}
                  value={form.timeoutSeconds}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      timeoutSeconds: Number(event.target.value),
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="锁持有时间（秒）">
                <Input
                  type="number"
                  min={1}
                  value={form.lockTimeSeconds}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      lockTimeSeconds: Number(event.target.value),
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="任务状态" hint={editingJob?.criticalFlag === 1 ? '关键任务请从列表启停，操作前需要再次确认。' : undefined}>
                <Select
                  value={form.status}
                  disabled={editingJob?.criticalFlag === 1}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, status: value as JobStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ENABLED">启用</SelectItem>
                    <SelectItem value="PAUSED">暂停</SelectItem>
                  </SelectContent>
                </Select>
              </InfrastructureField>
              <InfrastructureField
                label="告警接收人"
                hint="填写用户 ID，多个值用逗号分隔。"
              >
                <Input
                  value={form.alarmReceiver || ''}
                  maxLength={500}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, alarmReceiver: event.target.value }))
                  }
                  placeholder="10001,10002"
                  disabled={form.alarmOnFailFlag !== 1}
                />
              </InfrastructureField>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FlagControl
                label="允许并发"
                description="上一次未结束时仍可发起下一次执行。"
                checked={form.concurrentFlag === 1}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, concurrentFlag: checked ? 1 : 0 }))
                }
              />
              <FlagControl
                label="关键任务"
                description="删除或启停时要求二次风险确认。"
                checked={form.criticalFlag === 1}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, criticalFlag: checked ? 1 : 0 }))
                }
              />
              <FlagControl
                label="记录成功日志"
                description="高频任务可关闭，失败日志仍保留。"
                checked={form.logSuccessFlag === 1}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, logSuccessFlag: checked ? 1 : 0 }))
                }
              />
              <FlagControl
                label="失败告警"
                description="连续失败时向配置接收人发送告警。"
                checked={form.alarmOnFailFlag === 1}
                onChange={(checked) =>
                  setForm((current) => ({ ...current, alarmOnFailFlag: checked ? 1 : 0 }))
                }
              />
            </div>
            <InfrastructureField label="备注" className="mt-4">
              <Textarea
                rows={3}
                value={form.remark || ''}
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({ ...current, remark: event.target.value }))
                }
                placeholder="记录任务用途、负责人或运维注意事项"
              />
            </InfrastructureField>
          </section>
        </form>
      </BaseDialog>

      <BaseDialog
        open={Boolean(triggerTarget)}
        onClose={() => {
          if (!triggering) setTriggerTarget(null);
        }}
        title="手动触发任务"
        description={triggerTarget ? `${triggerTarget.jobName} · ${triggerTarget.handlerName}` : undefined}
        width="normal"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTriggerTarget(null)}
              disabled={triggering}
            >
              关闭
            </Button>
            <Button type="button" onClick={() => void handleTrigger()} disabled={triggering}>
              <Play size={15} />
              {triggering ? '正在触发...' : '立即触发'}
            </Button>
          </>
        }
      >
        <div className="admin-dialog-stack">
          <InfrastructureField
            label="临时 Handler 参数"
            hint="仅覆盖本次执行，不修改任务定义；留空使用任务原参数。"
          >
            <Textarea
              data-autofocus
              rows={5}
              value={triggerParam}
              onChange={(event) => {
                setTriggerParam(event.target.value);
                setTriggerResult(null);
              }}
              placeholder="可填写 JSON 或普通文本"
            />
          </InfrastructureField>
          {triggerResult ? (
            <div
              className={cn(
                'rounded-md border p-4',
                triggerResult.accepted
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/70 dark:bg-emerald-950/30'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30',
              )}
            >
              <p className="text-sm font-medium text-cf-title">
                {triggerResult.accepted ? '执行请求已受理' : '执行请求未受理'}
              </p>
              <p className="mt-2 break-all font-mono text-xs text-cf-subtle">
                执行编号：{triggerResult.executeNo || '-'}
              </p>
              {triggerResult.reason ? (
                <p className="mt-2 text-xs leading-6 text-cf-muted">{triggerResult.reason}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </BaseDialog>

      <WarningConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        title={toggleTarget?.status === 'PAUSED' ? '暂停定时任务' : '启用定时任务'}
        message={
          toggleTarget
            ? `确定${toggleTarget.status === 'PAUSED' ? '暂停' : '启用'}“${toggleTarget.job.jobName}”吗？`
            : ''
        }
        description={
          toggleTarget?.job.criticalFlag === 1
            ? '该任务标记为关键任务，状态变化可能影响核心业务。'
            : '状态保存后立即影响集中调度。'
        }
        confirmText={toggleTarget?.status === 'PAUSED' ? '确认暂停' : '确认启用'}
        requireDoubleConfirm={toggleTarget?.job.criticalFlag === 1}
        doubleConfirmText="我已确认关键任务状态变化的业务影响"
        severity={toggleTarget?.status === 'PAUSED' ? 'warning' : 'warning'}
        onConfirm={() => void handleConfirmToggle()}
      />

      <WarningConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除定时任务"
        message={deleteTarget ? `确定删除“${deleteTarget.jobName}”吗？` : ''}
        description="删除后调度器会立即注销任务，历史执行日志仍保留。"
        confirmText="确认删除"
        requireDoubleConfirm={deleteTarget?.criticalFlag === 1}
        doubleConfirmText="我已确认关键任务删除的业务影响"
        severity="danger"
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
};

export default JobIndexPage;
