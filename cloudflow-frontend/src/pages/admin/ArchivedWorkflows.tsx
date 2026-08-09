import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, DatePicker, Input, Pagination } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import {
  getArchivedWorkflows,
  permanentDeleteWorkflows,
  restoreWorkflows,
} from '../../services/api/workflow';
import { useWorkflowPermission } from '../../hooks/useWorkflowPermission';
import '../../styles/features/admin-workflow.css';

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
  <tr className="admin-workflow-archive-state-row">
    <td colSpan={colSpan}>
      <div className="admin-workflow-archive-state">
        <div className="admin-source-stat-icon">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        </div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
    </td>
  </tr>
);

const AccessState: React.FC<{
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ title, description, action }) => (
  <section className="admin-source-page admin-workflow-archive-page">
    <TablePageLayout
      table={(
        <InnerTableSurface className="admin-workflow-archive-table-panel" wrapperClassName="admin-workflow-archive-empty-wrapper">
          <div className="admin-workflow-archive-state">
            <div className="admin-source-stat-icon">
              <ShieldOff size={20} />
            </div>
            <strong>{title}</strong>
            <span>{description}</span>
            <div className="admin-workflow-archive-state-actions">{action}</div>
          </div>
        </InnerTableSurface>
      )}
    />
  </section>
);

