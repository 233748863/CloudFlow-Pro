import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Eye, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAuditLogPage,
  getAuditLogDetail,
  deleteAuditLogs,
  SysAuditLog,
  AuditLogQuery,
} from '@/services/api/log';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

type AuditLogFilters = {
  auditName: string;
  createBy: string;
  startTime: string;
  endTime: string;
};

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

const AuditDetailDialog: React.FC<{ log: SysAuditLog | null; onClose: () => void }> = ({
  log,
  onClose,
}) => (
  <BaseDialog
    open={Boolean(log)}
    title="审计详情"
    description="查看业务字段在本次操作中的变更前后值与操作人信息。"
    onClose={onClose}
    maxWidthClassName="max-w-4xl"
    headerAside={
      log ? (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
          变更字段：{log.auditField || '-'}
        </span>
      ) : null
    }
  >
    {log ? (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">业务名称</div>
            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              {log.auditName || '-'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">变更字段</div>
            <div className="mt-2 text-sm font-medium text-cyan-700 dark:text-cyan-200">
              {log.auditField || '-'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">操作人</div>
            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              {log.createBy || '-'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="text-xs text-slate-400 dark:text-slate-500">操作时间</div>
            <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              {log.createTime || '-'}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="grid grid-cols-[1fr_56px_1fr]">
            <div className="bg-rose-50 dark:bg-rose-950/20">
              <div className="border-b border-rose-100/70 px-4 py-3 text-xs font-semibold text-rose-600 dark:border-rose-900/40 dark:text-rose-200">
                变更前
              </div>
              <div className="min-h-[140px] p-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                {log.beforeVal || (
                  <span className="italic text-slate-400 dark:text-slate-500">（空）</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center border-x border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
              <ArrowLeftRight size={18} className="text-slate-400 dark:text-slate-500" />
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/20">
              <div className="border-b border-emerald-100/70 px-4 py-3 text-xs font-semibold text-emerald-600 dark:border-emerald-900/40 dark:text-emerald-200">
                变更后
              </div>
              <div className="min-h-[140px] p-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
                {log.afterVal || (
                  <span className="italic text-slate-400 dark:text-slate-500">（空）</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
  </BaseDialog>
);

export const AuditLogPage: React.FC = () => {
  const [query, setQuery] = useState<AuditLogQuery>({ pageNum: 1, pageSize: 10 });
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
    setQuery({ pageNum: 1, pageSize: 10 });
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
      toast.error('加载审计详情失败');
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
      toast.error('删除审计日志失败');
    }
  };

  const allSelected =
    records.length > 0 && records.every((item) => selectedIds.includes(item.auditId));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((item) => item.auditId));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const changedFieldCount = new Set(records.map((item) => item.auditField).filter(Boolean)).size;
  const creatorCount = new Set(records.map((item) => item.createBy).filter(Boolean)).size;
  const changedBusinessCount = new Set(records.map((item) => item.auditName).filter(Boolean)).size;
  const hasActiveFilters = Boolean(
    query.auditName || query.createBy || query.startTime || query.endTime,
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
              <div className="relative w-full sm:w-56">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.auditName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, auditName: event.target.value }))
                  }
                  placeholder="按业务名称搜索"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-44">
                <Input
                  value={filters.createBy}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, createBy: event.target.value }))
                  }
                  placeholder="按操作人搜索"
                  className="h-10"
                />
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
        }
        table={
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  审计日志
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  按源码后台列表页骨架重组，筛选、列表和前后值对比详情统一回到轻量列表页语法。
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
                  字段种类 {changedFieldCount} 个
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  业务名称 {changedBusinessCount} 个
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  操作人 {creatorCount} 人
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900/70">
                  已勾选 {selectedIds.length} 条
                </span>
              </div>
            </div>

            <Table className="min-w-[1080px]">
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
                  <TableHead>业务名称</TableHead>
                  <TableHead>变更字段</TableHead>
                  <TableHead>变更前</TableHead>
                  <TableHead>变更后</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>操作时间</TableHead>
                  <TableActionHead className="w-24">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={8} title="正在加载审计日志..." loading />
                ) : error ? (
                  <TableStateRow colSpan={8} title="审计日志加载失败" description={error} />
                ) : records.length === 0 ? (
                  <TableStateRow
                    colSpan={8}
                    title="暂无审计日志"
                    description="可以调整筛选条件，或等待新的业务变更写入审计记录。"
                  />
                ) : (
                  records.map((item) => (
                    <TableRow key={item.auditId}>
                      <TableCell className="py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.auditId)}
                          onChange={() => toggleOne(item.auditId)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </TableCell>
                      <TableCell className="py-4 font-medium text-slate-900 dark:text-slate-100">
                        {item.auditName || '-'}
                      </TableCell>
                      <TableCell className="py-4 text-slate-600 dark:text-slate-300">
                        {item.auditField || '-'}
                      </TableCell>
                      <TableCell className="py-4">
                        <div
                          className="max-w-[220px] truncate text-slate-500 dark:text-slate-400"
                          title={item.beforeVal || ''}
                        >
                          {item.beforeVal || '（空）'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div
                          className="max-w-[220px] truncate text-slate-500 dark:text-slate-400"
                          title={item.afterVal || ''}
                        >
                          {item.afterVal || '（空）'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {item.createBy || '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {item.createTime || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <RowActionButton
                            label="查看详情"
                            icon={<Eye size={15} />}
                            onClick={() => void handleViewDetail(item.auditId)}
                          />
                          <RowActionButton
                            label="删除日志"
                            icon={<Trash2 size={15} />}
                            onClick={() => setPendingDeleteIds([item.auditId])}
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
        danger={true}
        onCancel={() => setPendingDeleteIds([])}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default AuditLogPage;
