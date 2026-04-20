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
import {
  Button,
  Input,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
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
import { TableRowActions } from '@/components/ui/table-row-actions';
import { ConfirmDialog } from '@/components/common';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
import { cn } from '@/utils/cn';

type OperationLogFilters = {
  titleKeyword: string;
  logType: string;
  startTime: string;
  endTime: string;
};

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';
const subtlePanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';
const detailPanelClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getLogTypeBadgeClassName = (logType: string) =>
  logType === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const TrendChart: React.FC<{ data: LogTrendItem[] }> = ({ data }) => {
  if (!data.length) return null;

  const width = 900;
  const height = 220;
  const padding = { top: 20, right: 40, bottom: 32, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((item) => Math.max(item.success, item.fail)), 1);
  const yStep = Math.max(1, Math.ceil(maxVal / 5));
  const yMax = yStep * 5;

  const toX = (i: number) => padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => padding.top + chartH - (v / yMax) * chartH;

  const linePath = (key: 'success' | 'fail') =>
    data.map((item, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(item[key])}`).join(' ');

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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/78">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[760px]">
          {Array.from({ length: 6 }, (_, i) => {
            const val = yStep * i;
            const y = toY(val);
            return (
              <g key={i}>
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
                  {val}
                </text>
              </g>
            );
          })}

          <path d={areaPath('success')} fill="rgba(56,189,248,0.16)" />
          <path d={linePath('success')} fill="none" stroke="#38bdf8" strokeWidth={2} />

          <path d={areaPath('fail')} fill="rgba(148,163,184,0.16)" />
          <path d={linePath('fail')} fill="none" stroke="#94a3b8" strokeWidth={2} />

          {xLabels.map((item) => {
            const i = data.indexOf(item);
            return (
              <text
                key={item.date}
                x={toX(i)}
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

const DetailModal: React.FC<{ log: SysLog | null; onClose: () => void }> = ({
  log,
  onClose,
}) => {
  if (!log) return null;

  const items = [
    { label: '请求时间', value: log.createTime },
    { label: '操作人', value: log.createBy },
    { label: '请求地址', value: log.requestUri },
    { label: 'IP 地址', value: log.remoteAddr },
    { label: '请求方法', value: log.method },
    { label: '客户端', value: log.serviceId },
    { label: '执行耗时', value: log.time ? `${log.time} ms` : '-' },
    { label: '浏览器', value: log.userAgent },
    { label: '请求参数', value: log.params },
  ];

  return (
    <WorkspaceDialogShell
      title="操作日志详情"
      description="查看该条操作日志的技术参数、请求信息与异常内容。"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      headerAside={(
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getLogTypeBadgeClassName(log.logType))}>
          {log.logType === '0' ? '正常' : '错误'}
        </span>
      )}
      bodyClassName="space-y-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className={detailPanelClassName}>
            <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{item.label}</div>
            <div className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">
              {item.value || '-'}
            </div>
          </div>
        ))}
      </div>

      {log.logType === '9' && log.exception ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/30">
          <div className="text-sm font-semibold text-rose-600 dark:text-rose-200">异常信息</div>
          <div className="mt-3 break-all text-sm leading-7 text-rose-700 dark:text-rose-100">
            {log.exception}
          </div>
        </div>
      ) : null}
    </WorkspaceDialogShell>
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
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
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

  const applySearch = () => {
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      title: filters.titleKeyword.trim() || undefined,
      logType: filters.logType || undefined,
      startTime: filters.startTime || undefined,
      endTime: filters.endTime || undefined,
    }));
  };

  const handleReset = () => {
    const nextFilters = {
      titleKeyword: '',
      logType: '',
      startTime: '',
      endTime: '',
    };
    setFilters(nextFilters);
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const handleQuickFilterChange = (value: string) => {
    setFilters((prev) => ({ ...prev, logType: value }));
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      logType: value || undefined,
    }));
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
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentPage = query.pageNum || 1;
  const successCount = records.filter((item) => item.logType === '0').length;
  const errorCount = records.filter((item) => item.logType === '9').length;
  const totalTime = records.reduce((sum, item) => sum + Number(item.time || 0), 0);
  const averageTime = records.length ? Math.round(totalTime / records.length) : 0;
  const trendSuccess = trendData.reduce((sum, item) => sum + item.success, 0);
  const trendFail = trendData.reduce((sum, item) => sum + item.fail, 0);
  const hasActiveFilters = Boolean(
    query.title || query.logType || query.startTime || query.endTime,
  );
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentTypeLabel =
    filters.logType === '0' ? '正常' : filters.logType === '9' ? '错误' : '全部';

  const overviewItems = [
    { label: '当前结果', value: `${records.length} 条` },
    { label: '正常日志', value: `${successCount} 条` },
    { label: '错误日志', value: `${errorCount} 条` },
    { label: '已勾选', value: `${selectedIds.length} 条` },
  ];

  const heroMetrics = [
    {
      label: '30天成功',
      value: `${trendSuccess}`,
      hint: '趋势周期内的成功请求总数',
      icon: <Activity size={17} />,
    },
    {
      label: '30天失败',
      value: `${trendFail}`,
      hint: '趋势周期内的失败请求总数',
      icon: <TriangleAlert size={17} />,
    },
    {
      label: '当前页日志',
      value: `${records.length}`,
      hint: '当前分页下实际加载数量',
      icon: <Search size={17} />,
    },
    {
      label: '平均耗时',
      value: `${averageTime} ms`,
      hint: '当前页执行耗时均值',
      icon: <RefreshCw size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Activity size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="操作日志"
          description="把趋势图、筛选、批量操作和详情查看统一收口到同一套工作台结构中，避免日志页与业务页完全割裂。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefreshList} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新列表
              </Button>
              <Button variant="outline" size="lg" onClick={handleRefreshTrend} disabled={trendLoading}>
                <RefreshCw size={15} className={cn(trendLoading && 'animate-spin')} />
                刷新趋势
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 日志工作台
            </span>
            <span className={surfaceChipClassName}>当前类型：{currentTypeLabel}</span>
            <span className={surfaceChipClassName}>关键词：{query.title || '未设置'}</span>
            <span className={surfaceChipClassName}>已勾选 {selectedIds.length} 条</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceSectionCard
          eyebrow="趋势概览"
          title="近 30 天操作趋势"
          description="趋势图和当前筛选区分开维护，避免日志页把统计层和治理层挤在同一块里。"
          headerAside={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>成功 {trendSuccess} 条</span>
              <span className={surfaceChipClassName}>失败 {trendFail} 条</span>
            </div>
          )}
        >
          {trendLoading ? (
            <WorkspaceInlineState type="loading" title="正在加载趋势图..." className="py-12" />
          ) : trendData.length === 0 ? (
            <WorkspaceInlineState
              type="info"
              icon={<Activity size={22} className="text-cyan-600 dark:text-cyan-300" />}
              title="暂无趋势数据"
              description="后续新的操作日志写入后，这里会展示近 30 天的成功/失败走势。"
            />
          ) : (
            <TrendChart data={trendData} />
          )}
        </WorkspaceSectionCard>

        <WorkspaceWorkbenchCard
          eyebrow="日志筛选"
          title="日志工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>支持批量删除与详情查看</span>
              <span className={surfaceChipClassName}>当前页耗时 {totalTime} ms</span>
            </div>
          )}
          quickFilters={[
            { label: '全部', value: '' },
            { label: '正常', value: '0' },
            { label: '错误', value: '9' },
          ]}
          activeQuickFilter={filters.logType}
          onQuickFilterChange={handleQuickFilterChange}
          quickFilterAside={(
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置条件
                </Button>
              ) : (
                <span className={surfaceChipClassName}>当前显示默认视图</span>
              )}
            </div>
          )}
          filterBar={(
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                <Input
                  value={filters.titleKeyword}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, titleKeyword: event.target.value }))
                  }
                  placeholder="按操作标题搜索"
                  className="pl-10"
                />
              </div>
              <Input
                type="date"
                className="h-11 rounded-2xl"
                value={filters.startTime}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, startTime: event.target.value }))
                }
              />
              <Input
                type="date"
                className="h-11 rounded-2xl"
                value={filters.endTime}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, endTime: event.target.value }))
                }
              />
              <Button type="button" onClick={applySearch}>
                <Search size={15} />
                查询日志
              </Button>
            </div>
          )}
        />

        <WorkspaceResultCard
          total={total}
          title="当前日志"
          description="趋势、筛选、批量操作和详情查看全部统一到工作台页面结构中。"
          footer={(
            <WorkspacePaginationBar
              total={total}
              pageNum={currentPage}
              totalPages={totalPages}
              onPrev={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.max(1, (prev.pageNum || 1) - 1),
                }))
              }
              onNext={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.min(totalPages, (prev.pageNum || 1) + 1),
                }))
              }
              prevDisabled={currentPage <= 1}
              nextDisabled={currentPage >= totalPages}
            />
          )}
        >
          <div className="space-y-4 px-4 py-4">
            {!loading && !error && records.length > 0 ? (
              <div className={subtlePanelClassName}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">日志结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前页 {records.length} 条</span>
                      <span className={surfaceChipClassName}>正常 {successCount} 条</span>
                      <span className={surfaceChipClassName}>错误 {errorCount} 条</span>
                      <span className={surfaceChipClassName}>已勾选 {selectedIds.length} 条</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      批量治理和详情查看都在这一层完成，避免日志页再出现传统后台那种散乱工具条和孤立详情弹窗。
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBatchDelete}
                      disabled={!selectedIds.length}
                    >
                      <Trash2 size={14} />
                      删除选中
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <Table className="min-w-[1220px]">
              <TableHeader>
                <tr>
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
                  <TableHead className="w-28">操作人</TableHead>
                  <TableActionHead className="w-44">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={10} type="loading" title="正在加载操作日志..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={10}
                    title="操作日志加载失败"
                    description={error}
                  />
                ) : records.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={10}
                    title="暂无操作日志"
                    description="可以调整筛选条件，或等待新的业务操作写入日志。"
                  />
                ) : (
                  records.map((log, idx) => (
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
                        {((query.pageNum || 1) - 1) * (query.pageSize || 10) + idx + 1}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getLogTypeBadgeClassName(log.logType))}>
                          {log.logType === '0' ? '正常' : '错误'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="max-w-[280px]">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={log.title}>
                            {log.title}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={log.requestUri || ''}>
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
                      <TableCell className="py-4 whitespace-nowrap text-right">
                        <TableRowActions
                          align="end"
                          wrap={false}
                          className="whitespace-nowrap"
                          actions={[
                            {
                              label: '详情',
                              icon: <Eye size={14} />,
                              onClick: () => void handleViewDetail(log.logId),
                              tone: 'info',
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={14} />,
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
        </WorkspaceResultCard>

        <DetailModal log={detailLog} onClose={() => setDetailLog(null)} />

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
      </WorkspacePageContent>
    </div>
  );
};

export default OperationLogPage;
