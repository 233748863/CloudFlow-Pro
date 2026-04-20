import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Lock, RefreshCw, RotateCcw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteLoginLogs,
  getLoginLogDetail,
  getLoginLogPage,
  type LoginLogQuery,
  type SysLog,
} from '@/services/api/log';
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
import { TableRowActions } from '@/components/ui/table-row-actions';
import { ConfirmDialog } from '@/components/common';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
} from '@/components/workspace';
import { cn } from '@/utils/cn';

type LoginLogFilters = {
  createBy: string;
  remoteAddr: string;
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

const getLoginStatusBadgeClassName = (logType: string) =>
  logType === '9'
    ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';

const LoginDetailModal: React.FC<{ log: SysLog | null; onClose: () => void }> = ({
  log,
  onClose,
}) => {
  if (!log) return null;

  return (
    <WorkspaceDialogShell
      title="登录日志详情"
      description="查看该条登录日志的网络、浏览器和异常信息。"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      headerAside={(
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', getLoginStatusBadgeClassName(log.logType))}>
          {log.logType === '9' ? '失败' : '成功'}
        </span>
      )}
      bodyClassName="space-y-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">用户</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{log.createBy || '-'}</div>
        </div>
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">状态</div>
          <div className="mt-2">
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getLoginStatusBadgeClassName(log.logType))}>
              {log.logType === '9' ? '失败' : '成功'}
            </span>
          </div>
        </div>
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">客户端 IP</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{log.remoteAddr || '-'}</div>
        </div>
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">耗时</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{log.time ?? 0} ms</div>
        </div>
        <div className={`${detailPanelClassName} md:col-span-2`}>
          <div className="text-xs text-slate-400 dark:text-slate-500">浏览器 / UA</div>
          <div className="mt-2 break-all text-sm text-slate-900 dark:text-slate-100">{log.userAgent || '-'}</div>
        </div>
        <div className={`${detailPanelClassName} md:col-span-2`}>
          <div className="text-xs text-slate-400 dark:text-slate-500">请求参数</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700 dark:text-slate-200">{log.params || '-'}</pre>
        </div>
        <div className={`${detailPanelClassName} md:col-span-2`}>
          <div className="text-xs text-slate-400 dark:text-slate-500">异常信息</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700 dark:text-slate-200">{log.exception || '-'}</pre>
        </div>
      </div>
    </WorkspaceDialogShell>
  );
};

