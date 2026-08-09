import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import {
  ArrowLeft,
  ArrowRightLeft,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { BaseDialog } from '@/components/common';
import { Button, Textarea } from '@/components/common';
import { cn } from '@/utils/cn';
import request from '@/services/api/request';
import { ApiErrorResponse, handleApiError, showSuccess, showWarning } from '@/utils/errorHandler';
import { useWorkflowPermission } from '../hooks/useWorkflowPermission';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

interface VersionHistoryProps {
  workflowId: string;
  workflowCreatorId?: string;
  workflowName?: string;
  workflowDescription?: string;
  onBack?: () => void;
}

interface WorkflowVersion {
  id: string;
  versionNumber: string | number;
  changeType: string;
  changeLog?: string;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  isRollback?: boolean;
  rollbackFromVersion?: string | number;
}

interface ComparedNode {
  nodeId: string;
  nodeName: string;
  nodeType?: string;
  changes?: Array<{
    path: string;
    oldValue?: unknown;
    newValue?: unknown;
  }>;
}

interface ComparedEdge {
  sourceId: string;
  targetId: string;
}

interface VersionComparison {
  fromVersion: string | number;
  toVersion: string | number;
  addedNodes?: ComparedNode[];
  removedNodes?: ComparedNode[];
  modifiedNodes?: ComparedNode[];
  addedEdges?: ComparedEdge[];
  removedEdges?: ComparedEdge[];
}

interface RunningInstanceCheckResponse {
  hasRunningInstances?: boolean;
}

interface PendingRollbackPayload {
  versionId: string;
  reason: string;
}

const changeTypeMap: Record<string, { label: string }> = {
  major: { label: '重大变更' },
  minor: { label: '功能迭代' },
  patch: { label: '细节修复' },
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return '暂无时间';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '空';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const getChangeTypeMeta = (type?: string) => changeTypeMap[type || 'patch'] || changeTypeMap.patch;

const StatePanel: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
  action?: React.ReactNode;
}> = ({ title, description, loading = false, action }) => (
  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div className="admin-source-stat-icon mb-3">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <History className="h-5 w-5" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-1.5 max-w-2xl text-xs leading-5 text-cf-subtle">{description}</div>
    ) : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={cn('card overflow-hidden', className)}>
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  alignStart?: boolean;
  className?: string;
}> = ({ label, value, alignStart = false, className }) => (
  <div
    className={cn(
      'flex flex-col gap-1 border-b border-slate-200 px-3.5 py-2.5 last:border-b-0 dark:border-slate-800 sm:flex-row sm:justify-between sm:gap-4',
      alignStart ? 'sm:items-start' : 'sm:items-center',
      className,
    )}
  >
    <div className="text-xs font-medium text-cf-faint sm:min-w-[88px]">{label}</div>
    <div
      className={cn(
        'min-w-0 text-sm text-cf-body',
        alignStart ? 'sm:max-w-[72%]' : 'sm:text-right',
      )}
    >
      {value}
    </div>
  </div>
);

const RefinedCompareNodeSection: React.FC<{
  title: string;
  items: ComparedNode[];
  showChanges?: boolean;
}> = ({ title, items, showChanges = false }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-cf-title">{title}</div>
        <span className="text-xs text-cf-faint">{items.length}</span>
      </div>

      <DetailRows>
        {items.map((node) => (
          <div key={node.nodeId} className="border-b border-slate-200 px-3.5 py-2.5 last:border-b-0 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-cf-title">{node.nodeName}</div>
                <div className="mt-0.5 text-xs text-cf-faint">{node.nodeId}</div>
              </div>
              <span className="text-xs text-cf-faint">类型：{node.nodeType || '未知'}</span>
            </div>

            {showChanges ? (
              node.changes && node.changes.length > 0 ? (
                <DetailRows className="mt-3">
                  {node.changes.map((change, index) => (
                    <DetailRow
                      key={`${node.nodeId}-${change.path}-${index}`}
                      label={change.path}
                      value={
                        <div className="flex flex-col gap-1 text-xs leading-6 text-cf-subtle">
                          <div>
                            <span className="mr-2 text-cf-faint">旧值</span>
                            <span>{formatValue(change.oldValue)}</span>
                          </div>
                          <div>
                            <span className="mr-2 text-cf-faint">新值</span>
                            <span className="text-cf-body">{formatValue(change.newValue)}</span>
                          </div>
                        </div>
                      }
                      alignStart
                    />
                  ))}
                </DetailRows>
              ) : (
                <div className="mt-3 text-xs text-cf-faint">未返回属性差异明细</div>
              )
            ) : null}
          </div>
        ))}
      </DetailRows>
    </section>
  );
};

