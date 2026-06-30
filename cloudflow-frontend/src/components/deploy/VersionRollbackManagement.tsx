import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  FileText,
  GitBranch,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common';
import { Button, SegmentedControl, SegmentedControlItem, Textarea } from '@/components/common';
import { InnerTableSurface } from '@/components/layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common/select';
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
    className:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
    icon: CheckCircle,
  },
  MEDIUM: {
    label: '中',
    className:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    icon: AlertTriangle,
  },
  HIGH: {
    label: '高',
    className:
      'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-200',
    icon: AlertTriangle,
  },
  CRITICAL: {
    label: '严重',
    className:
      'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    icon: XCircle,
  },
};

const ROLLBACK_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  SUCCESS: {
    label: '成功',
    className:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
  FAILED: {
    label: '失败',
    className:
      'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
  },
  PARTIAL: {
    label: '部分成功',
    className:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
  },
};

const getImpactMeta = (level: string) => IMPACT_LEVEL_CONFIG[level] || IMPACT_LEVEL_CONFIG.LOW;
const getRollbackStatusMeta = (status: string) =>
  ROLLBACK_STATUS_CONFIG[status] || ROLLBACK_STATUS_CONFIG.SUCCESS;

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

const SurfaceBlock: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, aside, children }) => (
  <InnerTableSurface wrapperClassName="p-0">
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    <div className="p-4">
      {children}
    </div>
  </InnerTableSurface>
);

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const SnapshotCodeBlock = ({
  title,
  description,
  content,
}: {
  title: string;
  description: string;
  content: string;
}) => (
  <SurfaceBlock title={title} description={description}>
    <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
      {content}
    </pre>
  </SurfaceBlock>
);

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
      toast.error(getErrorMessage(error, '加载流程列表失败'));
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
      toast.error(getErrorMessage(error, '加载可回滚版本失败'));
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
      toast.error(getErrorMessage(error, '加载回滚历史失败'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProcesses();
  }, []);

  useEffect(() => {
    if (!selectedProcess) {
      return;
    }

    if (activeView === 'versions') {
      void loadVersions();
    } else {
      void loadHistory();
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

  const activeViewSummary = useMemo(() => {
    if (activeView === 'versions') {
      return '当前视图以可回滚快照为主，方便在风险分析完成后直接执行恢复。';
    }

    return '当前视图以执行历史为主，用于回看回滚成功率、失败原因与操作者记录。';
  }, [activeView]);

  const handleViewSnapshot = async (version: VersionSnapshot) => {
    try {
      const data = await getVersionSnapshot(version.processDefId, version.version);
      setSnapshotModal(data as VersionSnapshot);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载快照详情失败'));
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
      toast.error(getErrorMessage(error, '分析回滚影响失败'));
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
      toast.error(getErrorMessage(error, '版本回滚失败'));
      console.error(error);
    }
  };

  return (
    <div className="admin-source-content-grid">
      <div className="card admin-users-toolbar">
        <div className="admin-toolbar-filter-grid admin-deploy-toolbar-grid [--admin-toolbar-filter-count:1]">
          <label className="min-w-0">
            <span className="input-label">流程</span>
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
          </label>

          <div className="admin-toolbar-field admin-deploy-toolbar-switch">
            <SegmentedControl className="min-h-9">
              {[
                { key: 'versions', label: '版本列表' },
                { key: 'history', label: '回滚历史' },
              ].map((item) => (
                <SegmentedControlItem
                  key={item.key}
                  size="sm"
                  active={activeView === item.key}
                  onClick={() => setActiveView(item.key as 'versions' | 'history')}
                >
                  {item.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>

          <div className="admin-users-toolbar-actions">
            <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              流程 {summary.processCount}
            </span>
            <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              快照 {summary.versionCount}
            </span>
            <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              历史 {summary.historyCount}
            </span>
            <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              最新 {summary.latestVersion > 0 ? `v${summary.latestVersion}` : '暂无'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void (activeView === 'versions' ? loadVersions() : loadHistory())}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>
      </div>

      {!selectedProcess ? (
        <InnerTableSurface className="min-h-[30rem]" wrapperClassName="flex min-h-[30rem] flex-col">
        <InlineState
          icon={<GitBranch className="h-5 w-5" />}
          title="请先选择流程"
          description="选择流程后才能查看该流程的版本快照和回滚历史。"
        />
        </InnerTableSurface>
      ) : loading ? (
        <InnerTableSurface className="min-h-[30rem]" wrapperClassName="flex min-h-[30rem] flex-col">
        <InlineState
          title="正在读取版本数据..."
          description="系统正在同步快照和回滚历史，请稍候。"
          loading
        />
        </InnerTableSurface>
      ) : activeView === 'versions' ? (
        versions.length === 0 ? (
          <InnerTableSurface className="min-h-[30rem]" wrapperClassName="flex min-h-[30rem] flex-col">
          <InlineState
            icon={<GitBranch className="h-5 w-5" />}
            title="没有可回滚版本"
            description="当前流程还没有生成版本快照，后续发布后会自动沉淀到这里。"
          />
          </InnerTableSurface>
        ) : (
          <InnerTableSurface className="min-h-[30rem]">
            <div className="hidden bg-[var(--cf-surface-muted)] px-4 py-3 text-xs font-medium text-slate-500 dark:bg-slate-900/70 dark:text-slate-400 lg:grid lg:grid-cols-[minmax(0,1fr)_120px_180px_160px_220px] lg:items-center">
              <span>版本</span>
              <span>部署</span>
              <span>创建时间</span>
              <span>创建人</span>
              <span>操作</span>
            </div>

            {versions.map((version) => {
              const latest = version.version === summary.latestVersion;

              return (
                <div
                  key={version.id}
                  className="grid gap-4 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_120px_180px_160px_220px] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        版本 v{version.version}
                      </span>
                      {latest ? (
                        <span className="inline-flex rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                          最新快照
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      流程定义 {version.processDefId}
                    </div>
                  </div>

                  <div className="text-sm text-slate-600 dark:text-slate-300">{version.deployId}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">{version.createdTime}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">{version.createdBy}</div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void handleViewSnapshot(version)}>
                      <Eye className="h-4 w-4" />
                      查看快照
                    </Button>
                    <Button size="sm" onClick={() => void handlePrepareRollback(version)}>
                      <RotateCcw className="h-4 w-4" />
                      回滚到此版本
                    </Button>
                  </div>
                </div>
              );
            })}
          </InnerTableSurface>
        )
      ) : history.length === 0 ? (
        <InnerTableSurface className="min-h-[30rem]" wrapperClassName="flex min-h-[30rem] flex-col">
        <InlineState
          icon={<FileText className="h-5 w-5" />}
          title="没有回滚历史"
          description="当前流程尚未执行过版本回滚，后续操作后会在这里沉淀记录。"
        />
        </InnerTableSurface>
      ) : (
        <InnerTableSurface className="min-h-[30rem]">
          <div className="hidden bg-[var(--cf-surface-muted)] px-4 py-3 text-xs font-medium text-slate-500 dark:bg-slate-900/70 dark:text-slate-400 lg:grid lg:grid-cols-[minmax(0,1fr)_180px_220px_160px] lg:items-center">
            <span>回滚链路</span>
            <span>状态</span>
            <span>时间与操作人</span>
            <span>原因</span>
          </div>

          {history.map((record) => {
            const statusMeta = getRollbackStatusMeta(record.rollbackStatus);

            return (
              <div
                key={record.id}
                className="grid gap-4 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_180px_220px_160px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      v{record.fromVersion} {'->'} v{record.toVersion}
                    </span>
                    <span className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {record.rollbackType === 'MANUAL' ? '手动回滚' : '自动回滚'}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    原始部署 ID {record.originalDeployId}
                  </div>
                  {record.errorMessage ? (
                    <div className="mt-2 text-sm text-rose-600 dark:text-rose-300">{record.errorMessage}</div>
                  ) : null}
                </div>

                <div>
                  <span
                    className={cn(
                      'inline-flex rounded-md px-2.5 py-1 text-[11px] font-semibold',
                      statusMeta.className,
                    )}
                  >
                    {statusMeta.label}
                  </span>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <div>{record.rollbackTime}</div>
                  <div className="mt-1">操作人 · {record.rollbackBy}</div>
                </div>

                <div className="text-sm text-slate-600 dark:text-slate-300">{record.rollbackReason}</div>
              </div>
            );
          })}
        </InnerTableSurface>
      )}

      <BaseDialog
        open={Boolean(snapshotModal)}
        title={snapshotModal ? `版本快照 · v${snapshotModal.version}` : '版本快照'}
        description="查看发布快照的 BPMN、表单配置和节点配置，便于回滚前确认内容。"
        onClose={() => setSnapshotModal(null)}
        maxWidthClassName="max-w-6xl"
      >
        {snapshotModal ? (
          <div className="admin-dialog-stack max-h-[72vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                流程定义 · {snapshotModal.processDefId}
              </span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                版本号 · v{snapshotModal.version}
              </span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                部署 ID · {snapshotModal.deployId}
              </span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                创建时间 · {snapshotModal.createdTime}
              </span>
            </div>

            {snapshotModal.bpmnXml ? (
              <SnapshotCodeBlock
                title="BPMN XML"
                description="这是流程结构的原始 XML 内容，可用于对照流程定义。"
                content={snapshotModal.bpmnXml}
              />
            ) : null}

            {snapshotModal.formConfig ? (
              <SnapshotCodeBlock
                title="表单配置"
                description="回滚前建议确认表单字段和节点引用是否符合目标版本。"
                content={formatJsonSafely(snapshotModal.formConfig)}
              />
            ) : null}

            {snapshotModal.nodeConfig ? (
              <SnapshotCodeBlock
                title="节点配置"
                description="这里会展示审批节点、分支条件等节点级配置。"
                content={formatJsonSafely(snapshotModal.nodeConfig)}
              />
            ) : null}
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(rollbackModal)}
        title={rollbackModal ? `确认回滚到 v${rollbackModal.version.version}` : '确认回滚'}
        description="先阅读影响分析，再填写回滚原因，确保这次恢复动作有完整记录。"
        onClose={() => {
          setRollbackModal(null);
          setRollbackReason('');
          setForceRollback(false);
        }}
        maxWidthClassName="max-w-4xl"
        footer={
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
            <Button onClick={() => void handleRollback()}>
              <RotateCcw className="h-4 w-4" />
              确认回滚
            </Button>
          </div>
        }
      >
        {rollbackModal ? (
          <div className="admin-dialog-stack max-h-[72vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                目标版本 · v{rollbackModal.version.version}
              </span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                部署 ID · {rollbackModal.version.deployId}
              </span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                快照时间 · {rollbackModal.version.createdTime}
              </span>
            </div>

            {rollbackModal.impact ? (
              <SurfaceBlock
                title="影响分析"
                description="根据当前流程状态评估本次回滚可能带来的影响。"
                aside={(
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-3 py-1 text-[11px] font-semibold',
                      getImpactMeta(rollbackModal.impact.overallLevel).className,
                    )}
                  >
                    {React.createElement(getImpactMeta(rollbackModal.impact.overallLevel).icon, {
                      className: 'h-3.5 w-3.5',
                    })}
                    总体风险：{getImpactMeta(rollbackModal.impact.overallLevel).label}
                  </span>
                )}
              >
                {rollbackModal.impact.impacts.length === 0 ? (
                  <InlineState
                    icon={<CheckCircle className="h-5 w-5" />}
                    title="未检测到额外影响"
                    description="系统没有返回具体影响项，可以直接按标准流程执行回滚。"
                  />
                ) : (
                  <div className="grid gap-3">
                    {rollbackModal.impact.impacts.map((impact, index) => {
                      const impactMeta = getImpactMeta(impact.impactLevel);

                      return (
                        <div
                          key={`${impact.impactType}-${index}`}
                          className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="grid gap-2">
                              <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                                {impact.impactType}
                              </div>
                              <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {impact.impactDetail}
                              </div>
                            </div>
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold',
                                impactMeta.className,
                              )}
                            >
                              {React.createElement(impactMeta.icon, { className: 'h-3.5 w-3.5' })}
                              {impactMeta.label}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                影响数量
                              </div>
                              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {impact.impactCount}
                              </div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                建议处理
                              </div>
                              <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {impact.suggestion || '暂无建议'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SurfaceBlock>
            ) : null}

            {!rollbackModal.impact?.allowDeploy ? (
              <div className="rounded-md border border-rose-200 bg-rose-50/90 px-5 py-4 dark:border-rose-900/70 dark:bg-rose-950/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-500 dark:text-rose-300" />
                  <div className="grid gap-2 text-sm leading-6 text-rose-700 dark:text-rose-200">
                    <div className="font-semibold">当前风险较高</div>
                    <div>如果确认业务允许，可以勾选强制回滚；否则建议先处理影响项后再执行。</div>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={forceRollback}
                        onChange={(event) => setForceRollback(event.target.checked)}
                        className="h-4 w-4 rounded border-rose-200 accent-rose-500 dark:border-rose-900"
                      />
                      我已了解风险，仍要强制执行回滚
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                回滚原因 <span className="text-rose-500">*</span>
              </label>
              <Textarea
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
                rows={4}
                placeholder="例如：本次发布导致表单路由异常，需要恢复到上一个稳定版本。"
              />
            </div>
          </div>
        ) : null}
      </BaseDialog>
    </div>
  );
};
