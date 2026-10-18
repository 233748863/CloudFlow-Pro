import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  DatePicker,
  Input,
  Pagination,
  PermissionGuard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import {
  cleanJobLogs,
  getJobLog,
  getJobLogList,
  JobExecuteStatus,
  JobLogQuery,
  SysJobLog,
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

const STATUS_LABELS: Record<JobExecuteStatus, string> = {
  RUNNING: '运行中',
  SUCCESS: '成功',
  FAILED: '失败',
  TIMEOUT: '超时',
  SKIPPED: '跳过',
  DISPATCH_FAILED: '调度失败',
};

const statusTone = (status: JobExecuteStatus) => {
  if (status === 'SUCCESS') return 'success' as const;
  if (status === 'RUNNING') return 'info' as const;
  if (status === 'SKIPPED') return 'warning' as const;
  return 'danger' as const;
};

const formatDuration = (durationMs?: number) => {
  if (durationMs === undefined || durationMs === null) return '-';
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(2)} s`;
  return `${(durationMs / 60000).toFixed(2)} min`;
};

const toBackendDateTime = (value: string) =>
  value ? `${value.replace('T', ' ')}${value.length === 16 ? ':00' : ''}` : undefined;

type LogFilters = {
  jobId: string;
  handlerName: string;
  executeStatus: '' | JobExecuteStatus;
  beginTime: string;
  endTime: string;
};

export const JobLogPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialJobId = Number(searchParams.get('jobId') || 0);
  const initialJobIdValue = Number.isSafeInteger(initialJobId) && initialJobId > 0 ? initialJobId : undefined;
  const [filters, setFilters] = useState<LogFilters>({
    jobId: initialJobIdValue ? String(initialJobIdValue) : '',
    handlerName: '',
    executeStatus: '',
    beginTime: '',
    endTime: '',
  });
  const [query, setQuery] = useState<JobLogQuery>({
    pageNum: 1,
    pageSize: 10,
    jobId: initialJobIdValue,
  });
  const [logs, setLogs] = useState<SysJobLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SysJobLog | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [cleanMode, setCleanMode] = useState<'keepDays' | 'beforeDate'>('keepDays');
  const [keepDays, setKeepDays] = useState(30);
  const [beforeDate, setBeforeDate] = useState('');
  const [cleaning, setCleaning] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getJobLogList(query);
      setLogs(result.rows || []);
      setTotal(Number(result.total || 0));
    } catch (loadError) {
      const message = getErrorMessage(loadError, '任务日志加载失败');
      setError(message);
      setLogs([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const stats = useMemo(
    () => [
      {
        label: '日志总数',
        value: String(total),
        meta: `当前页 ${logs.length}`,
        icon: <Activity size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '执行成功',
        value: String(logs.filter((item) => item.executeStatus === 'SUCCESS').length),
        meta: '本页统计',
        icon: <CheckCircle2 size={18} />,
        tone: 'green' as const,
      },
      {
        label: '执行异常',
        value: String(
          logs.filter((item) =>
            ['FAILED', 'TIMEOUT', 'DISPATCH_FAILED'].includes(item.executeStatus),
          ).length,
        ),
        meta: '本页统计',
        icon: <TriangleAlert size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '运行中',
        value: String(logs.filter((item) => item.executeStatus === 'RUNNING').length),
        meta: '等待回报',
        icon: <Clock3 size={18} />,
        tone: 'violet' as const,
      },
    ],
    [logs, total],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const jobId = Number(filters.jobId);
    if (filters.jobId && (!Number.isSafeInteger(jobId) || jobId <= 0)) {
      toast.error('任务 ID 必须为正整数');
      return;
    }
    if (filters.beginTime && filters.endTime && filters.beginTime > filters.endTime) {
      toast.error('开始时间不能晚于结束时间');
      return;
    }
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      jobId: filters.jobId ? jobId : undefined,
      handlerName: filters.handlerName.trim() || undefined,
      executeStatus: filters.executeStatus || undefined,
      beginTime: toBackendDateTime(filters.beginTime),
      endTime: toBackendDateTime(filters.endTime),
    }));
  };

  const handleReset = () => {
    setFilters({
      jobId: '',
      handlerName: '',
      executeStatus: '',
      beginTime: '',
      endTime: '',
    });
    setQuery((current) => ({ pageNum: 1, pageSize: current.pageSize }));
  };

  const openDetail = async (log: SysJobLog) => {
    setDetail(log);
    setDetailLoading(true);
    try {
      setDetail(await getJobLog(log.logId));
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, '日志详情加载失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClean = async () => {
    if (cleanMode === 'keepDays' && (!Number.isSafeInteger(keepDays) || keepDays < 1)) {
      toast.error('保留天数必须为大于 0 的整数');
      return;
    }
    if (cleanMode === 'beforeDate' && !beforeDate) {
      toast.error('请选择清理截止日期');
      return;
    }
    setCleaning(true);
    try {
      const count = await cleanJobLogs(
        cleanMode === 'keepDays' ? { keepDays } : { beforeDate },
      );
      toast.success(`已清理 ${Number(count || 0)} 条任务日志`);
      setCleanOpen(false);
      await loadLogs();
    } catch (cleanError) {
      toast.error(getErrorMessage(cleanError, '任务日志清理失败'));
    } finally {
      setCleaning(false);
    }
  };

  const hasActiveFilters = Boolean(
    query.jobId || query.handlerName || query.executeStatus || query.beginTime || query.endTime,
  );

  return (
    <>
      <section className="admin-source-page admin-job-page">
        <TablePageLayout
          actions={
            <div className="grid gap-5">
              <InfrastructurePageHeader
                kicker="JOB EXECUTION HISTORY"
                title="任务日志"
                description="追踪调度、执行、重试、回报和异常上下文"
              >
                <Button variant="outline" size="sm" onClick={() => navigate('/job')}>
                  <ArrowLeft size={16} />
                  返回任务
                </Button>
                <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}>
                  <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
                  刷新
                </Button>
                <PermissionGuard permissions={['system:job:remove']} hidden>
                  <Button variant="destructive" size="sm" onClick={() => setCleanOpen(true)}>
                    <Trash2 size={16} />
                    清理日志
                  </Button>
                </PermissionGuard>
              </InfrastructurePageHeader>
              <InfrastructureStats items={stats} />
            </div>
          }
          filters={
            <section className="card admin-users-toolbar">
              <form onSubmit={handleSearch} className="admin-job-log-filter-grid">
                <label className="admin-source-search">
                  <span className="input-label">Handler</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      type="search"
                      value={filters.handlerName}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          handlerName: event.target.value,
                        }))
                      }
                      placeholder="按 Handler 精确查询"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">任务 ID</span>
                  <Input
                    type="number"
                    min={1}
                    value={filters.jobId}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, jobId: event.target.value }))
                    }
                    placeholder="全部任务"
                  />
                </label>
                <label>
                  <span className="input-label">执行状态</span>
                  <Select
                    value={filters.executeStatus || ALL_VALUE}
                    onValueChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        executeStatus:
                          value === ALL_VALUE ? '' : (value as JobExecuteStatus),
                      }))
                    }
                  >
                    <SelectTrigger className="h-[42px]">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span className="input-label">开始时间</span>
                  <DatePicker
                    type="datetime-local"
                    value={filters.beginTime}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        beginTime: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span className="input-label">结束时间</span>
                  <DatePicker
                    type="datetime-local"
                    value={filters.endTime}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                  />
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
          }
          table={
            <InnerTableSurface>
              <table className="unity-data-table admin-source-table min-w-[1280px]">
                <thead>
                  <tr>
                    <th>任务 / 执行编号</th>
                    <th>Handler</th>
                    <th>触发方式</th>
                    <th>开始 / 结束</th>
                    <th>耗时 / 影响行数</th>
                    <th>重试</th>
                    <th>执行节点</th>
                    <th>状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <InfrastructureTableStateRow colSpan={9} title="正在加载任务日志..." loading />
                  ) : error ? (
                    <InfrastructureTableStateRow colSpan={9} title="任务日志加载失败" description={error} />
                  ) : logs.length === 0 ? (
                    <InfrastructureTableStateRow colSpan={9} title="暂无符合条件的任务日志" />
                  ) : (
                    logs.map((log) => (
                      <tr key={log.logId}>
                        <td>
                          <div className="min-w-[210px]">
                            <strong className="text-sm text-cf-title">{log.jobName}</strong>
                            <code className="mt-1 block max-w-[240px] truncate text-xs text-cf-subtle">
                              {log.executeNo}
                            </code>
                            <span className="mt-1 block text-xs text-cf-faint">
                              Job {log.jobId} · Log {log.logId}
                            </span>
                          </div>
                        </td>
                        <td>
                          <code className="inline-block max-w-[180px] truncate text-xs text-cf-body">
                            {log.handlerName}
                          </code>
                        </td>
                        <td>
                          <InfrastructureBadge tone={log.triggerType === 'MANUAL' ? 'info' : 'neutral'}>
                            {log.triggerType}
                          </InfrastructureBadge>
                          {log.triggerBy ? (
                            <span className="mt-2 block text-xs text-cf-subtle">{log.triggerBy}</span>
                          ) : null}
                        </td>
                        <td>
                          <div className="min-w-[172px] text-xs leading-6 text-cf-subtle">
                            <p>{log.startTime || '-'}</p>
                            <p>{log.endTime || '-'}</p>
                          </div>
                        </td>
                        <td>
                          <div className="text-xs leading-6">
                            <p className="text-cf-title">{formatDuration(log.durationMs)}</p>
                            <p className="text-cf-subtle">影响 {log.affectedRows ?? '-'} 行</p>
                          </div>
                        </td>
                        <td>
                          <div className="text-xs leading-6 text-cf-subtle">
                            <p>调用 {log.dispatchRetryIndex || 0}</p>
                            <p>执行 {log.retryIndex || 0}</p>
                          </div>
                        </td>
                        <td>
                          <div className="min-w-[130px] text-xs leading-6 text-cf-subtle">
                            <p>执行 {log.executorIp || '-'}</p>
                            <p>调度 {log.dispatcherIp || '-'}</p>
                          </div>
                        </td>
                        <td>
                          <InfrastructureBadge tone={statusTone(log.executeStatus)}>
                            {STATUS_LABELS[log.executeStatus] || log.executeStatus}
                          </InfrastructureBadge>
                        </td>
                        <td className="text-right">
                          <div className="admin-users-row-actions">
                            <button
                              type="button"
                              data-tooltip="查看日志详情"
                              aria-label="查看日志详情"
                              onClick={() => void openDetail(log)}
                            >
                              <Eye size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </InnerTableSurface>
          }
          pagination={
            total > 0 ? (
              <Pagination
                page={query.pageNum}
                pageSize={query.pageSize}
                total={total}
                onPageChange={(pageNum) =>
                  setQuery((current) => ({ ...current, pageNum }))
                }
                onPageSizeChange={(pageSize) =>
                  setQuery((current) => ({ ...current, pageNum: 1, pageSize }))
                }
              />
            ) : null
          }
        />
      </section>

      <BaseDialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="任务日志详情"
        description={detail ? `${detail.jobName} · ${detail.executeNo}` : undefined}
        width="wide"
        headerAside={
          detail ? (
            <InfrastructureBadge tone={statusTone(detail.executeStatus)}>
              {STATUS_LABELS[detail.executeStatus] || detail.executeStatus}
            </InfrastructureBadge>
          ) : null
        }
      >
        {detail ? (
          <div className={cn('admin-dialog-stack', detailLoading && 'opacity-70')}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['任务 ID', detail.jobId],
                ['日志 ID', detail.logId],
                ['Handler', detail.handlerName],
                ['触发方式', detail.triggerType],
                ['触发人', detail.triggerBy || '-'],
                ['执行耗时', formatDuration(detail.durationMs)],
                ['开始时间', detail.startTime || '-'],
                ['结束时间', detail.endTime || '-'],
                ['回报时间', detail.reportTime || '-'],
                ['影响行数', detail.affectedRows ?? '-'],
                ['调用重试序号', detail.dispatchRetryIndex || 0],
                ['执行重试序号', detail.retryIndex || 0],
                ['执行节点', detail.executorIp || '-'],
                ['调度节点', detail.dispatcherIp || '-'],
                ['创建时间', detail.createTime || '-'],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-3 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <p className="text-xs text-cf-faint">{label}</p>
                  <p className="mt-2 break-all text-sm text-cf-title">{String(value)}</p>
                </div>
              ))}
            </div>
            <section className="card overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <h4 className="text-sm font-semibold text-cf-title">执行结果</h4>
              </div>
              <p className="whitespace-pre-wrap break-words p-4 text-sm leading-7 text-cf-body">
                {detail.resultMsg || '无结果摘要'}
              </p>
            </section>
            {detail.exceptionStack ? (
              <section className="overflow-hidden rounded-md border border-rose-200 dark:border-rose-900/70">
                <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/70 dark:bg-rose-950/30">
                  <h4 className="text-sm font-semibold text-rose-700 dark:text-rose-200">异常堆栈</h4>
                </div>
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words bg-[var(--cf-surface-strong)] p-4 font-mono text-xs leading-6 text-cf-body dark:bg-slate-950">
                  {detail.exceptionStack}
                </pre>
              </section>
            ) : null}
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={cleanOpen}
        onClose={() => {
          if (!cleaning) setCleanOpen(false);
        }}
        title="清理任务日志"
        description="清理操作不可恢复，请先确认审计与问题排查所需的保留周期。"
        width="normal"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCleanOpen(false)}
              disabled={cleaning}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleClean()}
              disabled={cleaning}
            >
              <Trash2 size={15} />
              {cleaning ? '清理中...' : '确认清理'}
            </Button>
          </>
        }
      >
        <div className="admin-dialog-stack">
          <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-1 dark:border-slate-800 dark:bg-slate-900/70">
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-2 text-sm transition-colors duration-150',
                cleanMode === 'keepDays'
                  ? 'bg-[var(--cf-surface-strong)] font-medium text-cf-title dark:bg-slate-950'
                  : 'text-cf-muted hover:text-cf-title',
              )}
              onClick={() => setCleanMode('keepDays')}
            >
              按保留天数
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-2 text-sm transition-colors duration-150',
                cleanMode === 'beforeDate'
                  ? 'bg-[var(--cf-surface-strong)] font-medium text-cf-title dark:bg-slate-950'
                  : 'text-cf-muted hover:text-cf-title',
              )}
              onClick={() => setCleanMode('beforeDate')}
            >
              按截止日期
            </button>
          </div>
          {cleanMode === 'keepDays' ? (
            <InfrastructureField
              label="保留最近天数"
              hint="将删除早于当前时间减去该天数的日志。"
            >
              <Input
                data-autofocus
                type="number"
                min={1}
                value={keepDays}
                onChange={(event) => setKeepDays(Number(event.target.value))}
              />
            </InfrastructureField>
          ) : (
            <InfrastructureField
              label="清理截止日期"
              hint="将删除该日期 00:00:00 之前的日志。"
            >
              <DatePicker
                type="date"
                value={beforeDate}
                onChange={(event) => setBeforeDate(event.target.value)}
              />
            </InfrastructureField>
          )}
        </div>
      </BaseDialog>
    </>
  );
};

export default JobLogPage;