const RefinedCompareEdgeSection: React.FC<{
  addedEdges: ComparedEdge[];
  removedEdges: ComparedEdge[];
}> = ({ addedEdges, removedEdges }) => {
  if (addedEdges.length === 0 && removedEdges.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-cf-title">连线变化</div>
        <span className="text-xs text-cf-faint">{addedEdges.length + removedEdges.length}</span>
      </div>

      <DetailRows>
        {addedEdges.map((edge, index) => (
          <DetailRow
            key={`added-${edge.sourceId}-${edge.targetId}-${index}`}
            label="新增连线"
            value={`${edge.sourceId} -> ${edge.targetId}`}
          />
        ))}
        {removedEdges.map((edge, index) => (
          <DetailRow
            key={`removed-${edge.sourceId}-${edge.targetId}-${index}`}
            label="删除连线"
            value={`${edge.sourceId} -> ${edge.targetId}`}
          />
        ))}
      </DetailRows>
    </section>
  );
};

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  workflowId,
  workflowCreatorId,
  workflowName,
  workflowDescription,
  onBack,
}) => {
  const { isAdmin, canViewVersionHistory } = useWorkflowPermission();

  const hasViewPermission = workflowCreatorId ? canViewVersionHistory(workflowCreatorId) : true;
  const canRollbackCurrentWorkflow = workflowCreatorId ? canViewVersionHistory(workflowCreatorId) : isAdmin;

  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const [rollbackVersion, setRollbackVersion] = useState<WorkflowVersion | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [forceRollback, setForceRollback] = useState(false);
  const [hasRunningInstances, setHasRunningInstances] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);

  const [warningData, setWarningData] = useState<{ message: string; description?: string } | null>(null);
  const [pendingRollback, setPendingRollback] = useState<PendingRollbackPayload | null>(null);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [confirmingWarning, setConfirmingWarning] = useState(false);
  const [warningConfirmed, setWarningConfirmed] = useState(false);

  const currentVersion = versions[0] || null;
  const rollbackCount = useMemo(() => versions.filter((item) => item.isRollback).length, [versions]);

  const hasDiff = Boolean(
    comparison?.addedNodes?.length ||
      comparison?.removedNodes?.length ||
      comparison?.modifiedNodes?.length ||
      comparison?.addedEdges?.length ||
      comparison?.removedEdges?.length,
  );

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await request.get<WorkflowVersion[]>(`/workflow/versions/workflow/${workflowId}`);
      setVersions(data || []);
    } catch (error) {
      handleApiError(error as AxiosError<ApiErrorResponse>, {
        customMessage: '加载版本历史失败',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workflowId) {
      void loadVersions();
    }
  }, [workflowId]);

  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions((current) => {
      if (current.includes(versionId)) {
        return current.filter((id) => id !== versionId);
      }
      if (current.length >= 2) {
        showWarning('最多只能选择两个版本进行对比');
        return current;
      }
      return [...current, versionId];
    });
  };

  const handleCompare = async () => {
    if (selectedVersions.length !== 2) {
      showWarning('请选择两个版本后再进行对比');
      return;
    }

    setComparing(true);
    try {
      const data = await request.get<VersionComparison>('/workflow/versions/compare', {
        params: {
          fromVersionId: selectedVersions[0],
          toVersionId: selectedVersions[1],
        },
      });
      setComparison(data);
      setShowCompareModal(true);
    } catch (error) {
      handleApiError(error as AxiosError<ApiErrorResponse>, {
        customMessage: '版本对比失败',
      });
    } finally {
      setComparing(false);
    }
  };

  const handleOpenRollback = async (version: WorkflowVersion) => {
    if (!canRollbackCurrentWorkflow) {
      showWarning('当前账户没有回滚权限', '仅流程创建者或管理员可以执行回滚');
      return;
    }

    setRollbackVersion(version);
    setRollbackReason('');
    setForceRollback(false);
    setHasRunningInstances(false);

    try {
      const data = await request.get<RunningInstanceCheckResponse>(`/workflow/versions/check-running/${workflowId}`);
      setHasRunningInstances(Boolean(data?.hasRunningInstances));
    } catch (error) {
      console.error('检查运行实例失败:', error);
    }

    setShowRollbackModal(true);
  };

  const handleRollback = async () => {
    if (!rollbackVersion) {
      return;
    }

    if (!rollbackReason.trim()) {
      showWarning('请输入回滚原因');
      return;
    }

    try {
      await request.post('/workflow/versions/rollback', {
        workflowId,
        targetVersionId: rollbackVersion.id,
        reason: rollbackReason.trim(),
        forceRollback,
      });
      showSuccess('版本回滚成功');
      setShowRollbackModal(false);
      setRollbackVersion(null);
      setSelectedVersions([]);
      await loadVersions();
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorData = axiosError.response?.data;

      if (errorData?.code === 'RUNNING_INSTANCES_WARNING') {
        const affectedCount = (errorData.data?.affectedWorkflows as string[] | undefined)?.length || 0;
        setPendingRollback({
          versionId: rollbackVersion.id,
          reason: rollbackReason.trim(),
        });
        setWarningData({
          message: errorData.message || '当前流程存在运行中的实例',
          description:
            affectedCount > 0
              ? `检测到 ${affectedCount} 个实例仍在运行，强制回滚可能影响这些实例的继续执行。`
              : '检测到流程仍有运行中的实例，强制回滚可能影响执行中的数据状态。',
        });
        setWarningConfirmed(false);
        setShowWarningDialog(true);
        return;
      }

      handleApiError(axiosError, {
        customMessage: '版本回滚失败',
      });
    }
  };

  const handleConfirmRollback = async () => {
    if (!pendingRollback) {
      return;
    }

    setConfirmingWarning(true);

    try {
      await request.post('/workflow/versions/rollback', {
        workflowId,
        targetVersionId: pendingRollback.versionId,
        reason: pendingRollback.reason,
        forceRollback: true,
      });
      showSuccess('版本回滚成功');
      setShowRollbackModal(false);
      setShowWarningDialog(false);
      setWarningData(null);
      setPendingRollback(null);
      setRollbackVersion(null);
      setSelectedVersions([]);
      await loadVersions();
    } catch (error) {
      handleApiError(error as AxiosError<ApiErrorResponse>, {
        customMessage: '强制回滚失败',
      });
    } finally {
      setConfirmingWarning(false);
    }
  };

  if (!hasViewPermission) {
    return (
      <section className="admin-source-page">
        <TablePageLayout
          actions={(
            <header className="admin-source-header">
              <div>
                <p className="admin-source-kicker">WORKFLOW VERSIONS</p>
                <h2>{workflowName || '流程'}版本历史</h2>
                <span>当前流程的版本历史仅对流程创建者和管理员开放</span>
              </div>
              {onBack ? (
                <div className="admin-source-controls">
                  <Button type="button" variant="outline" onClick={onBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    返回上一页
                  </Button>
                </div>
              ) : null}
            </header>
          )}
          table={(
            <InnerTableSurface>
              <div className="px-6 py-10 text-center">
                <div className="admin-source-stat-icon mx-auto mb-3 flex h-10 w-10 items-center justify-center text-cf-faint">
                  <History className="h-5 w-5" />
                </div>
                <div className="text-sm font-medium text-cf-title">没有权限查看版本历史</div>
                <div className="mt-1.5 text-xs leading-6 text-cf-subtle">当前流程的版本历史仅对流程创建者和管理员开放。</div>
              </div>
            </InnerTableSurface>
          )}
        />
      </section>
    );
  }

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORKFLOW VERSIONS</p>
          <h2>{workflowName || '流程'}版本历史</h2>
          <span>{workflowDescription || '查看流程定义版本、对比差异并执行回滚'}</span>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><History size={20} /></span>
          <div className="min-w-0">
            <p>版本总数</p>
            <strong>{versions.length}</strong>
            <span>当前流程历史版本</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><Clock3 size={20} /></span>
          <div className="min-w-0">
            <p>当前版本</p>
            <strong>{currentVersion ? `v${currentVersion.versionNumber}` : '-'}</strong>
            <span>{currentVersion ? formatDateTime(currentVersion.createdAt) : '未生成版本'}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><RotateCcw size={20} /></span>
          <div className="min-w-0">
            <p>回滚版本</p>
            <strong>{rollbackCount}</strong>
            <span>历史回滚记录</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><ArrowRightLeft size={20} /></span>
          <div className="min-w-0">
            <p>已选对比</p>
            <strong>{selectedVersions.length}/2</strong>
            <span>选择两个版本后对比</span>
          </div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="admin-users-toolbar-actions">
          {onBack ? (
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadVersions()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCompare()} disabled={selectedVersions.length !== 2 || comparing}>
            {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            对比
          </Button>
          {selectedVersions.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedVersions([])}>
              清空选择
            </Button>
          ) : null}
        </div>
      </section>
  );

  const pageContent = (
      <InnerTableSurface className="flex min-h-0 flex-1 flex-col" wrapperClassName="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <div className="min-w-0">
            <div className="text-sm font-medium text-cf-title">版本时间线</div>
            <div className="mt-0.5 text-xs text-cf-subtle">
              版本 {versions.length} · 当前 {currentVersion ? `v${currentVersion.versionNumber}` : '未生成'} · 回滚 {rollbackCount} · 已选 {selectedVersions.length}/2
            </div>
          </div>

          <span className="admin-users-filter-count">版本 {versions.length}</span>
        </div>

        {loading ? (
          <StatePanel title="正在加载版本历史..." loading />
        ) : versions.length === 0 ? (
          <StatePanel title="暂无版本历史" description="当前流程还没有可供查看的历史版本。" />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {versions.map((version, index) => {
              const isSelected = selectedVersions.includes(version.id);
              const changeType = getChangeTypeMeta(version.changeType);

              return (
                <div
                  key={version.id}
                  className={cn(
                    'px-4 py-2 transition-colors',
                    isSelected ? 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/40' : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/40',
                  )}
                >
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="relative flex flex-col items-center pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVersionSelection(version.id)}
                          className="h-4 w-4 rounded border-slate-300 text-cf-title focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-slate-500"
                          aria-label={`选择版本 v${version.versionNumber}`}
                        />
                        {index !== versions.length - 1 ? (
                          <span className="mt-2.5 h-full min-h-[36px] w-px bg-slate-200 dark:bg-slate-800" />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-sm font-semibold text-cf-title">
                            v{version.versionNumber}
                          </span>
                          {index === 0 ? (
                            <span className="text-xs text-cf-subtle">当前版本</span>
                          ) : null}
                          {version.isRollback ? (
                            <span className="inline-flex items-center gap-1 text-xs text-cf-subtle">
                              <RotateCcw className="h-3.5 w-3.5" />
                              回滚版本
                            </span>
                          ) : null}
                          <span className="text-xs text-cf-subtle">{changeType.label}</span>
                        </div>

                        <div className="text-sm leading-5 text-cf-muted">
                          {version.changeLog || '暂无版本说明'}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cf-subtle">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5" />
                            {formatDateTime(version.createdAt)}
                          </span>
                          <span>操作人 {version.createdByName || version.createdBy || '未知'}</span>
                          {version.rollbackFromVersion ? <span>来源版本 v{version.rollbackFromVersion}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {index !== 0 && canRollbackCurrentWorkflow ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleOpenRollback(version)}>
                          <RotateCcw className="h-4 w-4" />
                          回滚
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />

      <BaseDialog
        open={showCompareModal && Boolean(comparison)}
        title={comparison ? `版本对比：v${comparison.fromVersion} -> v${comparison.toVersion}` : '版本对比'}
        onClose={() => setShowCompareModal(false)}
        maxWidthClassName="w-full sm:max-w-3xl lg:max-w-4xl"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <Button type="button" variant="outline" onClick={() => setShowCompareModal(false)}>
            关闭
          </Button>
        )}
      >
        {comparison ? (
          <div className="admin-dialog-stack">
            <DetailRows>
              <DetailRow label="对比范围" value={`v${comparison.fromVersion} -> v${comparison.toVersion}`} />
              <DetailRow
                label="节点变化"
                value={`新增 ${comparison.addedNodes?.length || 0} · 删除 ${comparison.removedNodes?.length || 0} · 修改 ${comparison.modifiedNodes?.length || 0}`}
              />
              <DetailRow
                label="连线变化"
                value={`${(comparison.addedEdges?.length || 0) + (comparison.removedEdges?.length || 0)}`}
              />
            </DetailRows>

            {hasDiff ? (
              <>
                <RefinedCompareNodeSection
                  title="新增节点"
                  items={comparison.addedNodes || []}
                />
                <RefinedCompareNodeSection
                  title="删除节点"
                  items={comparison.removedNodes || []}
                />
                <RefinedCompareNodeSection
                  title="修改节点"
                  items={comparison.modifiedNodes || []}
                  showChanges={true}
                />
                <RefinedCompareEdgeSection
                  addedEdges={comparison.addedEdges || []}
                  removedEdges={comparison.removedEdges || []}
                />
              </>
            ) : (
              <StatePanel title="两个版本没有结构差异" description="当前选中的两个版本在节点和连线层面保持一致。" />
            )}
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showRollbackModal && Boolean(rollbackVersion)}
        title={rollbackVersion ? `回滚到 v${rollbackVersion.versionNumber}` : '回滚版本'}
        onClose={() => setShowRollbackModal(false)}
        maxWidthClassName="w-full sm:max-w-lg"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setShowRollbackModal(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void handleRollback()}>
              确认回滚
            </Button>
          </>
        )}
      >
        {rollbackVersion ? (
          <div className="admin-dialog-stack">
            <DetailRows>
              <DetailRow label="目标版本" value={`v${rollbackVersion.versionNumber}`} />
              <DetailRow label="提交时间" value={formatDateTime(rollbackVersion.createdAt)} />
              <DetailRow label="操作人" value={rollbackVersion.createdByName || rollbackVersion.createdBy || '未知'} />
              <DetailRow label="运行实例" value={hasRunningInstances ? '需确认' : '未检测到'} />
              <DetailRow label="执行方式" value="覆盖当前流程定义" />
              <DetailRow label="变更说明" value={rollbackVersion.changeLog || '暂无版本说明'} alignStart />
              {rollbackVersion.rollbackFromVersion ? (
                <DetailRow label="来源版本" value={`v${rollbackVersion.rollbackFromVersion}`} />
              ) : null}
            </DetailRows>

            {hasRunningInstances ? (
              <DetailRows>
                <DetailRow label="运行实例" value="检测到运行中的流程实例" />
                <div className="px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-sm text-cf-body">
                      <input
                        type="checkbox"
                        checked={forceRollback}
                        onChange={(event) => setForceRollback(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-cf-title focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-slate-500"
                      />
                    强制回滚
                  </label>
                </div>
              </DetailRows>
            ) : null}

            <div className="admin-dialog-field">
              <label className="text-sm font-medium text-cf-body">
                回滚原因 <span className="text-cf-faint">*</span>
              </label>
              <Textarea
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
                rows={4}
                className="min-h-[104px]"
                placeholder="填写回滚原因"
              />
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showWarningDialog && Boolean(warningData)}
        title="运行实例警告"
        onClose={() => {
          setShowWarningDialog(false);
          setWarningData(null);
          setPendingRollback(null);
          setWarningConfirmed(false);
        }}
        maxWidthClassName="w-full sm:max-w-md"
        bodyClassName="px-4 py-3 sm:px-5 sm:py-4"
        footerClassName="gap-2 px-4 py-2.5 sm:px-5 sm:py-3"
        footer={(
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowWarningDialog(false);
                setWarningData(null);
                setPendingRollback(null);
                setWarningConfirmed(false);
              }}
            >
              取消
            </Button>
            <Button type="button" onClick={() => void handleConfirmRollback()} disabled={confirmingWarning || !warningConfirmed}>
              {confirmingWarning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              强制回滚
            </Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <DetailRows>
            <DetailRow label="提示" value={warningData?.message || '-'} alignStart />
            {warningData?.description ? (
              <DetailRow label="影响说明" value={warningData.description} alignStart />
            ) : null}
          </DetailRows>
          <label className="inline-flex items-start gap-2 text-sm text-cf-body">
            <input
              type="checkbox"
              checked={warningConfirmed}
              onChange={(event) => setWarningConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-cf-title focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-slate-500"
            />
            我已了解风险，确认继续强制回滚
          </label>
        </div>
      </BaseDialog>
    </section>
  );
};

export default VersionHistory;
