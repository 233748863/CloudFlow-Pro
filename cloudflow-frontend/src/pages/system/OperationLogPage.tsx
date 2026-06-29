import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import {
  Activity,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  deleteSysLogs,
  getSysLogDetail,
  getSysLogPage,
  SysLog,
  SysLogQuery,
} from '@/services/api/log';
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
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
              'rounded-md px-2.5 py-1 text-xs font-medium',
              getLogTypeBadgeClassName(log.logType),
            )}
          >
            {log.logType === '0' ? '正常' : '错误'}
          </span>
        ) : null
      }
    >
      {log ? (
        <div className="admin-dialog-stack">
          <section className="card overflow-hidden">
            {items.map((item) => (
              <div
                key={item.label}
                className="border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800"
              >
                <div className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {item.label}
                </div>
                <div className="mt-2 break-all text-sm text-slate-900 dark:text-slate-100">
                  {item.value || '-'}
                </div>
              </div>
            ))}
          </section>

          {log.exception ? (
            <section className="card">
              <div className="admin-source-section-head border-b border-slate-200 p-4 dark:border-slate-800">
                <div>
                  <strong>异常信息</strong>
                </div>
              </div>
              <div className="break-all p-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                {log.exception}
              </div>
            </section>
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
      await loadData();
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

  const stats = [
    {
      label: '日志总数',
      value: String(total),
      meta: `当前页 ${records.length}`,
      icon: <Activity size={18} />,
      tone: 'blue',
    },
    {
      label: '正常操作',
      value: String(records.filter((item) => item.logType === '0').length),
      meta: '本页成功',
      icon: <ShieldCheck size={18} />,
      tone: 'green',
    },
    {
      label: '错误操作',
      value: String(records.filter((item) => item.logType !== '0').length),
      meta: '本页异常',
      icon: <ShieldAlert size={18} />,
      tone: 'amber',
    },
    {
      label: '已选中',
      value: String(selectedIds.length),
      meta: '待批量删除',
      icon: <Trash2 size={18} />,
      tone: 'violet',
    },
  ];

  return (
    <>
      <section className="admin-source-page admin-operation-log-page">
        <TablePageLayout
          actions={(
            <div className="grid gap-5">
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">OPERATION LOGS</p>
                  <h2>操作日志</h2>
                  <span>追踪请求标题、调用地址、执行耗时和异常明细</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={handleRefreshList} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
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
              <form onSubmit={handleSearch} className="admin-operation-log-filter-grid">
                <label className="admin-source-search">
                  <span className="input-label">搜索标题</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      value={filters.titleKeyword}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, titleKeyword: event.target.value }))
                      }
                      placeholder="按操作标题搜索"
                      type="search"
                    />
                  </div>
                </label>

                <label>
                  <span className="input-label">类型</span>
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
                      <SelectValue placeholder="全部类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                      <SelectItem value="0">正常</SelectItem>
                      <SelectItem value="9">错误</SelectItem>
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
            <InnerTableSurface className="admin-operation-log-table-panel">
              <table className="unity-data-table admin-source-table admin-operation-log-table min-w-[1180px]">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className={checkboxClassName}
                        />
                      </th>
                      <th className="w-14">#</th>
                      <th>类型</th>
                      <th>标题</th>
                      <th>IP 地址</th>
                      <th>请求方法</th>
                      <th>耗时</th>
                      <th>请求时间</th>
                      <th>操作人</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow colSpan={10} title="正在加载操作日志..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={10} title="操作日志加载失败" description={error} />
                    ) : records.length === 0 ? (
                      <TableStateRow colSpan={10} title="暂无操作日志" />
                    ) : (
                      records.map((log, index) => (
                        <tr key={log.logId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(log.logId)}
                              onChange={() => toggleOne(log.logId)}
                              className={checkboxClassName}
                            />
                          </td>
                          <td className="text-slate-400 dark:text-slate-500">
                            {((query.pageNum || 1) - 1) * (query.pageSize || 10) + index + 1}
                          </td>
                          <td>
                            <span
                              className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-medium',
                                getLogTypeBadgeClassName(log.logType),
                              )}
                            >
                              {log.logType === '0' ? '正常' : '错误'}
                            </span>
                          </td>
                          <td>
                            <div className="max-w-[280px]">
                              <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={log.title}>
                                {log.title}
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={log.requestUri || ''}>
                                {log.requestUri || '未记录请求地址'}
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap">{log.remoteAddr || '-'}</td>
                          <td className="whitespace-nowrap">{log.method || '-'}</td>
                          <td className="whitespace-nowrap">{log.time ? `${log.time} ms` : '-'}</td>
                          <td className="whitespace-nowrap">{log.createTime || '-'}</td>
                          <td className="whitespace-nowrap text-slate-700 dark:text-slate-200">{log.createBy || '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" title="查看详情" onClick={() => void handleViewDetail(log.logId)}>
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                className="danger"
                                title="删除日志"
                                onClick={() => setPendingDeleteIds([log.logId])}
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
