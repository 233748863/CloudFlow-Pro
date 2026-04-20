import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getSysLogPage,
  getSysLogTrend,
  getSysLogDetail,
  deleteSysLogs,
  SysLog,
  SysLogQuery,
  LogTrendItem,
} from '@/services/api/log';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { cn } from '@/utils/cn';

type OperationLogFilters = {
  titleKeyword: string;
  logType: string;
  startTime: string;
  endTime: string;
};

const getLogTypeBadgeClassName = (logType: string) =>
  logType === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const RowActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
}> = ({ label, icon, onClick, tone = 'neutral' }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
      tone === 'danger'
        ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200',
    ].join(' ')}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);

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
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        暂无趋势数据
      </div>
    );
  }

  const width = 900;
  const height = 220;
  const padding = { top: 20, right: 40, bottom: 32, left: 44 };
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

  const xLabels = data.filter(
    (_, index) =>
      index % Math.ceil(data.length / 10) === 0 || index === data.length - 1,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-sky-400 dark:bg-sky-300" />
          成功
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-400 dark:bg-slate-500" />
          失败
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
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
                  x={padding.left - 6}
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

          <path d={areaPath('success')} fill="rgba(56,189,248,0.16)" />
          <path d={linePath('success')} fill="none" stroke="#38bdf8" strokeWidth={2} />

          <path d={areaPath('fail')} fill="rgba(148,163,184,0.16)" />
          <path d={linePath('fail')} fill="none" stroke="#94a3b8" strokeWidth={2} />

          {xLabels.map((item) => {
            const index = data.indexOf(item);
            return (
              <text
                key={item.date}
                x={toX(index)}
                y={height - 6}
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

const TrendDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  data: LogTrendItem[];
  loading: boolean;
  onRefresh: () => void;
}> = ({ open, onClose, data, loading, onRefresh }) => {
  const trendSuccess = data.reduce((sum, item) => sum + item.success, 0);
  const trendFail = data.reduce((sum, item) => sum + item.fail, 0);

  return (
    <BaseDialog
      open={open}
      title="近 30 天操作趋势"
      description="保留趋势能力，但不再占用标准列表页主骨架。"
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      footer={
        <div className="flex justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950">
              成功 {trendSuccess}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-700 dark:bg-slate-950">
              失败 {trendFail}
            </span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              刷新趋势
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <TrendChart data={data} />
      )}
    </BaseDialog>
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
      description="查看该条操作日志的技术参数、请求信息与异常内容。"
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
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70"
              >
                <div className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {item.label}
                </div>
                <div className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">
                  {item.value || '-'}
                </div>
              </div>
            ))}
          </div>

          {log.logType === '9' && log.exception ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/30">
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-200">
                异常信息
              </div>
              <div className="mt-3 break-all text-sm leading-7 text-rose-700 dark:text-rose-100">
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
  const [query, setQuery] = useState<SysLogQuery>({ pageNum: 1, pageSize: 10 });
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
  const [trendOpen, setTrendOpen] = useState(false);
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
    setQuery({ pageNum: 1, pageSize: 10 });
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
      toast.error('加载日志详情失败');
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
      toast.error('删除日志失败');
    }
  };

  const allSelected =
    records.length > 0 && records.every((item) => selectedIds.includes(item.logId));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((item) => item.logId));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const successCount = records.filter((item) => item.logType === '0').length;
  const errorCount = records.filter((item) => item.logType === '9').length;
  const totalTime = records.reduce((sum, item) => sum + Number(item.time || 0), 0);
  const averageTime = records.length ? Math.round(totalTime / records.length) : 0;
  const trendSuccess = trendData.reduce((sum, item) => sum + item.success, 0);
  const trendFail = trendData.reduce((sum, item) => sum + item.fail, 0);
  const hasActiveFilters = Boolean(
    query.title || query.logType || query.startTime || query.endTime,
  );

  return (
    <>
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form
              onSubmit={handleSearch}
              className="flex flex-1 flex-wrap items-center gap-3"
            >
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
                  value={filters.logType}
                  onValueChange={(value) =>
                    setFilters((current) => ({ ...current, logType: value }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部类型</SelectItem>
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
              <Button variant="outline" size="sm" onClick={() => setTrendOpen(true)}>
                <Activity size={15} />
                查看趋势
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
        }
        table={
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  操作日志
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  按源码后台列表页骨架重组，趋势功能保留为轻量入口，主页面只保留筛选、列表、分页和详情。
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  共 {total} 条
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  当前页 {records.length} 条
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  正常 {successCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  错误 {errorCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  平均耗时 {averageTime} ms
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  30 天成功 {trendSuccess}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  30 天失败 {trendFail}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  已勾选 {selectedIds.length} 条
                </span>
              </div>
            </div>

            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
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
                  <TableStateRow
                    colSpan={10}
                    title="暂无操作日志"
                    description="可以调整筛选条件，或等待新的业务操作写入日志。"
                  />
                ) : (
                  records.map((log, index) => (
                    <TableRow key={log.logId}>
                      <TableCell className="py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(log.logId)}
                          onChange={() => toggleOne(log.logId)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
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
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {log.remoteAddr || '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {log.method || '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {log.time ? `${log.time} ms` : '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {log.createTime || '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {log.createBy || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <RowActionButton
                            label="查看详情"
                            icon={<Eye size={15} />}
                            onClick={() => void handleViewDetail(log.logId)}
                          />
                          <RowActionButton
                            label="删除日志"
                            icon={<Trash2 size={15} />}
                            onClick={() => setPendingDeleteIds([log.logId])}
                            tone="danger"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        }
        pagination={
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
        }
      />

      <TrendDialog
        open={trendOpen}
        onClose={() => setTrendOpen(false)}
        data={trendData}
        loading={trendLoading}
        onRefresh={handleRefreshTrend}
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
        danger={true}
        onCancel={() => setPendingDeleteIds([])}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default OperationLogPage;
