import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Clock, Eye, Globe2, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  DatePicker,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import {
  deleteLoginLogs,
  getLoginLogDetail,
  getLoginLogPage,
  LoginLogQuery,
  SysLog,
} from '@/services/api/log';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type LoginLogFilters = {
  createBy: string;
  remoteAddr: string;
  logType: string;
  startTime: string;
  endTime: string;
};

const ALL_FILTER_VALUE = '__all__';

const getLoginStatusBadgeClassName = (logType: string) =>
  logType === '9'
    ? 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200'
    : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0d95b5] text-[#0d95b5] focus:ring-2 focus:ring-[#0d95b5]/30 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

const LoginDetailDialog: React.FC<{
  log: SysLog | null;
  onClose: () => void;
}> = ({ log, onClose }) => (
  <BaseDialog
    open={Boolean(log)}
    title="登录日志详情"
    onClose={onClose}
    maxWidthClassName="max-w-3xl"
    headerAside={
      log ? (
        <span
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium',
            getLoginStatusBadgeClassName(log.logType),
          )}
        >
          {log.logType === '9' ? '失败' : '成功'}
        </span>
      ) : null
    }
  >
    {log ? (
      <div className="card overflow-hidden">
        {[
          { label: '用户', value: log.createBy || '-' },
          { label: '客户端 IP', value: log.remoteAddr || '-' },
          { label: '耗时', value: `${log.time ?? 0} ms` },
          { label: '登录时间', value: log.createTime || '-' },
          { label: '浏览器 / UA', value: log.userAgent || '-' },
          { label: '请求参数', value: log.params || '-' },
          { label: '异常信息', value: log.exception || '-' },
        ].map((item) => (
          <div key={item.label} className="border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800">
            <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{item.label}</div>
            <div className="mt-2 break-all whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">{item.value}</div>
          </div>
        ))}
      </div>
    ) : null}
  </BaseDialog>
);

export const LoginLogPage: React.FC = () => {
  const [query, setQuery] = useState<LoginLogQuery>({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
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
      if (!params.logType) {
        delete params.logType;
      }

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
    setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
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
      toast.error(getErrorMessage(fetchError, '加载登录详情失败'));
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
      toast.error(getErrorMessage(deleteError, '删除登录日志失败'));
    }
  };

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

  const stats = useMemo(
    () => [
      {
        label: '日志总数',
        value: String(total),
        meta: `当前页 ${records.length}`,
        icon: <Clock size={18} />,
        tone: 'blue',
      },
      {
        label: '成功登录',
        value: String(records.filter((item) => item.logType !== '9').length),
        meta: '本页通过',
        icon: <ShieldCheck size={18} />,
        tone: 'green',
      },
      {
        label: '失败登录',
        value: String(records.filter((item) => item.logType === '9').length),
        meta: '本页异常',
        icon: <Globe2 size={18} />,
        tone: 'amber',
      },
      {
        label: '已选中',
        value: String(selectedIds.length),
        meta: '待批量处理',
        icon: <Trash2 size={18} />,
        tone: 'violet',
      },
    ],
    [records, selectedIds.length, total],
  );

  return (
    <>
      <section className="admin-source-page admin-login-log-page">
        <TablePageLayout
          actions={(
            <div className="grid gap-5">
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">LOGIN LOGS</p>
                  <h2>登录日志</h2>
                  <span>管理登录行为、客户端 IP、耗时和异常状态</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                    <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
                    刷新
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBatchDelete}
                    disabled={!selectedIds.length}
                  >
                    <Trash2 size={16} />
                    删除选中
                  </Button>
                </div>
              </header>

              <section className="admin-source-stat-grid">
                {stats.map((stat) => (
                  <article key={stat.label} className={cn('card admin-source-stat', `admin-source-tone-${stat.tone}`)}>
                    <div className="admin-source-stat-icon">{stat.icon}</div>
                    <div>
                      <p>{stat.label}</p>
                      <strong>{stat.value}</strong>
                      <span>{stat.meta}</span>
                    </div>
                  </article>
                ))}
              </section>
            </div>
          )}
          filters={(
            <section className="card admin-users-toolbar">
              <form onSubmit={handleSearch} className="admin-login-log-filter-grid">
                <label className="admin-source-search">
                  <span className="input-label">搜索用户</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      value={filters.createBy}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, createBy: event.target.value }))
                      }
                      placeholder="按用户搜索"
                      type="search"
                    />
                  </div>
                </label>

                <label>
                  <span className="input-label">客户端 IP</span>
                  <Input
                    value={filters.remoteAddr}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, remoteAddr: event.target.value }))
                    }
                    placeholder="例如 192.168.1.10"
                  />
                </label>

                <label>
                  <span className="input-label">状态</span>
                  <Select
                    value={filters.logType || ALL_FILTER_VALUE}
                    onValueChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        logType: value === ALL_FILTER_VALUE ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-[42px]">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
                      <SelectItem value="0">成功</SelectItem>
                      <SelectItem value="9">失败</SelectItem>
                    </SelectContent>
                  </Select>
                </label>

                <label>
                  <span className="input-label">开始日期</span>
                  <DatePicker
                    type="date"
                    value={filters.startTime}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, startTime: event.target.value }))
                    }
                  />
                </label>

                <label>
                  <span className="input-label">结束日期</span>
                  <DatePicker
                    type="date"
                    value={filters.endTime}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, endTime: event.target.value }))
                    }
                  />
                </label>

                <div className="admin-users-toolbar-actions">
                  <span className="admin-users-filter-count">当前 {total} 项</span>
                  <Button type="submit" size="sm">
                    查询
                  </Button>
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
          )}
          table={(
            <InnerTableSurface className="admin-login-log-table-panel">
              <table className="unity-data-table admin-source-table admin-login-log-table min-w-[1040px]">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className={checkboxClassName}
                        />
                      </th>
                      <th>用户</th>
                      <th>状态</th>
                      <th>客户端 IP</th>
                      <th>耗时</th>
                      <th>浏览器</th>
                      <th>登录时间</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow colSpan={8} title="正在加载登录日志..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={8} title="登录日志加载失败" description={error} />
                    ) : records.length === 0 ? (
                      <TableStateRow colSpan={8} title="暂无登录日志" />
                    ) : (
                      records.map((item) => (
                        <tr key={item.logId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item.logId)}
                              onChange={() => toggleSelect(item.logId)}
                              className={checkboxClassName}
                            />
                          </td>
                          <td>
                            <strong className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {item.createBy || '-'}
                            </strong>
                          </td>
                          <td>
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                                getLoginStatusBadgeClassName(item.logType),
                              )}
                            >
                              {item.logType === '9' ? '失败' : '成功'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">{item.remoteAddr || '-'}</td>
                          <td className="whitespace-nowrap">{item.time ?? 0} ms</td>
                          <td>
                            <div className="max-w-[260px] truncate text-slate-500 dark:text-slate-400" title={item.userAgent || ''}>
                              {item.userAgent || '-'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">{item.createTime || '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" title="查看详情" onClick={() => void handleView(item.logId)}>
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                className="danger"
                                title="删除日志"
                                onClick={() => setPendingDeleteIds([item.logId])}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
              </table>
            </InnerTableSurface>
          )}
          pagination={total > 0 ? (
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
          ) : null}
        />
      </section>

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
        danger
        onCancel={() => setPendingDeleteIds([])}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default LoginLogPage;
