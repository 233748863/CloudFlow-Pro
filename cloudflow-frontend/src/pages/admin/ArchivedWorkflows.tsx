import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckSquare,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
  Input,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { cn } from '@/utils/cn';
import {
  getArchivedWorkflows,
  permanentDeleteWorkflows,
  restoreWorkflows,
} from '../../services/api/workflow';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';

interface ArchivedWorkflow {
  id: string;
  workflowId: string;
  workflowName: string;
  archivedBy: string;
  archivedByName?: string;
  archivedAt: string;
  archiveReason: string;
  canRestore: boolean;
}

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-14">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1.5 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const AccessState: React.FC<{
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-950/88">
    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <ShieldOff className="h-5 w-5" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    <div className="mt-1.5 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    <div className="mt-4">{action}</div>
  </div>
);

const getRestoreStatusMeta = (canRestore: boolean) =>
  canRestore
    ? {
        label: '可恢复',
      }
    : {
        label: '不可恢复',
      };

const formatDateTime = (value: string) => {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const ArchivedWorkflows: React.FC = () => {
  const navigate = useNavigate();
  const { canAccessArchiveManagement, canBatchRestore, canPermanentDelete } = useWorkflowPermission();

  const [filters, setFilters] = useState({ keyword: '', start: '', end: '' });
  const [query, setQuery] = useState({ keyword: '', start: '', end: '' });
  const [workflows, setWorkflows] = useState<ArchivedWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[]>([]);

  const hasActiveFilters = Boolean(query.keyword || query.start || query.end);
  const restorableCount = useMemo(() => workflows.filter((item) => item.canRestore).length, [workflows]);
  const visibleWorkflowIds = useMemo(() => workflows.map((item) => item.workflowId), [workflows]);
  const allSelected = visibleWorkflowIds.length > 0 && selectedIds.length === visibleWorkflowIds.length;
  const selectedWorkflows = useMemo(
    () => workflows.filter((item) => selectedIds.includes(item.workflowId)),
    [selectedIds, workflows],
  );
  const selectedRestorableIds = useMemo(
    () => selectedWorkflows.filter((item) => item.canRestore).map((item) => item.workflowId),
    [selectedWorkflows],
  );

  const loadArchivedRecords = async () => {
    if (!canAccessArchiveManagement) {
      return;
    }

    setLoading(true);

    try {
      const response = await getArchivedWorkflows({
        pageNum: currentPage,
        pageSize,
        keyword: query.keyword || undefined,
        archivedAfter: query.start || undefined,
        archivedBefore: query.end || undefined,
      });

      const records = Array.isArray(response?.records) ? response.records : [];
      setWorkflows(records);
      setTotal(Number(response?.total || 0));
      setSelectedIds((current) => current.filter((id) => records.some((item: ArchivedWorkflow) => item.workflowId === id)));
    } catch (error) {
      console.error('加载归档流程失败:', error);
      toast.error(getErrorMessage(error, '加载归档流程失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccessArchiveManagement) {
      return;
    }

    void loadArchivedRecords();
  }, [canAccessArchiveManagement, currentPage, pageSize, query.end, query.keyword, query.start]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setCurrentPage(1);
    setQuery({
      keyword: filters.keyword.trim(),
      start: filters.start,
      end: filters.end,
    });
  };

  const handleReset = () => {
    const next = { keyword: '', start: '', end: '' };
    setFilters(next);
    setQuery(next);
    setCurrentPage(1);
  };

  const handleSelectAll = () => {
    if (visibleWorkflowIds.length === 0) {
      return;
    }

    setSelectedIds(allSelected ? [] : visibleWorkflowIds);
  };

  const handleSelectOne = (workflowId: string) => {
    setSelectedIds((current) =>
      current.includes(workflowId)
        ? current.filter((item) => item !== workflowId)
        : [...current, workflowId],
    );
  };

  const handleRestore = async (workflowIds: string[]) => {
    const candidateIds = workflowIds.filter((id) =>
      workflows.some((item) => item.workflowId === id && item.canRestore),
    );

    if (candidateIds.length === 0) {
      toast.error('没有可恢复的归档流程');
      return;
    }

    setRestoring(true);

    try {
      const result = await restoreWorkflows(candidateIds);

      if (result.successCount > 0) {
        toast.success(`已恢复 ${result.successCount} 个流程`);
      }
      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程恢复失败`);
      }

      setSelectedIds([]);
      await loadArchivedRecords();
    } catch (error: any) {
      console.error('恢复归档流程失败:', error);
      toast.error(error?.message || '恢复归档流程失败');
    } finally {
      setRestoring(false);
    }
  };

  const openDeleteDialog = (workflowIds: string[]) => {
    if (workflowIds.length === 0) {
      toast.error('请选择要删除的归档流程');
      return;
    }

    setDeleteTarget(workflowIds);
    setDeleteDialogOpen(true);
  };

  const handlePermanentDelete = async () => {
    if (deleteTarget.length === 0) {
      return;
    }

    setDeleting(true);

    try {
      const result = await permanentDeleteWorkflows(deleteTarget);

      if (result.successCount > 0) {
        toast.success(`已删除 ${result.successCount} 个流程`);
      }
      if (result.failedCount > 0) {
        toast.error(`${result.failedCount} 个流程删除失败`);
      }

      setDeleteDialogOpen(false);
      setDeleteTarget([]);
      setSelectedIds([]);
      await loadArchivedRecords();
    } catch (error: any) {
      console.error('永久删除失败:', error);
      toast.error(error?.message || '永久删除失败');
    } finally {
      setDeleting(false);
    }
  };

  if (!canAccessArchiveManagement) {
    return (
      <AccessState
        title="当前账号没有归档治理权限"
        description="仅具备流程治理权限的账号可访问。"
        action={(
          <Button onClick={() => navigate('/workflow/management')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回流程管理
          </Button>
        )}
      />
    );
  }

  return (
    <>
      <TablePageLayout
        className="gap-2.5"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={filters.keyword}
                  onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                  placeholder="搜索流程或归档原因"
                  className="h-10 pl-10"
                />
              </div>

              <DatePicker
                type="date"
                value={filters.start}
                max={filters.end || undefined}
                onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))}
                placeholder="开始日期"
                className="h-10 w-full sm:w-40"
              />

              <DatePicker
                type="date"
                value={filters.end}
                min={filters.start || undefined}
                onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))}
                placeholder="结束日期"
                className="h-10 w-full sm:w-40"
              />

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  清空
                </Button>
              ) : null}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {total} 条{restorableCount > 0 ? ` · 可恢复 ${restorableCount} 条` : ''}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadArchivedRecords()} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                刷新
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => navigate('/workflow/management')}>
                <ArrowLeft className="h-4 w-4" />
                返回管理
              </Button>
            </div>
          </div>
        )}
        table={(
          <>
            {selectedIds.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  已选 {selectedIds.length} 条 · 可恢复 {selectedRestorableIds.length} 条
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRestore(selectedIds)}
                    disabled={restoring || !canBatchRestore || selectedRestorableIds.length === 0}
                  >
                    {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    恢复
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openDeleteDialog(selectedIds)}
                    disabled={deleting || !canPermanentDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 px-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleSelectAll}
                        aria-label={allSelected ? '取消全选当前页' : '全选当前页'}
                        className="mx-auto h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                      >
                        {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </Button>
                    </TableHead>
                    <TableHead>流程</TableHead>
                    <TableHead>归档人</TableHead>
                    <TableHead>归档时间</TableHead>
                    <TableHead className="w-[240px]">归档原因</TableHead>
                    <TableHead className="w-20">状态</TableHead>
                    <TableActionHead className="w-32">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载归档流程..." loading />
                  ) : workflows.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      title={hasActiveFilters ? '当前筛选无结果' : '暂无归档流程'}
                    />
                  ) : (
                    workflows.map((workflow) => {
                      const restoreStatus = getRestoreStatusMeta(workflow.canRestore);
                      const isSelected = selectedIds.includes(workflow.workflowId);

                      return (
                        <TableRow key={workflow.id || workflow.workflowId} data-state={isSelected ? 'selected' : undefined}>
                          <TableCell className="w-12 px-2 py-3.5 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-pressed={isSelected}
                              aria-label={isSelected ? `取消选择 ${workflow.workflowName}` : `选择 ${workflow.workflowName}`}
                              onClick={() => handleSelectOne(workflow.workflowId)}
                              className={cn(
                                'mx-auto h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200',
                                isSelected && 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
                              )}
                            >
                              {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="py-3.5">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {workflow.workflowName}
                              </div>
                              <div className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                                {workflow.workflowId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5 text-sm text-slate-600 dark:text-slate-300">
                            {workflow.archivedByName || workflow.archivedBy || '-'}
                          </TableCell>
                          <TableCell className="py-3.5 text-sm text-slate-600 dark:text-slate-300">
                            {formatDateTime(workflow.archivedAt)}
                          </TableCell>
                          <TableCell className="max-w-[240px] py-3.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="truncate" title={workflow.archiveReason || '-'}>
                              {workflow.archiveReason || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="py-3.5">
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              {restoreStatus.label}
                            </span>
                          </TableCell>
                          <TableCell className="py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleRestore([workflow.workflowId])}
                                disabled={restoring || !workflow.canRestore || !canBatchRestore}
                                className="h-8 px-2.5 text-xs"
                              >
                                <RotateCcw className="h-4 w-4" />
                                恢复
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openDeleteDialog([workflow.workflowId])}
                                disabled={deleting || !canPermanentDelete}
                                className="h-8 px-2.5 text-xs"
                              >
                                <Trash2 className="h-4 w-4" />
                                删除
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        pagination={(
          <Pagination
            total={total}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(value) => {
              setPageSize(value);
              setCurrentPage(1);
            }}
          />
        )}
      />

      <BaseDialog
        open={deleteDialogOpen}
        title="确认永久删除"
        onClose={() => {
          if (!deleting) {
            setDeleteDialogOpen(false);
            setDeleteTarget([]);
          }
        }}
        maxWidthClassName="max-w-md"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTarget([]);
              }}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="outline"
              onClick={() => void handlePermanentDelete()}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除
            </Button>
          </>
        )}
      >
        <div className="text-sm leading-6 text-slate-700 dark:text-slate-200">
          将永久删除 {deleteTarget.length} 条归档流程。删除后不可恢复。
        </div>
      </BaseDialog>
    </>
  );
};

export default ArchivedWorkflows;
