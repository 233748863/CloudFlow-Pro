import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import {
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  deleteSysLogs,
  getSysLogDetail,
  getSysLogPage,
  getSysLogTrend,
  LogTrendItem,
  SysLog,
  SysLogQuery,
} from '@/services/api/log';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { cn } from '@/utils/cn';

type OperationLogFilters = {
  titleKeyword: string;
  logType: string;
  startTime: string;
  endTime: string;
};

const ALL_FILTER_VALUE = '__all__';

const getLogTypeBadgeClassName = (logType: string) =>
  logType === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-cyan-600 text-cyan-600 focus:ring-2 focus:ring-cyan-400 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const TrendChart: React.FC<{ data: LogTrendItem[] }> = ({ data }) => {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        暂无趋势数据
      </div>
    );
  }

  const width = 920;
  const height = 240;
  const padding = { top: 20, right: 28, bottom: 36, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((item) => Math.max(item.success, item.fail)), 1);
  const yStep = Math.max(1, Math.ceil(maxVal / 5));
  const yMax = yStep * 5;

  const toX = (index: number) => padding.left + (index / Math.max(data.length - 1, 1)) * chartW;
  const toY = (value: number) => padding.top + chartH - (value / yMax) * chartH;

  const linePath = (key: 'success' | 'fail') =>
    data.map((item, index) => `${index === 0 ? 'M' : 'L'}${toX(index)},${toY(item[key])}`).join(' ');

  const areaPath = (key: 'success' | 'fail') =>
    `${linePath(key)} L${toX(data.length - 1)},${toY(0)} L${toX(0)},${toY(0)} Z`;

  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-500 dark:bg-cyan-400" />
          成功
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-500" />
          失败
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/88">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[760px]">
          {Array.from({ length: 6 }, (_, index) => {
            const value = yStep * index;
            const y = toY(value);

            return (
              <g key={index}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-slate-200 dark:text-slate-800"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill="currentColor"
                  className="text-slate-400 dark:text-slate-500"
                >
                  {value}
                </text>
              </g>
            );
          })}

          <path d={areaPath('success')} fill="rgba(6,182,212,0.12)" />
          <path d={linePath('success')} fill="none" stroke="#06b6d4" strokeWidth={2.5} />

          <path d={areaPath('fail')} fill="rgba(148,163,184,0.12)" />
          <path d={linePath('fail')} fill="none" stroke="#94a3b8" strokeWidth={2.5} />

          {data.map((item, index) => (
            <g key={item.date}>
              <circle cx={toX(index)} cy={toY(item.success)} r={3} fill="#06b6d4" />
              <circle cx={toX(index)} cy={toY(item.fail)} r={3} fill="#94a3b8" />
            </g>
          ))}

          {data.map((item, index) => {
            if (index % labelStep !== 0 && index !== data.length - 1) {
              return null;
            }

            return (
              <text
                key={item.date}
                x={toX(index)}
                y={height - 8}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="text-slate-400 dark:text-slate-500"
              >
                {item.date.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const DetailDialog: React.FC<{ log: SysLog | null; onClose: () => void }> = ({
  log,
  onClose,
}) => {
  const items = log
    ? [
        { label: '请求时间', value: log.createTime },
        { label: '操作人', value: log.createBy },
        { label: '请求地址', value: log.requestUri },
        { label: 'IP 地址', value: log.remoteAddr },
        { label: '请求方法', value: log.method },
        { label: '客户端', value: log.serviceId },
        { label: '执行耗时', value: log.time ? `${log.time} ms` : '-' },
        { label: '浏览器', value: log.userAgent },
        { label: '请求参数', value: log.params },
      ]
    : [];

  return (
    <BaseDialog
      open={Boolean(log)}
      title="操作日志详情"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      headerAside={
        log ? (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium',
              getLogTypeBadgeClassName(log.logType),
            )}
          >
            {log.logType === '0' ? '正常' : '错误'}
          </span>
        ) : null
      }
    >
      {log ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
            {items.map((item) => (
              <div
                key={item.label}
                className="border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800"
              >
                <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                  {item.label}
                </div>
                <div className="mt-2 break-all text-sm text-slate-900 dark:text-slate-100">
                  {item.value || '-'}
                </div>
              </div>
            ))}
          </div>

          {log.exception ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">异常信息</div>
              <div className="mt-3 break-all text-sm leading-7 text-slate-700 dark:text-slate-200">
                {log.exception}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </BaseDialog>
  );
};

export const OperationLogPage: React.FC = () => {
  const [query, setQuery] = useState<SysLogQuery>({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  const [filters, setFilters] = useState<OperationLogFilters>({
    titleKeyword: '',
    logType: '',
    startTime: '',
    endTime: '',
  });
  const [records, setRecords] = useState<SysLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendData, setTrendData] = useState<LogTrendItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysLog | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSysLogPage(query);
      setRecords(response.records || []);
      setTotal(response.total || 0);
      setSelectedIds([]);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载操作日志失败，请稍后重试';
      setError(message);
      toast.error(message);
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const response = await getSysLogTrend();
      setTrendData(response || []);
    } catch (fetchError) {
      console.error(fetchError);
      setTrendData([]);
      toast.error(getErrorMessage(fetchError, '加载趋势数据失败'));
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadTrend();
  }, [loadTrend]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      title: filters.titleKeyword.trim() || undefined,
      logType: filters.logType || undefined,
      startTime: filters.startTime || undefined,
      endTime: filters.endTime || undefined,
    }));
  };

  const handleReset = () => {
    setFilters({
      titleKeyword: '',
      logType: '',
      startTime: '',
      endTime: '',
    });
    setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  };

  const handleRefreshList = () => {
    void loadData();
  };

  const handleRefreshTrend = () => {
    void loadTrend();
  };

  const handleBatchDelete = () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的日志');
      return;
    }
    setPendingDeleteIds(selectedIds);
  };

  const handleViewDetail = async (id: number) => {
    try {
      const log = await getSysLogDetail(id);
      setDetailLog(log);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载日志详情失败'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds.length) {
      return;
    }

    try {
      await deleteSysLogs(pendingDeleteIds);
      toast.success('删除成功');
      setPendingDeleteIds([]);
      await Promise.all([loadData(), loadTrend()]);
    } catch (deleteError) {
      console.error(deleteError);
      toast.error(getErrorMessage(deleteError, '删除日志失败'));
    }
  };

  const allSelected = records.length > 0 && records.every((item) => selectedIds.includes(item.logId));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(records.map((item) => item.logId));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const hasActiveFilters = Boolean(query.title || query.logType || query.startTime || query.endTime);

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-60">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.titleKeyword}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, titleKeyword: event.target.value }))
                  }
                  placeholder="按操作标题搜索"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.logType || ALL_FILTER_VALUE}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      logType: value === ALL_FILTER_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="9">错误</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-40">
                <Input
                  type="date"
                  value={filters.startTime}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, startTime: event.target.value }))
                  }
                  className="h-10"
                />
              </div>

              <div className="w-full sm:w-40">
                <Input
                  type="date"
                  value={filters.endTime}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, endTime: event.target.value }))
                  }
                  className="h-10"
                />
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefreshList} disabled={loading}>
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                刷新
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                disabled={!selectedIds.length}
              >
                <Trash2 size={15} />
                删除选中
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard fill>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            <section className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    近 30 天趋势
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleRefreshTrend} disabled={trendLoading}>
                    <RefreshCw size={15} className={trendLoading ? 'animate-spin' : ''} />
                    刷新趋势
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                {trendLoading ? (
                  <div className="flex items-center justify-center rounded-xl border border-slate-200 px-4 py-16 dark:border-slate-800">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <TrendChart data={trendData} />
                )}
              </div>
            </section>

            <section className="min-h-[24rem]">
              <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className={checkboxClassName}
                        />
                      </TableHead>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>IP 地址</TableHead>
                      <TableHead>请求方法</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>请求时间</TableHead>
                      <TableHead>操作人</TableHead>
                      <TableActionHead className="w-24">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableStateRow colSpan={10} title="正在加载操作日志..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={10} title="操作日志加载失败" description={error} />
                    ) : records.length === 0 ? (
                      <TableStateRow colSpan={10} title="暂无操作日志" />
                    ) : (
                      records.map((log, index) => (
                        <TableRow key={log.logId}>
                          <TableCell className="py-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(log.logId)}
                              onChange={() => toggleOne(log.logId)}
                              className={checkboxClassName}
                            />
                          </TableCell>
                          <TableCell className="py-4 text-slate-400 dark:text-slate-500">
                            {((query.pageNum || 1) - 1) * (query.pageSize || 10) + index + 1}
                          </TableCell>
                          <TableCell className="py-4">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-xs font-medium',
                                getLogTypeBadgeClassName(log.logType),
                              )}
                            >
                              {log.logType === '0' ? '正常' : '错误'}
                            </span>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="max-w-[280px]">
                              <div
                                className="truncate text-sm font-medium text-slate-900 dark:text-slate-100"
                                title={log.title}
                              >
                                {log.title}
                              </div>
                              <div
                                className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400"
                                title={log.requestUri || ''}
                              >
                                {log.requestUri || '未记录请求地址'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4 text-slate-500 dark:text-slate-400">
                            {log.remoteAddr || '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4 text-slate-500 dark:text-slate-400">
                            {log.method || '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4 text-slate-500 dark:text-slate-400">
                            {log.time ? `${log.time} ms` : '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4 text-slate-500 dark:text-slate-400">
                            {log.createTime || '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4 text-slate-700 dark:text-slate-200">
                            {log.createBy || '-'}
                          </TableCell>
                          <TableCell>
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '查看详情',
                                  icon: <Eye size={15} />,
                                  onClick: () => void handleViewDetail(log.logId),
                                  tone: 'neutral',
                                },
                                {
                                  label: '删除日志',
                                  icon: <Trash2 size={15} />,
                                  onClick: () => setPendingDeleteIds([log.logId]),
                                  tone: 'danger',
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </TableSurfaceCard>)}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={query.pageNum || 1}
              pageSize={query.pageSize || 10}
              onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
              onPageSizeChange={(pageSize) =>
                setQuery((current) => ({
                  ...current,
                  pageNum: 1,
                  pageSize,
                }))
              }
            />
          ) : null
        )}
      />

      <DetailDialog log={detailLog} onClose={() => setDetailLog(null)} />

      <ConfirmDialog
        open={pendingDeleteIds.length > 0}
        title="确认删除操作日志"
        message={
          pendingDeleteIds.length > 1
            ? `确定删除选中的 ${pendingDeleteIds.length} 条操作日志吗？此操作不可恢复。`
            : '确定删除这条操作日志吗？此操作不可恢复。'
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeleteIds([])}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default OperationLogPage;

