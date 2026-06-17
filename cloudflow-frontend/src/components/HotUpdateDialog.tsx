import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  analyzeHotUpdate,
  prepareHotUpdate,
  executeHotUpdate,
  getHotUpdateHistory,
  type HotUpdateResult,
  type HotUpdateRecord,
} from '@/services/api/workflow';
import { Button } from '@/components/common';
import {
  WorkspaceDialogShell,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace';
import {
  HOT_UPDATE_MODE_OPTIONS,
  type MigrationMode,
  getHotUpdateRecordSummary,
  getHotUpdateStatusMeta,
} from '@/components/deploy/hotUpdateUi';

interface HotUpdateDialogProps {
  open: boolean;
  onClose: () => void;
  processKey: string;
  processName?: string;
}

const shouldRequireConfirm = (result: HotUpdateResult | null) =>
  Boolean(result && result.totalInstances > 0);

export const HotUpdateDialog: React.FC<HotUpdateDialogProps> = ({
  open,
  onClose,
  processKey,
  processName,
}) => {
  const [mode, setMode] = useState<MigrationMode>('COMPATIBLE');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [result, setResult] = useState<HotUpdateResult | null>(null);
  const [history, setHistory] = useState<HotUpdateRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'execute' | 'history'>('execute');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const modeMeta = useMemo(
    () => HOT_UPDATE_MODE_OPTIONS.find((item) => item.value === mode) || HOT_UPDATE_MODE_OPTIONS[0],
    [mode],
  );

  if (!open) return null;

  const resetExecutionState = () => {
    setResult(null);
    setConfirmed(false);
    setConfirmToken(null);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setConfirmed(false);
    setConfirmToken(null);
    try {
      const res = await analyzeHotUpdate({ processKey, migrationMode: mode });
      setResult(res);
      if (res.totalInstances === 0) {
        toast.info(res.message || '没有需要迁移的运行中实例');
      }
    } catch (e: any) {
      toast.error(e.message || '分析失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePrepare = async () => {
    if (!result) {
      toast.error('请先完成影响分析');
      return;
    }
    if (!confirmed) {
      toast.error('请先确认执行');
      return;
    }
    setLoading(true);
    try {
      const res = await prepareHotUpdate({ processKey, migrationMode: mode });
      setResult(res);
      setConfirmToken(res.confirmToken || null);
      if (res.confirmToken) {
        toast.success(`已生成确认令牌，请在 ${res.confirmExpireSeconds || 30} 秒内执行热更新`);
      } else {
        toast.info(res.message || '没有需要执行的热更新');
      }
    } catch (e: any) {
      toast.error(e.message || '生成确认令牌失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!confirmToken) {
      toast.error('请先生成确认令牌');
      return;
    }
    setLoading(true);
    try {
      const res = await executeHotUpdate({ confirmToken, processKey, migrationMode: mode });
      setResult(res);
      setConfirmed(false);
      setConfirmToken(null);
      toast.success(res.message || '热更新完成');
    } catch (e: any) {
      toast.error(e.message || '执行失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadHistory = async () => {
    setActiveTab('history');
    setHistoryLoading(true);
    try {
      const records = await getHotUpdateHistory(processKey);
      setHistory(records);
    } catch (e: any) {
      toast.error(e.message || '加载历史失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <WorkspaceDialogShell
      title="流程热更新"
      description={`${processName || processKey} · 运行中实例迁移到最新版本`}
      onClose={onClose}
      maxWidthClassName="w-full sm:max-w-4xl lg:max-w-5xl"
      bodyClassName="overflow-y-auto !px-0 !py-0"
      headerAside={(
        <div className="hidden items-center gap-2 rounded-full border border-cyan-200/70 bg-cyan-50/90 px-3 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200 md:inline-flex">
          <Sparkles size={14} />
          Hot Update
        </div>
      )}
    >
      <div className="space-y-4 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_26%),linear-gradient(180deg,rgba(248,250,252,0.74),rgba(255,255,255,0.88))] px-4 py-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.74),rgba(2,6,23,0.92))] sm:px-6 sm:py-5">
        <div className="grid gap-3 md:grid-cols-3">
          <WorkspaceMetricCard label="流程 Key" value={processKey} hint="迁移目标定义" />
          <WorkspaceMetricCard label="当前模式" value={modeMeta.label} hint={modeMeta.summary} />
          <WorkspaceMetricCard
            label="影响实例"
            value={result?.totalInstances ?? 0}
            hint={result ? '分析结果已返回' : '等待分析'}
          />
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/85 p-1.5 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-950/70">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeTab === 'execute' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('execute')}
            >
              执行热更新
            </Button>
            <Button
              variant={activeTab === 'history' ? 'default' : 'ghost'}
              size="sm"
              onClick={handleLoadHistory}
            >
              {historyLoading ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
              历史记录
            </Button>
          </div>
        </div>

        {activeTab === 'execute' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <WorkspaceSectionCard
              eyebrow="Mode"
              title="迁移模式"
              description="同一套模式定义与发布管理页保持一致，避免弹窗和主入口语义分叉。"
              bodyClassName="space-y-3"
            >
              {HOT_UPDATE_MODE_OPTIONS.map((option) => {
                const active = option.value === mode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setMode(option.value);
                      resetExecutionState();
                    }}
                    className={[
                      'w-full rounded-2xl border p-4 text-left',
                      option.cardClassName,
                      active
                        ? 'ring-2 ring-[rgba(20,184,166,0.28)] shadow-[0_16px_36px_rgba(15,23,42,0.08)] dark:shadow-[0_16px_40px_rgba(2,6,23,0.28)]'
                        : 'cf-interactive-card opacity-88 hover:opacity-100',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {option.icon}
                        {option.label}
                      </div>
                      <span className="rounded-full border border-current/10 bg-white/70 px-2 py-0.5 text-[10px] font-semibold dark:bg-slate-950/40">
                        {option.badge}
                      </span>
                    </div>
                    <div className="mt-3 text-sm font-medium">{option.summary}</div>
                    <div className="mt-1 text-xs leading-5 opacity-80">{option.description}</div>
                  </button>
                );
              })}
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              eyebrow="Result"
              title="分析与执行"
              description={
                result
                  ? result.message || '分析完成'
                  : '先分析影响，再生成确认令牌并执行热更新。'
              }
              bodyClassName="space-y-4"
              headerAside={(
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAnalyze} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    分析影响
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrepare}
                    disabled={loading || !result || !confirmed || !!confirmToken}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                    生成确认令牌
                  </Button>
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={handleExecute}
                    disabled={loading || !confirmToken}
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    执行热更新
                  </Button>
                </div>
              )}
            >
              {result ? (
                <>
                  <div
                    className={[
                      'rounded-2xl border px-4 py-4',
                      result.success
                        ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-500/20 dark:bg-emerald-500/10'
                        : 'border-rose-200 bg-rose-50/90 dark:border-rose-500/20 dark:bg-rose-500/10',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {result.success ? (
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-300" />
                      ) : (
                        <AlertTriangle size={16} className="text-rose-600 dark:text-rose-300" />
                      )}
                      <span className="text-slate-900 dark:text-slate-100">{result.message || '分析完成'}</span>
                    </div>
                    {result.fromVersion > 0 ? (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        版本迁移：V{result.fromVersion} {'->'} V{result.toVersion}
                      </div>
                    ) : null}
                    {confirmToken ? (
                      <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                        已生成一次性确认令牌，请在 {result.confirmExpireSeconds || 30} 秒内执行热更新。
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <WorkspaceMetricCard label="总实例" value={result.totalInstances} />
                    <WorkspaceMetricCard label="已迁移" value={result.migratedCount} />
                    <WorkspaceMetricCard label="已跳过" value={result.skippedCount} />
                    <WorkspaceMetricCard label="失败" value={result.failedCount} />
                  </div>

                  {result.details.length > 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                      <div className="max-h-64 overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead className="sticky top-0 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95">
                            <tr className="text-left text-slate-500 dark:text-slate-400">
                              <th className="px-4 py-3 font-medium">流程编号</th>
                              <th className="px-4 py-3 font-medium">当前节点</th>
                              <th className="px-4 py-3 font-medium">状态</th>
                              <th className="px-4 py-3 font-medium">原因</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {result.details.map((item) => {
                              const statusMeta = getHotUpdateStatusMeta(item.status);
                              return (
                                <tr
                                  key={item.instanceId}
                                  className="bg-white/90 transition-colors hover:bg-slate-50/90 dark:bg-slate-950/40 dark:hover:bg-slate-900/70"
                                >
                                  <td className="px-4 py-3">
                                    {item.processNo || item.instanceId.slice(0, 8)}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                    {item.currentNodeTitle || item.currentNodeKey || '-'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}
                                    >
                                      {statusMeta.icon}
                                      {statusMeta.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                    {item.reason || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {shouldRequireConfirm(result) ? (
                    <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="leading-6">
                        我确认要执行热更新，了解此操作会影响 {result.totalInstances} 个运行中实例，并且必须使用一次性确认令牌执行。
                      </span>
                    </label>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                  先执行影响分析，再在这里确认迁移结果。
                </div>
              )}
            </WorkspaceSectionCard>
          </div>
        ) : (
          <WorkspaceSectionCard
            eyebrow="History"
            title="热更新历史"
            description="查看这个流程 Key 的既往迁移记录。"
            bodyClassName="space-y-3"
          >
            {historyLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                正在加载历史记录
              </div>
            ) : history.length > 0 ? (
              history.map((record) => {
                const summary = getHotUpdateRecordSummary(record);
                return (
                  <div
                    key={record.id}
                    className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {summary.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {summary.modeLabel} · {summary.executedAt} · 执行人 {record.executedBy || '-'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                          迁移 {record.migratedCount}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          跳过 {record.skippedCount}
                        </span>
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                          失败 {record.failedCount}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                暂无热更新记录。
              </div>
            )}
          </WorkspaceSectionCard>
        )}
      </div>
    </WorkspaceDialogShell>
  );
};