const getRestoreStatusMeta = (canRestore: boolean) =>
  canRestore
    ? {
        label: '可恢复',
        className: 'is-restorable',
      }
    : {
        label: '不可恢复',
        className: 'is-locked',
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
  const metrics = [
    { label: '归档流程', value: String(total), meta: `当前页 ${workflows.length}`, icon: <CheckCircle2 size={18} />, tone: 'blue' },
    { label: '可恢复', value: String(restorableCount), meta: '当前页可回滚', icon: <RotateCcw size={18} />, tone: 'green' },
    { label: '已选', value: String(selectedIds.length), meta: `可恢复 ${selectedRestorableIds.length}`, icon: <CheckSquare size={18} />, tone: 'violet' },
    { label: '筛选', value: hasActiveFilters ? '启用' : '全部', meta: query.keyword || '归档记录', icon: <Search size={18} />, tone: 'amber' },
  ];

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

      const records = (Array.isArray(response?.records) ? response.records : []) as unknown as ArchivedWorkflow[];
      setWorkflows(records);
      setTotal(Number(response?.total || 0));
      setSelectedIds((current) => current.filter((id) => records.some((item) => item.workflowId === id)));
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
            <ArrowLeft size={15} className="mr-2" />
            返回流程管理
          </Button>
        )}
      />
    );
  }

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ARCHIVED WORKFLOWS</p>
          <h2>归档流程</h2>
          <span>治理已归档流程、恢复可用流程和永久删除无效流程</span>
        </div>
        <div className="admin-source-controls">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadArchivedRecords()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'mr-2 animate-spin' : 'mr-2'} />
            刷新
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/workflow/management')}>
            <ArrowLeft size={15} className="mr-2" />
            返回管理
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid admin-workflow-archive-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar admin-workflow-archive-toolbar">
      <form onSubmit={handleSearch} className="admin-workflow-archive-filter-grid">
        <label>
          <span className="input-label">流程检索</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              placeholder="搜索流程或归档原因"
              className="h-[42px] pl-9"
            />
          </div>
        </label>

        <label>
          <span className="input-label">开始日期</span>
          <DatePicker
            type="date"
            value={filters.start}
            max={filters.end || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, start: event.target.value }))}
            placeholder="开始日期"
            className="h-[42px]"
          />
        </label>

        <label>
          <span className="input-label">结束日期</span>
          <DatePicker
            type="date"
            value={filters.end}
            min={filters.start || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, end: event.target.value }))}
            placeholder="结束日期"
            className="h-[42px]"
          />
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{hasActiveFilters ? `${query.keyword || '全部关键词'} / ${query.start || '起始不限'} / ${query.end || '截止不限'}` : '全部归档'}</span>
          <Button type="submit" variant="outline" size="sm">
            <Search size={14} />
            查询
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters}>
            <RefreshCw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface
      className="admin-workflow-archive-table-panel flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="admin-workflow-archive-table-head">
        <div>
          <strong>归档记录列表</strong>
          <span>{total} 条 · 当前页 {workflows.length} 条 · 已选 {selectedIds.length}</span>
        </div>
        <span className="admin-workflow-archive-page-count">
          第 {currentPage} 页
        </span>
      </div>

      {selectedIds.length > 0 ? (
        <div className="admin-workflow-archive-bulkbar">
          <div>
            <div className="admin-workflow-archive-bulkmeta">
              <span>已选 {selectedIds.length} 条</span>
              <span>可恢复 {selectedRestorableIds.length} 条</span>
            </div>

            <div className="admin-workflow-archive-bulkactions">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRestore(selectedIds)}
                disabled={restoring || !canBatchRestore || selectedRestorableIds.length === 0}
              >
                {restoring ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                恢复
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDeleteDialog(selectedIds)}
                disabled={deleting || !canPermanentDelete}
              >
                <Trash2 size={15} />
                删除
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <table className="unity-data-table admin-workflow-archive-table">
        <thead>
          <tr>
            <th>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleSelectAll}
                disabled={visibleWorkflowIds.length === 0}
                aria-label={allSelected ? '取消全选当前页' : '全选当前页'}
                className="admin-workflow-archive-check-button"
              >
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </Button>
            </th>
            <th>流程</th>
            <th>归档人</th>
            <th>归档时间</th>
            <th>归档原因</th>
            <th>状态</th>
            <th>当前操作</th>
          </tr>
        </thead>
        <tbody>
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
                <tr key={workflow.id || workflow.workflowId} data-state={isSelected ? 'selected' : undefined}>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-pressed={isSelected}
                      aria-label={isSelected ? `取消选择 ${workflow.workflowName}` : `选择 ${workflow.workflowName}`}
                      onClick={() => handleSelectOne(workflow.workflowId)}
                      className={cn('admin-workflow-archive-check-button', isSelected && 'is-selected')}
                    >
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </Button>
                  </td>
                  <td>
                    <div className="admin-workflow-archive-name">
                      <strong>{workflow.workflowName}</strong>
                      <small>{workflow.workflowId}</small>
                    </div>
                  </td>
                  <td>
                    <span className="admin-workflow-archive-muted">{workflow.archivedByName || workflow.archivedBy || '-'}</span>
                  </td>
                  <td>
                    <span className="admin-workflow-archive-muted">{formatDateTime(workflow.archivedAt)}</span>
                  </td>
                  <td>
                    <span className="admin-workflow-archive-reason" data-tooltip={workflow.archiveReason || '-'}>
                      {workflow.archiveReason || '-'}
                    </span>
                  </td>
                  <td>
                    <span className={cn('admin-workflow-archive-status', restoreStatus.className)}>
                      {restoreStatus.label}
                    </span>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="恢复" aria-label="恢复" onClick={() => void handleRestore([workflow.workflowId])} disabled={restoring || !workflow.canRestore || !canBatchRestore}><RotateCcw size={15} /></button>
                      <button type="button" data-tooltip="删除" aria-label="删除" onClick={() => openDeleteDialog([workflow.workflowId])} disabled={deleting || !canPermanentDelete}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
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
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-workflow-archive-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

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
        bodyClassName="admin-dialog-stack px-4 py-3 sm:px-5 sm:py-4"
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
              {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              删除
            </Button>
          </>
        )}
      >
        <div className="admin-workflow-archive-dialog-message">
          将永久删除 {deleteTarget.length} 条归档流程。删除后不可恢复。
        </div>
      </BaseDialog>
    </>
  );
};

export default ArchivedWorkflows;
