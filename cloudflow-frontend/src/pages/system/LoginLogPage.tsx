import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Lock, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  deleteLoginLogs,
  getLoginLogDetail,
  getLoginLogPage,
  type LoginLogQuery,
  type SysLog,
} from '@/services/api/log';
import { cn } from '@/utils/cn';

type LoginLogFilters = {
  createBy: string;
  remoteAddr: string;
  logType: string;
  startTime: string;
  endTime: string;
};

const getLoginStatusBadgeClassName = (logType: string) =>
  logType === '9'
    ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';

const RowActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
}> = ({ label, icon, onClick, tone = 'neutral' }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
      tone === 'danger'
        ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-300'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200',
    )}
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

const LoginDetailDialog: React.FC<{
  log: SysLog | null;
  onClose: () => void;
}> = ({ log, onClose }) => (
  <BaseDialog
    open={Boolean(log)}
    title="登录日志详情"
    description="查看该条登录日志的网络、浏览器和异常信息。"
    onClose={onClose}
    maxWidthClassName="max-w-3xl"
    headerAside={
      log ? (
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            getLoginStatusBadgeClassName(log.logType),
          )}
        >
          {log.logType === '9' ? '失败' : '成功'}
        </span>
      ) : null
    }
  >
    {log ? (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs text-slate-400 dark:text-slate-500">用户</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            {log.createBy || '-'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs text-slate-400 dark:text-slate-500">状态</div>
          <div className="mt-2">
            <span
              className={cn(
                'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                getLoginStatusBadgeClassName(log.logType),
              )}
            >
              {log.logType === '9' ? '失败' : '成功'}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs text-slate-400 dark:text-slate-500">客户端 IP</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            {log.remoteAddr || '-'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs text-slate-400 dark:text-slate-500">耗时</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            {log.time ?? 0} ms
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70 md:col-span-2">
          <div className="text-xs text-slate-400 dark:text-slate-500">浏览器 / UA</div>
          <div className="mt-2 break-all text-sm text-slate-900 dark:text-slate-100">
            {log.userAgent || '-'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70 md:col-span-2">
          <div className="text-xs text-slate-400 dark:text-slate-500">请求参数</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700 dark:text-slate-200">
            {log.params || '-'}
          </pre>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70 md:col-span-2">
          <div className="text-xs text-slate-400 dark:text-slate-500">异常信息</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700 dark:text-slate-200">
            {log.exception || '-'}
          </pre>
        </div>
      </div>
    ) : null}
  </BaseDialog>
);

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
    } catch (fetchError) {
      console.error(fetchError);
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

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();

    // 查询参数和输入态分离，避免输入过程不断触发分页请求。
    setQuery((current) => ({
      ...current,
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

  const handleRefresh = () => {
    void fetchPage();
  };

  const handleView = async (id: number) => {
    try {
      const log = await getLoginLogDetail(id);
      setDetailLog(log);
    } catch (fetchError) {
      console.error(fetchError);
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
    } catch (deleteError) {
      console.error(deleteError);
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
    setSelectedIds((current) =>
      current.includes(logId)
        ? current.filter((id) => id !== logId)
        : [...current, logId],
    );
  };

  const allSelected = records.length > 0 && records.every((item) => selectedIds.includes(item.logId));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(records.map((item) => item.logId));
  };

  const hasActiveFilters = Boolean(
    query.createBy || query.remoteAddr || query.logType || query.startTime || query.endTime,
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
              <div className="relative w-full sm:w-44">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.createBy}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, createBy: event.target.value }))
                  }
                  placeholder="按用户搜索"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-44">
                <Input
                  value={filters.remoteAddr}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, remoteAddr: event.target.value }))
                  }
                  placeholder="客户端 IP"
                  className="h-10"
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
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部状态</SelectItem>
                    <SelectItem value="0">成功</SelectItem>
                    <SelectItem value="9">失败</SelectItem>
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

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
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
        }
        table={
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  登录日志
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  按源码后台列表页骨架重组，筛选、批量删除和详情查看统一回到轻量列表页语法。
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  共 {total} 条
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  当前页 {summary.pageTotal} 条
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  成功 {summary.successCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  失败 {summary.failCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  IP {summary.ipCount} 个
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  已勾选 {selectedIds.length} 条
                </span>
              </div>
            </div>

            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>客户端 IP</TableHead>
                  <TableHead>耗时</TableHead>
                  <TableHead>浏览器</TableHead>
                  <TableHead>登录时间</TableHead>
                  <TableActionHead className="w-28">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={8} title="正在加载登录日志..." loading />
                ) : error ? (
                  <TableStateRow colSpan={8} title="登录日志加载失败" description={error} />
                ) : records.length === 0 ? (
                  <TableStateRow
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
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            getLoginStatusBadgeClassName(item.logType),
                          )}
                        >
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
                        <div
                          className="max-w-[260px] truncate text-slate-500 dark:text-slate-400"
                          title={item.userAgent || ''}
                        >
                          {item.userAgent || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {item.createTime || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <RowActionButton
                            label="查看详情"
                            icon={<Eye size={15} />}
                            onClick={() => void handleView(item.logId)}
                          />
                          <RowActionButton
                            label="删除日志"
                            icon={<Trash2 size={15} />}
                            onClick={() => setPendingDeleteIds([item.logId])}
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

      <LoginDetailDialog log={detailLog} onClose={() => setDetailLog(null)} />

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
    </>
  );
};

export default LoginLogPage;
