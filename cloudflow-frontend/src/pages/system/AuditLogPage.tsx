import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAuditLogPage,
  getAuditLogDetail,
  deleteAuditLogs,
  SysAuditLog,
  AuditLogQuery,
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

type AuditLogFilters = {
  auditName: string;
  createBy: string;
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

const AuditDetailModal: React.FC<{ log: SysAuditLog | null; onClose: () => void }> = ({
  log,
  onClose,
}) => {
  if (!log) return null;

  return (
    <WorkspaceDialogShell
      title="审计详情"
      description="查看业务字段在本次操作中的变更前后值与操作人信息。"
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      headerAside={(
        <span className={surfaceChipClassName}>
          变更字段：{log.auditField || '-'}
        </span>
      )}
      bodyClassName="space-y-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">业务名称</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{log.auditName || '-'}</div>
        </div>
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">变更字段</div>
          <div className="mt-2 text-sm font-medium text-cyan-700 dark:text-cyan-200">{log.auditField || '-'}</div>
        </div>
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">操作人</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{log.createBy || '-'}</div>
        </div>
        <div className={detailPanelClassName}>
          <div className="text-xs text-slate-400 dark:text-slate-500">操作时间</div>
          <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{log.createTime || '-'}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/78">
        <div className="grid grid-cols-[1fr_56px_1fr]">
          <div className="bg-rose-50 dark:bg-rose-950/20">
            <div className="border-b border-rose-100/70 px-4 py-3 text-xs font-semibold text-rose-600 dark:border-rose-900/40 dark:text-rose-200">
              变更前
            </div>
            <div className="min-h-[140px] p-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
              {log.beforeVal || <span className="italic text-slate-400 dark:text-slate-500">（空）</span>}
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
              {log.afterVal || <span className="italic text-slate-400 dark:text-slate-500">（空）</span>}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceDialogShell>
  );
};

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
    } catch (err) {
      console.error(err);
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

  const applySearch = () => {
    setQuery((prev) => ({
      ...prev,
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
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentPage = query.pageNum || 1;
  const changedFieldCount = new Set(records.map((item) => item.auditField).filter(Boolean)).size;
  const creatorCount = new Set(records.map((item) => item.createBy).filter(Boolean)).size;
  const changedBusinessCount = new Set(records.map((item) => item.auditName).filter(Boolean)).size;
  const hasActiveFilters = Boolean(
    query.auditName || query.createBy || query.startTime || query.endTime,
  );
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overviewItems = [
    { label: '当前结果', value: `${records.length} 条` },
    { label: '变更字段', value: `${changedFieldCount} 个` },
    { label: '业务名称', value: `${changedBusinessCount} 个` },
    { label: '已勾选', value: `${selectedIds.length} 条` },
  ];

  const heroMetrics = [
    {
      label: '总记录数',
      value: `${total}`,
      hint: '当前筛选条件下的分页总量',
      icon: <ShieldCheck size={17} />,
    },
    {
      label: '当前页',
      value: `${records.length}`,
      hint: '当前分页下已加载的审计记录',
      icon: <Search size={17} />,
    },
    {
      label: '字段种类',
      value: `${changedFieldCount}`,
      hint: '当前页内涉及的不同变更字段数',
      icon: <ArrowLeftRight size={17} />,
    },
    {
      label: '操作人',
      value: `${creatorCount}`,
      hint: '当前页内参与操作的人数',
      icon: <Eye size={17} />,
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
                <ArrowLeftRight size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {timeLabel}
              </span>
            </div>
          )}
          title="审计日志"
          description="审计页的核心是变更前后对比，所以这次统一的重点是让筛选、列表和对比详情保持同一套层级关系。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新列表
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
              System 审计工作台
            </span>
            <span className={surfaceChipClassName}>业务名称：{query.auditName || '未设置'}</span>
            <span className={surfaceChipClassName}>操作人：{query.createBy || '未设置'}</span>
            <span className={surfaceChipClassName}>已勾选 {selectedIds.length} 条</span>
          </div>
        </WorkspaceHeroMetricsSection>

        <WorkspaceWorkbenchCard
          eyebrow="审计筛选"
          title="审计工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          headerBadges={(
            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>业务名称 {changedBusinessCount} 个</span>
              <span className={surfaceChipClassName}>字段种类 {changedFieldCount} 个</span>
              <span className={surfaceChipClassName}>操作人 {creatorCount} 人</span>
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
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_220px_auto]">
              <Input
                value={filters.auditName}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, auditName: event.target.value }))
                }
                placeholder="按业务名称搜索"
              />
              <Input
                value={filters.createBy}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, createBy: event.target.value }))
                }
                placeholder="按操作人搜索"
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
                查询审计
              </Button>
            </div>
          )}
        />

        <WorkspaceResultCard
          total={total}
          title="当前审计记录"
          description="业务名称、变更字段、前后值和操作记录统一收纳到同一工作台表格里。"
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
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">审计结果概况</div>
                    <div className="flex flex-wrap gap-2">
                      <span className={surfaceChipClassName}>当前页 {records.length} 条</span>
                      <span className={surfaceChipClassName}>业务名称 {changedBusinessCount} 个</span>
                      <span className={surfaceChipClassName}>字段种类 {changedFieldCount} 个</span>
                      <span className={surfaceChipClassName}>已勾选 {selectedIds.length} 条</span>
                    </div>
                    <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                      前后值对比、批量删除和详情查看全部收口在同一层里，避免审计页继续保留旧后台那种割裂布局。
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

            <Table className="min-w-[1120px]">
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
                  <TableHead>业务名称</TableHead>
                  <TableHead>变更字段</TableHead>
                  <TableHead>变更前</TableHead>
                  <TableHead>变更后</TableHead>
                  <TableHead className="w-28">操作人</TableHead>
                  <TableHead className="w-44">操作时间</TableHead>
                  <TableActionHead className="w-44">操作</TableActionHead>
                </tr>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <WorkspaceTableStateRow colSpan={9} type="loading" title="正在加载审计日志..." />
                ) : error ? (
                  <WorkspaceTableStateRow
                    colSpan={9}
                    title="审计日志加载失败"
                    description={error}
                  />
                ) : records.length === 0 ? (
                  <WorkspaceTableStateRow
                    colSpan={9}
                    title="暂无审计日志"
                    description="可以调整筛选条件，或等待新的业务字段变更写入日志。"
                  />
                ) : (
                  records.map((log, idx) => (
                    <TableRow key={log.auditId}>
                      <TableCell className="py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(log.auditId)}
                          onChange={() => toggleOne(log.auditId)}
                          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </TableCell>
                      <TableCell className="py-4 text-slate-400 dark:text-slate-500">
                        {((query.pageNum || 1) - 1) * (query.pageSize || 10) + idx + 1}
                      </TableCell>
                      <TableCell className="py-4 text-slate-700 dark:text-slate-200">
                        <div className="max-w-[220px]">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={log.auditName || ''}>
                            {log.auditName || '-'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200">
                          {log.auditField || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="max-w-[180px] truncate font-mono text-xs text-rose-600 dark:text-rose-300" title={log.beforeVal || ''}>
                          {log.beforeVal || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="max-w-[180px] truncate font-mono text-xs text-emerald-600 dark:text-emerald-300" title={log.afterVal || ''}>
                          {log.afterVal || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        {log.createBy || '-'}
                      </TableCell>
                      <TableCell className="py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {log.createTime || '-'}
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
                              onClick: () => void handleViewDetail(log.auditId),
                              tone: 'info',
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={14} />,
                              onClick: () => setPendingDeleteIds([log.auditId]),
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

        <AuditDetailModal log={detailLog} onClose={() => setDetailLog(null)} />

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
      </WorkspacePageContent>
    </div>
  );
};

export default AuditLogPage;
