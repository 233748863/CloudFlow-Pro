import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock3,
  Eye,
  FileText,
  GitBranch,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Textarea } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
import { cn } from '@/utils/cn';
import { getProcessDefinitions } from '@/services/api/workflow';
import {
  ImpactAnalysis,
  RollbackHistory,
  VersionSnapshot,
  analyzeDeployImpact,
  getVersionSnapshot,
  listRollbackHistory,
  listRollbackVersions,
  rollbackDeploy,
} from '@/services/api/deployEnhancement';

interface ProcessOption {
  definitionId?: string | number;
  processName?: string;
  processKey?: string;
}

const IMPACT_LEVEL_CONFIG: Record<
  string,
  {
    label: string;
    className: string;
    icon: React.ElementType;
  }
> = {
  LOW: {
    label: '低',
    className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    icon: CheckCircle,
  },
  MEDIUM: {
    label: '中',
    className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    icon: AlertTriangle,
  },
  HIGH: {
    label: '高',
    className: 'bg-orange-50 text-orange-600 ring-1 ring-orange-100',
    icon: AlertTriangle,
  },
  CRITICAL: {
    label: '严重',
    className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    icon: XCircle,
  },
};

const ROLLBACK_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  SUCCESS: {
    label: '成功',
    className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
  },
  FAILED: {
    label: '失败',
    className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
  },
  PARTIAL: {
    label: '部分成功',
    className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
  },
};

const getImpactMeta = (level: string) => IMPACT_LEVEL_CONFIG[level] || IMPACT_LEVEL_CONFIG.LOW;
const getRollbackStatusMeta = (status: string) => ROLLBACK_STATUS_CONFIG[status] || ROLLBACK_STATUS_CONFIG.SUCCESS;

