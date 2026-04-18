import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Clock3,
  GitBranch,
  History,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Button, Textarea, WarningConfirmDialog } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspaceStatusPage,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { cn } from '@/utils/cn';
import request from '@/services/api/request';
import {
  ApiErrorResponse,
  handleApiError,
  showSuccess,
  showWarning,
} from '@/utils/errorHandler';
import { useWorkflowPermission } from '../hooks/useWorkflowPermission';

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

const changeTypeMap: Record<string, { label: string; className: string }> = {
  major: {
    label: '重大变更',
    className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
  },
  minor: {
    label: '功能迭代',
    className: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
  },
  patch: {
    label: '细节修复',
    className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
  },
};

const toneMap = {
  added: {
    titleClassName: 'text-emerald-600',
    cardClassName: 'border-emerald-100 bg-emerald-50/80',
  },
  removed: {
    titleClassName: 'text-rose-600',
    cardClassName: 'border-rose-100 bg-rose-50/80',
  },
  modified: {
    titleClassName: 'text-sky-600',
    cardClassName: 'border-sky-100 bg-sky-50/70',
  },
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

const CompareNodeSection = ({
  title,
  description,
  items,
  tone,
  showChanges = false,
}: {
  title: string;
  description: string;
  items: ComparedNode[];
  tone: keyof typeof toneMap;
  showChanges?: boolean;
}) => {
  const toneMeta = toneMap[tone];

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div>
        <div className={cn('text-sm font-semibold', toneMeta.titleClassName)}>
          {title} ({items.length})
        </div>
        <div className="mt-1 text-xs text-slate-400">{description}</div>
      </div>

      <div className={cn('grid gap-3', showChanges ? 'grid-cols-1' : 'md:grid-cols-2')}>
        {items.map((node) => (
          <div
            key={node.nodeId}
            className={cn('rounded-[20px] border p-4', toneMeta.cardClassName)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">{node.nodeName}</div>
              <span className="text-xs text-slate-400">类型：{node.nodeType || '未知'}</span>
            </div>

            {showChanges ? (
              node.changes && node.changes.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {node.changes.map((change, index) => (
                    <div
                      key={`${node.nodeId}-${change.path}-${index}`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500 shadow-sm"
                    >
                      <div className="font-semibold text-slate-700">{change.path}</div>
                      <div className="mt-1">
                        {formatValue(change.oldValue)}
                        {' -> '}
                        {formatValue(change.newValue)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-slate-400">未返回属性差异明细。</div>
              )
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
};

const CompareEdgeSection = ({
  addedEdges,
  removedEdges,
}: {
  addedEdges: ComparedEdge[];
  removedEdges: ComparedEdge[];
}) => {
  if (addedEdges.length === 0 && removedEdges.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div>
        <div className="text-sm font-semibold text-slate-700">连线变化</div>
        <div className="mt-1 text-xs text-slate-400">节点之间的流转关系改动会汇总在这个区域。</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {addedEdges.map((edge, index) => (
          <div
            key={`added-${edge.sourceId}-${edge.targetId}-${index}`}
            className="rounded-[20px] border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-slate-600"
          >
            新增连线：{edge.sourceId}
            {' -> '}
            {edge.targetId}
          </div>
        ))}
        {removedEdges.map((edge, index) => (
          <div
            key={`removed-${edge.sourceId}-${edge.targetId}-${index}`}
            className="rounded-[20px] border border-rose-100 bg-rose-50/80 p-4 text-sm text-slate-600"
          >
            删除连线：{edge.sourceId}
            {' -> '}
            {edge.targetId}
          </div>
        ))}
      </div>
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
  const canRollbackCurrentWorkflow = workflowCreatorId
    ? canViewVersionHistory(workflowCreatorId)
    : isAdmin;

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

  const [warningData, setWarningData] = useState<{
    message: string;
    description?: string;
  } | null>(null);
  const [pendingRollback, setPendingRollback] = useState<PendingRollbackPayload | null>(null);
  const [showWarningDialog, setShowWarningDialog] = useState(false);

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
      loadVersions();
    }
  }, [workflowId]);

  const currentVersion = versions[0] || null;
  const selectedVersionList = useMemo(
    () => versions.filter((item) => selectedVersions.includes(item.id)),
    [selectedVersions, versions],
  );

  const hasDiff = Boolean(
    comparison?.addedNodes?.length ||
      comparison?.removedNodes?.length ||
      comparison?.modifiedNodes?.length ||
      comparison?.addedEdges?.length ||
      comparison?.removedEdges?.length,
  );

  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((id) => id !== versionId);
      }
      if (prev.length >= 2) {
        showWarning('最多只能选择两个版本进行对比');
        return prev;
      }
      return [...prev, versionId];
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
      const data = await request.get<RunningInstanceCheckResponse>(
        `/workflow/versions/check-running/${workflowId}`,
      );
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
    }
  };

  if (!hasViewPermission) {
    return (
      <WorkspaceStatusPage
        icon={<AlertTriangle size={28} />}
        title="没有权限查看版本历史"
        description="当前流程的版本历史仅对流程创建者和管理员开放。"
        actions={
          onBack ? (
            <Button type="button" variant="outline" onClick={onBack} className="rounded-xl">
              <ArrowLeft className="h-4 w-4" />
              返回上一页
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              <History className="h-3.5 w-3.5 text-teal-600" />
              Version Workspace
            </span>
          }
          title={`${workflowName || '流程'}版本历史`}
          description={
            workflowDescription
              ? `${workflowDescription} 统一查看版本演进、差异对比与回滚记录。`
              : '统一查看流程版本演进、差异对比与回滚记录，保持和出差申请页一致的工作台布局。'
          }
          actions={
            <>
              {onBack ? (
                <Button type="button" variant="outline" onClick={onBack} className="rounded-xl">
                  <ArrowLeft className="h-4 w-4" />
                  返回
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={loadVersions}
                disabled={loading}
                className="rounded-xl"
              >
                <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                刷新版本
              </Button>
              <Button
                type="button"
                onClick={handleCompare}
                disabled={selectedVersions.length !== 2 || comparing}
                className="rounded-xl"
              >
                <ArrowRightLeft className="h-4 w-4" />
                {comparing ? '正在对比...' : '对比选中版本'}
              </Button>
            </>
          }
        >
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="版本总数"
              value={versions.length}
              hint="当前流程已沉淀的全部历史版本"
              aside={<GitBranch className="h-[18px] w-[18px] text-teal-600" />}
            />
            <WorkspaceMetricCard
              label="已选对比"
              value={`${selectedVersions.length} / 2`}
              hint="最多勾选两个版本进入差异对比"
              aside={<ArrowRightLeft className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="当前版本"
              value={currentVersion ? `v${currentVersion.versionNumber}` : '未生成'}
              hint={currentVersion ? formatDateTime(currentVersion.createdAt) : '暂无可用版本'}
              aside={<History className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="回滚权限"
              value={canRollbackCurrentWorkflow ? '可执行回滚' : '仅查看历史'}
              hint={canRollbackCurrentWorkflow ? '旧版本支持一键回滚' : '当前账户暂不支持回滚'}
              aside={<RotateCcw className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="版本操作台"
          title="版本筛选与对比"
          total={versions.length}
          hasActiveFilters={selectedVersions.length > 0}
          overviewItems={[
            {
              label: '最近更新',
              value: currentVersion ? formatDateTime(currentVersion.createdAt) : '暂无记录',
            },
            {
              label: '回滚版本',
              value: versions.filter((item) => item.isRollback).length,
            },
            {
              label: '可回滚数量',
              value: versions.length > 1 ? versions.length - 1 : 0,
            },
            {
              label: '当前状态',
              value: selectedVersions.length > 0 ? `已选择 ${selectedVersions.length} 个版本` : '待选择对比版本',
            },
          ]}
          filterBar={
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                  按版本勾选，最多两项
                </span>
                {selectedVersionList.map((version) => (
                  <span
                    key={version.id}
                    className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-[11px] font-medium text-teal-700"
                  >
                    v{version.versionNumber}
                  </span>
                ))}
              </div>

              {selectedVersions.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedVersions([])}
                  className="rounded-xl"
                >
                  清空选择
                </Button>
              ) : (
                <div className="text-xs text-slate-400">
                  当前版本默认位于列表顶部，可直接与任一历史版本做差异对比。
                </div>
              )}
            </div>
          }
        />

        <WorkspaceResultCard
          total={versions.length}
          title="版本列表"
          description="使用统一轻玻璃工作台展示版本说明、操作者、更新时间以及回滚入口。"
        >
          <div className="space-y-4 p-4">
            {loading ? (
              <WorkspaceInlineState
                type="loading"
                title="正在整理版本时间线..."
                description="请稍候，系统正在读取版本记录和回滚信息。"
                className="py-16"
              />
            ) : versions.length === 0 ? (
              <WorkspaceInlineState
                icon={<GitBranch className="h-5 w-5" />}
                title="暂无版本历史"
                description="当前流程还没有可供查看的历史版本，后续发布后会在这里沉淀记录。"
                className="py-16"
              />
            ) : (
              versions.map((version, index) => {
                const isSelected = selectedVersions.includes(version.id);
                const changeType = getChangeTypeMeta(version.changeType);

                return (
                  <div
                    key={version.id}
                    className={cn(
                      'rounded-2xl border px-5 py-5 transition',
                      isSelected
                        ? 'border-teal-200 bg-teal-50/70 shadow-sm'
                        : 'border-slate-200 bg-white shadow-sm',
                    )}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 flex-1 gap-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleVersionSelection(version.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 accent-teal-600"
                          aria-label={`选择版本 v${version.versionNumber}`}
                        />

                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-lg font-semibold tracking-tight text-slate-900">
                              v{version.versionNumber}
                            </span>
                            {index === 0 ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 ring-1 ring-emerald-100">
                                当前版本
                              </span>
                            ) : null}
                            {version.isRollback ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-amber-100">
                                <RotateCcw className="h-3.5 w-3.5" />
                                回滚版本
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
                                changeType.className,
                              )}
                            >
                              {changeType.label}
                            </span>
                          </div>

                          <div className="text-sm leading-7 text-slate-600">
                            {version.changeLog || '暂无版本说明'}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatDateTime(version.createdAt)}
                            </span>
                            <span>操作人：{version.createdByName || version.createdBy || '未知'}</span>
                            {version.rollbackFromVersion ? (
                              <span className="text-amber-500">
                                来源版本：v{version.rollbackFromVersion}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant={isSelected ? 'soft' : 'outline'}
                          onClick={() => toggleVersionSelection(version.id)}
                          className="rounded-xl"
                        >
                          {isSelected ? '取消选择' : '加入对比'}
                        </Button>
                        {index !== 0 && canRollbackCurrentWorkflow ? (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => handleOpenRollback(version)}
                            className="rounded-xl"
                          >
                            <RotateCcw className="h-4 w-4" />
                            回滚到此版本
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </WorkspaceResultCard>
      </WorkspacePageContent>
      {showCompareModal && comparison ? (
        <WorkspaceDialogShell
          title={`版本对比：v${comparison.fromVersion} -> v${comparison.toVersion}`}
          description="查看两个版本之间的节点、连线以及属性差异。"
          onClose={() => setShowCompareModal(false)}
          maxWidthClassName="max-w-5xl"
          bodyClassName="max-h-[80vh] overflow-y-auto"
        >
          <div className="space-y-6">
            {hasDiff ? (
              <>
                <CompareNodeSection
                  title="新增节点"
                  description="新版本中新增的流程节点会集中展示在这里。"
                  items={comparison.addedNodes || []}
                  tone="added"
                />
                <CompareNodeSection
                  title="删除节点"
                  description="以下节点仅存在于旧版本，升级后会被移除。"
                  items={comparison.removedNodes || []}
                  tone="removed"
                />
                <CompareNodeSection
                  title="修改节点"
                  description="属性、审批规则或节点配置调整会在这里逐项展示。"
                  items={comparison.modifiedNodes || []}
                  tone="modified"
                  showChanges={true}
                />
                <CompareEdgeSection
                  addedEdges={comparison.addedEdges || []}
                  removedEdges={comparison.removedEdges || []}
                />
              </>
            ) : (
              <WorkspaceInlineState
                title="两个版本没有结构差异"
                description="当前选中的两个版本在节点和连线层面保持一致，无需额外处理。"
                className="py-14"
              />
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCompareModal(false)}
                className="rounded-xl"
              >
                关闭
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {showRollbackModal && rollbackVersion ? (
        <WorkspaceDialogShell
          title="确认回滚版本"
          description={`准备回滚到版本 v${rollbackVersion.versionNumber}，请补充回滚原因。`}
          onClose={() => setShowRollbackModal(false)}
          maxWidthClassName="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
                <div className="space-y-1 text-sm text-amber-800">
                  <div className="font-semibold">回滚会覆盖当前流程定义</div>
                  <div>
                    系统将恢复到 v{rollbackVersion.versionNumber}，当前版本之后的流程变更将不再作为最新配置。
                  </div>
                </div>
              </div>
            </div>

            {hasRunningInstances ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-500" />
                  <div className="space-y-2 text-sm text-rose-700">
                    <div className="font-semibold">检测到运行中的流程实例</div>
                    <div>如果确认业务允许，可以勾选强制回滚；否则建议等待实例执行完成后再操作。</div>
                    <label className="inline-flex items-center gap-2 text-sm text-rose-700">
                      <input
                        type="checkbox"
                        checked={forceRollback}
                        onChange={(event) => setForceRollback(event.target.checked)}
                        className="h-4 w-4 rounded border-rose-200 accent-rose-500"
                      />
                      强制回滚，即使当前仍有运行中的实例
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                回滚原因 <span className="text-rose-500">*</span>
              </label>
              <Textarea
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
                placeholder="例如：最新流程配置存在审批分支错误，需要恢复到稳定版本。"
                rows={4}
                className="min-h-[112px]"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRollbackModal(false)}
                className="rounded-xl"
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleRollback}
                className="rounded-xl"
              >
                确认回滚
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {warningData ? (
        <WarningConfirmDialog
          open={showWarningDialog}
          onClose={() => {
            setShowWarningDialog(false);
            setWarningData(null);
            setPendingRollback(null);
          }}
          title="运行实例警告"
          message={warningData.message}
          description={warningData.description}
          confirmText="强制回滚"
          requireDoubleConfirm={true}
          doubleConfirmText="我已了解风险，确认继续强制回滚"
          onConfirm={handleConfirmRollback}
          severity="warning"
        />
      ) : null}
    </div>
  );
};

export default VersionHistory;