export const LoginLogPage: React.FC = () => {
  const [query, setQuery] = useState<LoginLogQuery>({ pageNum: 1, pageSize: 10 });
  const [filters, setFilters] = useState<LoginLogFilters>({
    createBy: '',
    remoteAddr: '',
    logType: '',
    startTime: '',
    endTime: '',
  });
  const [records, setRecords] = useState<SysLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysLog | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: LoginLogQuery = { ...query };
      if (!params.logType) delete params.logType;
      const response = await getLoginLogPage(params);
      setRecords(response.records || []);
      setTotal(response.total || 0);
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      const message = '加载登录日志失败，请稍后重试';
      setError(message);
      toast.error(message);
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const applySearch = () => {
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      createBy: filters.createBy.trim() || undefined,
      remoteAddr: filters.remoteAddr.trim() || undefined,
      logType: filters.logType || undefined,
      startTime: filters.startTime || undefined,
      endTime: filters.endTime || undefined,
    }));
  };

  const handleReset = () => {
    setFilters({
      createBy: '',
      remoteAddr: '',
      logType: '',
      startTime: '',
      endTime: '',
    });
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

  const handleRefresh = () => {
    void fetchPage();
  };

  const handleView = async (id: number) => {
    try {
      const log = await getLoginLogDetail(id);
      setDetailLog(log);
    } catch (err) {
      console.error(err);
      toast.error('加载登录详情失败');
    }
  };

  const handleBatchDelete = () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的日志');
      return;
    }
    setPendingDeleteIds(selectedIds);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds.length) {
      return;
    }
    try {
      await deleteLoginLogs(pendingDeleteIds);
      toast.success('删除成功');
      setPendingDeleteIds([]);
      await fetchPage();
    } catch (err) {
      console.error(err);
      toast.error('删除登录日志失败');
    }
  };

  const summary = useMemo(() => {
    const successCount = records.filter((item) => item.logType !== '9').length;
    const failCount = records.filter((item) => item.logType === '9').length;
    const ipCount = new Set(records.map((item) => item.remoteAddr).filter(Boolean)).size;
    return {
      successCount,
      failCount,
      ipCount,
      pageTotal: records.length,
    };
  }, [records]);

  const toggleSelect = (logId: number) => {
    setSelectedIds((prev) =>
      prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(records.map((item) => item.logId));
  };

  const currentPage = query.pageNum || 1;
  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const hasActiveFilters = Boolean(
    query.createBy || query.remoteAddr || query.logType || query.startTime || query.endTime,
  );
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentTypeLabel =
    filters.logType === '0' ? '成功' : filters.logType === '9' ? '失败' : '全部';

  const overviewItems = [
    { label: '当前页结果', value: `${summary.pageTotal} 条` },
    { label: '成功登录', value: `${summary.successCount} 条` },
    { label: '失败登录', value: `${summary.failCount} 条` },
    { label: '已勾选', value: `${selectedIds.length} 条` },
  ];

  const heroMetrics = [
    {
      label: '总记录数',
      value: `${total}`,
      hint: '当前筛选条件下的分页总量',
      icon: <Lock size={17} />,
    },
    {
      label: '当前页',
      value: `${summary.pageTotal}`,
      hint: '当前分页下已加载日志数量',
      icon: <Search size={17} />,
    },
    {
      label: '成功',
      value: `${summary.successCount}`,
      hint: '当前页内登录成功的记录',
      icon: <ShieldAlert size={17} />,
    },
    {
      label: '失败',
      value: `${summary.failCount}`,
      hint: `涉及 IP ${summary.ipCount} 个`,
      icon: <Trash2 size={17} />,
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
                <Lock size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="登录日志"
          description="登录日志页统一到工作台结构后，筛选、分页、详情和批量删除的操作成本会更低。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新列表
              </Button>
              <Button variant="destructive" size="lg" onClick={handleBatchDelete} disabled={!selectedIds.length}>
                <Trash2 size={15} />
                删除选中
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 登录工作台
            </span>
            <span className={surfaceChipClassName}>状态：{currentTypeLabel}</span>
            <span className={surfaceChipClassName}>用户：{query.createBy || '未设置'}</span>
            <span className={surfaceChipClassName}>IP：{query.remoteAddr || '未设置'}</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="登录筛选"
          title="登录工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilters={[
            { label: '全部', value: '' },
            { label: '成功', value: '0' },
            { label: '失败', value: '9' },
          ]}
          activeQuickFilter={filters.logType}
          onQuickFilterChange={handleQuickFilterChange}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>当前页成功 {summary.successCount} 条</span>
              <span className={surfaceChipClassName}>当前页失败 {summary.failCount} 条</span>
              <span className={surfaceChipClassName}>IP {summary.ipCount} 个</span>
            </div>
          )}
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
            <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_220px_auto]">
              <Input
                value={filters.createBy}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, createBy: event.target.value }))
                }
                placeholder="按用户搜索"
              />
              <Input
                value={filters.remoteAddr}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, remoteAddr: event.target.value }))
                }
                placeholder="按客户端 IP 搜索"
              />
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
          title="当前登录记录"
          description="登录状态、IP、UA 和详情查看统一收口到同一工作台页面。"
          footer={(
            <WorkspacePaginationBar
              total={total}
              pageNum={currentPage}
              totalPages={totalPages}
              onPrev={() =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: Math.max((prev.pageNum || 1) - 1, 1),
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
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">登录结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前页 {summary.pageTotal} 条</span>
                      <span className={surfaceChipClassName}>成功 {summary.successCount} 条</span>
                      <span className={surfaceChipClassName}>失败 {summary.failCount} 条</span>
                      <span className={surfaceChipClassName}>已勾选 {selectedIds.length} 条</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      登录状态、IP、UA 和批量治理全部收口在同一层里，避免登录日志页继续保留旧后台工具条式布局。
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

            <Table className="min-w-[1040px]">
              <TableHeader>
                <tr>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={records.length > 0 && selectedIds.length === records.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </TableHead>
                  <TableHead>用户</TableHead>
                  <TableActionHead>状态</TableActionHead>
                  <TableHead>客户端 IP</TableHead>
                  <TableActionHead>耗时</TableActionHead>
                  <TableHead>浏览器</TableHead>
                  <TableHead>登录时间</TableHead>
                  <TableActionHead className="w-40">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载登录日志..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={8}
                    title="登录日志加载失败"
                    description={error}
                  />
                ) : !records.length ? (
                  <WorkspaceTableStateRow
                    colSpan={8}
                    title="暂无登录日志"
                    description="可以调整筛选条件，或等待新的登录行为写入日志。"
                  />
                ) : (
                  records.map((item) => (
                    <TableRow key={item.logId}>
                      <TableCell className="py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.logId)}
                          onChange={() => toggleSelect(item.logId)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </TableCell>
                      <TableCell className="py-4 font-medium text-slate-900 dark:text-slate-100">
                        {item.createBy || '-'}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', getLoginStatusBadgeClassName(item.logType))}>
                          {item.logType === '9' ? '失败' : '成功'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {item.remoteAddr || '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {item.time ?? 0} ms
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="max-w-[260px] truncate text-slate-500 dark:text-slate-400" title={item.userAgent || ''}>
                          {item.userAgent || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {item.createTime || '-'}
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
                              onClick: () => void handleView(item.logId),
                              tone: 'info',
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={14} />,
                              onClick: () => setPendingDeleteIds([item.logId]),
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

        <LoginDetailModal log={detailLog} onClose={() => setDetailLog(null)} />

        <ConfirmDialog
          open={pendingDeleteIds.length > 0}
          title="确认删除登录日志"
          message={
            pendingDeleteIds.length > 1
              ? `确定删除选中的 ${pendingDeleteIds.length} 条登录日志吗？此操作不可恢复。`
              : '确定删除这条登录日志吗？此操作不可恢复。'
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

export default LoginLogPage;