const formatJsonSafely = (raw?: string) => {
  if (!raw) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export const VersionRollbackManagement: React.FC = () => {
  const [activeView, setActiveView] = useState<'versions' | 'history'>('versions');
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [history, setHistory] = useState<RollbackHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapshotModal, setSnapshotModal] = useState<VersionSnapshot | null>(null);
  const [rollbackModal, setRollbackModal] = useState<{
    version: VersionSnapshot;
    impact?: ImpactAnalysis;
  } | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [forceRollback, setForceRollback] = useState(false);

  const loadProcesses = async () => {
    try {
      const data = await getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false });
      const list = Array.isArray(data) ? (data as ProcessOption[]) : [];
      setProcesses(list);

      if (!selectedProcess && list.length > 0) {
        const first = list[0];
        setSelectedProcess(String(first.definitionId || ''));
      }
    } catch (error) {
      toast.error('加载流程列表失败');
      console.error(error);
    }
  };

  const loadVersions = async () => {
    if (!selectedProcess) {
      return;
    }

    try {
      setLoading(true);
      const data = await listRollbackVersions(selectedProcess);
      setVersions(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('加载可回滚版本失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedProcess) {
      return;
    }

    try {
      setLoading(true);
      const data = await listRollbackHistory(selectedProcess);
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('加载回滚历史失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (!selectedProcess) {
      return;
    }

    if (activeView === 'versions') {
      loadVersions();
    } else {
      loadHistory();
    }
  }, [selectedProcess, activeView]);

  const selectedProcessMeta = useMemo(
    () => processes.find((item) => String(item.definitionId || '') === selectedProcess),
    [processes, selectedProcess],
  );

  const summary = useMemo(() => {
    const latestVersion = versions.length > 0 ? Math.max(...versions.map((item) => item.version)) : 0;

    return {
      processCount: processes.length,
      versionCount: versions.length,
      historyCount: history.length,
      latestVersion,
    };
  }, [history.length, processes.length, versions]);

  const handleViewSnapshot = async (version: VersionSnapshot) => {
    try {
      const data = await getVersionSnapshot(version.processDefId, version.version);
      setSnapshotModal(data as VersionSnapshot);
    } catch (error) {
      toast.error('加载快照详情失败');
      console.error(error);
    }
  };

  const handlePrepareRollback = async (version: VersionSnapshot) => {
    try {
      const impact = await analyzeDeployImpact(version.processDefId);
      setRollbackReason('');
      setForceRollback(false);
      setRollbackModal({ version, impact });
    } catch (error) {
      toast.error('分析回滚影响失败');
      console.error(error);
    }
  };

  const handleRollback = async () => {
    if (!rollbackModal || !rollbackReason.trim()) {
      toast.error('请填写回滚原因');
      return;
    }

    if (rollbackModal.impact && !rollbackModal.impact.allowDeploy && !forceRollback) {
      toast.error('当前风险级别较高，请勾选强制回滚后再继续');
      return;
    }

    try {
      await rollbackDeploy({
        deployId: rollbackModal.version.deployId,
        targetVersion: rollbackModal.version.version,
        rollbackReason: rollbackReason.trim(),
        forceRollback,
      });

      toast.success('版本回滚成功');
      setRollbackModal(null);
      setRollbackReason('');
      setForceRollback(false);
      await loadVersions();
      await loadHistory();
    } catch (error) {
      toast.error('版本回滚失败');
      console.error(error);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-4">
        <WorkspaceMetricCard
          label="流程数"
          value={summary.processCount}
          hint="当前可用于回滚治理的流程定义"
          aside={<GitBranch className="h-[18px] w-[18px] text-cyan-700" />}
        />
        <WorkspaceMetricCard
          label="可回滚版本"
          value={summary.versionCount}
          hint="所选流程当前可用的版本快照"
          aside={<RotateCcw className="h-[18px] w-[18px] text-sky-500" />}
        />
        <WorkspaceMetricCard
          label="回滚历史"
          value={summary.historyCount}
          hint="所选流程过去执行过的回滚记录"
          aside={<FileText className="h-[18px] w-[18px] text-amber-500" />}
        />
        <WorkspaceMetricCard
          label="最新快照"
          value={summary.latestVersion > 0 ? `v${summary.latestVersion}` : '暂无'}
          hint="用于快速识别当前沉淀到的版本上限"
          aside={<ShieldAlert className="h-[18px] w-[18px] text-emerald-500" />}
        />
      </div>

      <WorkspaceSectionCard
        title="版本快照与回滚记录"
        description="选定流程后，可以查看可回滚版本、回滚历史以及风险分析结果。"
        eyebrow="Rollback Control"
        headerAside={
          <Button variant="outline" size="sm" onClick={() => (activeView === 'versions' ? loadVersions() : loadHistory())}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">选择流程</label>
              <Select value={selectedProcess} onValueChange={setSelectedProcess}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择流程" />
                </SelectTrigger>
                <SelectContent>
                  {processes.map((item) => (
                    <SelectItem key={String(item.definitionId)} value={String(item.definitionId)}>
                      {item.processName || item.processKey || String(item.definitionId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
              {[
                { key: 'versions', label: '版本列表' },
                { key: 'history', label: '回滚历史' },
              ].map((item) => {
                const active = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveView(item.key as 'versions' | 'history')}
                    className={cn(
                      'rounded-xl px-4 py-2 text-sm font-medium transition',
                      active
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:text-cyan-700',
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}

              <div className="ml-auto text-xs text-slate-400">
                {selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '未选择流程'}
              </div>
            </div>
          </div>

          {!selectedProcess ? (
            <WorkspaceInlineState
              icon={<GitBranch className="h-5 w-5" />}
              title="请先选择流程"
              description="选择流程后才能查看该流程的版本快照和回滚历史。"
              className="py-16"
            />
          ) : loading ? (
            <WorkspaceInlineState
              type="loading"
              title="正在读取版本数据..."
              description="系统正在同步快照和回滚历史，请稍候。"
              className="py-16"
            />
          ) : activeView === 'versions' ? (
            versions.length === 0 ? (
              <WorkspaceInlineState
                icon={<GitBranch className="h-5 w-5" />}
                title="没有可回滚版本"
                description="当前流程还没有生成版本快照，后续发布后会自动沉淀到这里。"
                className="py-16"
              />
            ) : (
              <div className="space-y-4">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900">版本 v{version.version}</span>
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-600 ring-1 ring-sky-100">
                            部署 ID：{version.deployId}
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">创建时间</div>
                            <div className="mt-1 font-medium">{version.createdTime}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">创建人</div>
                            <div className="mt-1 font-medium">{version.createdBy}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">流程定义</div>
                            <div className="mt-1 font-medium">{version.processDefId}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewSnapshot(version)}>
                          <Eye className="h-4 w-4" />
                          查看快照
                        </Button>
                        <Button size="sm" onClick={() => handlePrepareRollback(version)}>
                          <RotateCcw className="h-4 w-4" />
                          回滚到此版本
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : history.length === 0 ? (
            <WorkspaceInlineState
              icon={<FileText className="h-5 w-5" />}
              title="没有回滚历史"
              description="当前流程尚未执行过版本回滚，后续操作后会在这里沉淀记录。"
              className="py-16"
            />
          ) : (
            <div className="space-y-4">
              {history.map((record) => {
                const statusMeta = getRollbackStatusMeta(record.rollbackStatus);
                return (
                  <div
                    key={record.id}
                    className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-slate-900">
                          v{record.fromVersion}
                          {' -> '}
                          v{record.toVersion}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                            statusMeta.className,
                          )}
                        >
                          {statusMeta.label}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                          {record.rollbackType === 'MANUAL' ? '手动回滚' : '自动回滚'}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl bg-white/78 px-4 py-3 text-sm text-slate-600 border border-slate-200">
                          <div className="text-xs text-slate-400">回滚时间</div>
                          <div className="mt-1 font-medium">{record.rollbackTime}</div>
                        </div>
                        <div className="rounded-2xl bg-white/78 px-4 py-3 text-sm text-slate-600 border border-slate-200">
                          <div className="text-xs text-slate-400">操作人</div>
                          <div className="mt-1 font-medium">{record.rollbackBy}</div>
                        </div>
                        <div className="rounded-2xl bg-white/78 px-4 py-3 text-sm text-slate-600 border border-slate-200">
                          <div className="text-xs text-slate-400">原始部署 ID</div>
                          <div className="mt-1 font-medium">{record.originalDeployId}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/78 px-4 py-3 text-sm text-slate-600 border border-slate-200">
                        <div className="text-xs text-slate-400">回滚原因</div>
                        <div className="mt-1">{record.rollbackReason}</div>
                      </div>

                      {record.errorMessage ? (
                        <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-600">
                          {record.errorMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </WorkspaceSectionCard>

      {snapshotModal ? (
        <WorkspaceDialogShell
          title={`版本快照 · v${snapshotModal.version}`}
          description="查看发布快照的 BPMN、表单配置和节点配置，便于回滚前确认内容。"
          onClose={() => setSnapshotModal(null)}
          maxWidthClassName="max-w-5xl"
          bodyClassName="max-h-[84vh] overflow-y-auto"
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <WorkspaceMetricCard label="流程定义" value={snapshotModal.processDefId} hint="快照所属流程" />
              <WorkspaceMetricCard label="版本号" value={`v${snapshotModal.version}`} hint="当前查看的快照版本" />
              <WorkspaceMetricCard label="部署 ID" value={snapshotModal.deployId} hint="关联的部署记录" />
              <WorkspaceMetricCard label="创建时间" value={snapshotModal.createdTime} hint="快照生成时间" />
            </div>

            {snapshotModal.bpmnXml ? (
              <WorkspaceSectionCard
                title="BPMN XML"
                description="这是流程结构的原始 XML 内容，可用于对照流程定义。"
              >
                <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                  {snapshotModal.bpmnXml}
                </pre>
              </WorkspaceSectionCard>
            ) : null}

            {snapshotModal.formConfig ? (
              <WorkspaceSectionCard
                title="表单配置"
                description="回滚前建议确认表单字段和节点引用是否符合目标版本。"
              >
                <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                  {formatJsonSafely(snapshotModal.formConfig)}
                </pre>
              </WorkspaceSectionCard>
            ) : null}

            {snapshotModal.nodeConfig ? (
              <WorkspaceSectionCard
                title="节点配置"
                description="这里会展示审批节点、分支条件等节点级配置。"
              >
                <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                  {formatJsonSafely(snapshotModal.nodeConfig)}
                </pre>
              </WorkspaceSectionCard>
            ) : null}
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {rollbackModal ? (
        <WorkspaceDialogShell
          title={`确认回滚到 v${rollbackModal.version.version}`}
          description="先阅读影响分析，再填写回滚原因，确保这次恢复动作有完整记录。"
          onClose={() => {
            setRollbackModal(null);
            setRollbackReason('');
            setForceRollback(false);
          }}
          maxWidthClassName="max-w-3xl"
          bodyClassName="max-h-[84vh] overflow-y-auto"
        >
          <div className="space-y-5">
            {rollbackModal.impact ? (
              <WorkspaceSectionCard
                title="影响分析"
                description="根据当前流程状态评估本次回滚可能带来的影响。"
                headerAside={
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold',
                      getImpactMeta(rollbackModal.impact.overallLevel).className,
                    )}
                  >
                    {React.createElement(getImpactMeta(rollbackModal.impact.overallLevel).icon, {
                      className: 'h-3.5 w-3.5',
                    })}
                    总体风险：{getImpactMeta(rollbackModal.impact.overallLevel).label}
                  </span>
                }
                bodyClassName="space-y-3"
              >
                {rollbackModal.impact.impacts.length === 0 ? (
                  <WorkspaceInlineState
                    icon={<CheckCircle className="h-5 w-5" />}
                    title="未检测到额外影响"
                    description="系统没有返回具体影响项，可以直接按标准流程执行回滚。"
                    className="py-14"
                  />
                ) : (
                  rollbackModal.impact.impacts.map((impact, index) => {
                    const impactMeta = getImpactMeta(impact.impactLevel);
                    return (
                      <div
                        key={`${impact.impactType}-${index}`}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{impact.impactType}</div>
                            <div className="mt-1 text-sm text-slate-500">{impact.impactDetail}</div>
                          </div>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              impactMeta.className,
                            )}
                          >
                            {React.createElement(impactMeta.icon, { className: 'h-3.5 w-3.5' })}
                            {impactMeta.label}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">影响数量</div>
                            <div className="mt-1 font-medium">{impact.impactCount}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">建议处理</div>
                            <div className="mt-1 font-medium">{impact.suggestion || '暂无建议'}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </WorkspaceSectionCard>
            ) : null}

            {!rollbackModal.impact?.allowDeploy ? (
              <div className="rounded-3xl border border-rose-100 bg-rose-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-500" />
                  <div className="space-y-2 text-sm text-rose-700">
                    <div className="font-semibold">当前风险较高</div>
                    <div>如果确认业务允许，可以勾选强制回滚；否则建议先处理影响项后再执行。</div>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={forceRollback}
                        onChange={(event) => setForceRollback(event.target.checked)}
                        className="h-4 w-4 rounded border-rose-200 accent-rose-500"
                      />
                      我已了解风险，仍要强制执行回滚
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                回滚原因 <span className="text-rose-500">*</span>
              </label>
              <Textarea
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
                rows={4}
                placeholder="例如：本次发布导致表单路由异常，需要恢复到上一个稳定版本。"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRollbackModal(null);
                  setRollbackReason('');
                  setForceRollback(false);
                }}
              >
                取消
              </Button>
              <Button onClick={handleRollback}>
                <RotateCcw className="h-4 w-4" />
                确认回滚
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};
