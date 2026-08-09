import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { ArrowLeftRight, Eye, FileClock, RefreshCw, RotateCcw, Search, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  AuditLogQuery,
  deleteAuditLogs,
  getAuditLogDetail,
  getAuditLogPage,
  SysAuditLog,
} from '@/services/api/log';
import { BaseDialog, ConfirmDialog, Pagination, Table, TableScrollArea } from '@/components/common';
import {
  Button,
  DatePicker,
  Input,
  LoadingSpinner,
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const checkboxClassName =
  'h-4 w-4 shrink-0 rounded border-slate-300 accent-[#0d95b5] text-[#0d95b5] focus:ring-2 focus:ring-[#0d95b5]/30 focus:ring-offset-0 dark:border-slate-700 dark:bg-slate-950';

type AuditLogFilters = {
  auditName: string;
  createBy: string;
  startTime: string;
  endTime: string;
};

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
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

const AuditDetailDialog: React.FC<{ log: SysAuditLog | null; onClose: () => void }> = ({
  log,
  onClose,
}) => (
  <BaseDialog
    open={Boolean(log)}
    title="审计详情"
    onClose={onClose}
    maxWidthClassName="max-w-4xl"
    headerAside={
      log ? (
        <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs font-medium text-cf-muted dark:border-slate-700 dark:bg-slate-900/70">
          变更字段：{log.auditField || '-'}
        </span>
      ) : null
    }
  >
    {log ? (
      <div className="admin-dialog-stack">
        <div className="card overflow-hidden">
          {[
            { label: '业务名称', value: log.auditName || '-' },
            { label: '操作人', value: log.createBy || '-' },
            { label: '操作时间', value: log.createTime || '-' },
          ].map((item) => (
            <div key={item.label} className="border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800">
              <div className="text-xs font-medium text-cf-faint">{item.label}</div>
              <div className="mt-2 text-sm text-cf-title">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
            <div className="bg-[var(--cf-surface-muted)] dark:bg-slate-900/40">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-cf-muted dark:border-slate-800">
                变更前
              </div>
              <div className="min-h-[160px] p-4 text-sm leading-7 text-cf-body">
                {log.beforeVal || <span className="italic text-cf-faint">（空）</span>}
              </div>
            </div>

            <div className="flex items-center justify-center border-x border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900/70">
              <ArrowLeftRight size={18} className="text-cf-faint" />
            </div>

            <div className="bg-[var(--cf-surface-muted)] dark:bg-slate-900/40">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-cf-muted dark:border-slate-800">
                变更后
              </div>
              <div className="min-h-[160px] p-4 text-sm leading-7 text-cf-body">
                {log.afterVal || <span className="italic text-cf-faint">（空）</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
  </BaseDialog>
);

export const AuditLogPage: React.FC = () => {
  const [query, setQuery] = useState<AuditLogQuery>({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  const [filters, setFilters] = useState<AuditLogFilters>({
    auditName: '',
    createBy: '',
    startTime: '',
    endTime: '',
  });
  const [records, setRecords] = useState<SysAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysAuditLog | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getAuditLogPage(query);
      setRecords(response.records || []);
      setTotal(response.total || 0);
      setSelectedIds([]);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载审计日志失败，请稍后重试';
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
      auditName: filters.auditName.trim() || undefined,
      createBy: filters.createBy.trim() || undefined,
      startTime: filters.startTime || undefined,
      endTime: filters.endTime || undefined,
    }));
  };

  const handleReset = () => {
    setFilters({
      auditName: '',
      createBy: '',
      startTime: '',
      endTime: '',
    });
    setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  };

  const handleRefresh = () => {
    void loadData();
  };

  const handleBatchDelete = () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的审计日志');
      return;
    }
    setPendingDeleteIds(selectedIds);
  };

  const handleViewDetail = async (id: number) => {
    try {
      const log = await getAuditLogDetail(id);
      setDetailLog(log);
    } catch (fetchError) {
      console.error(fetchError);
      toast.error(getErrorMessage(fetchError, '加载审计详情失败'));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds.length) {
      return;
    }

    try {
      await deleteAuditLogs(pendingDeleteIds);
      toast.success('删除成功');
      setPendingDeleteIds([]);
      await loadData();
    } catch (deleteError) {
      console.error(deleteError);
      toast.error(getErrorMessage(deleteError, '删除审计日志失败'));
    }
  };

  const allSelected = records.length > 0 && records.every((item) => selectedIds.includes(item.auditId));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(records.map((item) => item.auditId));
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const hasActiveFilters = Boolean(query.auditName || query.createBy || query.startTime || query.endTime);

  const stats = useMemo(
    () => [
      {
        label: '审计总数',
        value: String(total),
        meta: `当前页 ${records.length}`,
        icon: <FileClock size={18} />,
        tone: 'blue',
      },
      {
        label: '变更字段',
        value: String(records.filter((item) => item.auditField).length),
        meta: '本页记录',
        icon: <ArrowLeftRight size={18} />,
        tone: 'violet',
      },
      {
        label: '操作人',
        value: String(new Set(records.map((item) => item.createBy).filter(Boolean)).size),
        meta: '本页去重',
        icon: <UserRound size={18} />,
        tone: 'green',
      },
      {
        label: '已选中',
        value: String(selectedIds.length),
        meta: '待批量删除',
        icon: <Trash2 size={18} />,
        tone: 'amber',
      },
    ],
    [records, selectedIds.length, total],
  );

  return (
    <>
      <section className="admin-source-page admin-audit-log-page">
        <TablePageLayout
          actions={(
            <div className="grid gap-5">
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">AUDIT LOGS</p>
                  <h2>审计日志</h2>
                  <span>追踪业务字段变更、操作人和变更前后内容</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
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
                  <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
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
              <form onSubmit={handleSearch} className="admin-audit-log-filter-grid">
                <label className="admin-source-search">
                  <span className="input-label">业务名称</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      value={filters.auditName}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, auditName: event.target.value }))
                      }
                      placeholder="按业务名称搜索"
                      type="search"
                    />
                  </div>
                </label>

                <label>
                  <span className="input-label">操作人</span>
                  <Input
                    value={filters.createBy}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, createBy: event.target.value }))
                    }
                    placeholder="按操作人搜索"
                  />
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
            <InnerTableSurface className="admin-audit-log-table-panel" disableScrollWrapper>
              <TableScrollArea aria-label="审计日志表格">
                <Table
                  disableScrollWrapper
                  stickyHeader
                  pinnedColumns={{ left: 1, right: 1 }}
                  className="admin-source-table admin-audit-log-table min-w-[1080px]"
                  style={{ minWidth: 1080 }}
                >
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
                      <th>业务名称</th>
                      <th>变更字段</th>
                      <th>变更前</th>
                      <th>变更后</th>
                      <th>操作人</th>
                      <th>操作时间</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <TableStateRow colSpan={8} title="正在加载审计日志..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={8} title="审计日志加载失败" description={error} />
                    ) : records.length === 0 ? (
                      <TableStateRow colSpan={8} title="暂无审计日志" />
                    ) : (
                      records.map((item) => (
                        <tr key={item.auditId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item.auditId)}
                              onChange={() => toggleOne(item.auditId)}
                              className={checkboxClassName}
                            />
                          </td>
                          <td>
                            <strong className="text-sm font-medium text-cf-title">
                              {item.auditName || '-'}
                            </strong>
                          </td>
                          <td>{item.auditField || '-'}</td>
                          <td>
                            <div className="max-w-[220px] truncate text-cf-subtle" data-tooltip={item.beforeVal || ''}>
                              {item.beforeVal || '（空）'}
                            </div>
                          </td>
                          <td>
                            <div className="max-w-[220px] truncate text-cf-subtle" data-tooltip={item.afterVal || ''}>
                              {item.afterVal || '（空）'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">{item.createBy || '-'}</td>
                          <td className="whitespace-nowrap">{item.createTime || '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="查看详情" aria-label="查看详情" onClick={() => void handleViewDetail(item.auditId)}>
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                className="danger"
                                data-tooltip="删除日志" aria-label="删除日志"
                                onClick={() => setPendingDeleteIds([item.auditId])}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </TableScrollArea>
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

      <AuditDetailDialog log={detailLog} onClose={() => setDetailLog(null)} />

      <ConfirmDialog
        open={pendingDeleteIds.length > 0}
        title="确认删除审计日志"
        message={
          pendingDeleteIds.length > 1
            ? `确定删除选中的 ${pendingDeleteIds.length} 条审计日志吗？此操作不可恢复。`
            : '确定删除这条审计日志吗？此操作不可恢复。'
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

export default AuditLogPage;
