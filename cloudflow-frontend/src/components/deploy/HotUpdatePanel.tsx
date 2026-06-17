import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  analyzeHotUpdate,
  prepareHotUpdate,
  executeHotUpdate,
  getHotUpdateHistory,
  type HotUpdateResult,
  type HotUpdateRecord,
} from '@/services/api/workflow';
import { Button, Input, Label } from '@/components/common';
import {
  HOT_UPDATE_MODE_OPTIONS,
  type MigrationMode,
  getHotUpdateRecordSummary,
  getHotUpdateStatusMeta,
} from './hotUpdateUi';

const shouldRequireConfirm = (result: HotUpdateResult | null) =>
  Boolean(result && result.totalInstances > 0);

const SummaryMiniCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  toneClassName: string;
}> = ({ label, value, icon, toneClassName }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClassName}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
        <div className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</div>
      </div>
    </div>
  </div>
);

const PanelCard: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, aside, children }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

export const HotUpdatePanel: React.FC = () => {
  const [processKey, setProcessKey] = useState('');
  const [mode, setMode] = useState<MigrationMode>('COMPATIBLE');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [result, setResult] = useState<HotUpdateResult | null>(null);
  const [history, setHistory] = useState<HotUpdateRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const modeMeta = useMemo(
    () => HOT_UPDATE_MODE_OPTIONS.find((item) => item.value === mode) || HOT_UPDATE_MODE_OPTIONS[0],
    [mode],
  );

  const resetExecutionState = () => {
    setResult(null);
    setConfirmed(false);
    setConfirmToken(null);
  };

  const handleAnalyze = async () => {
    if (!processKey.trim()) {
      toast.error('请输入流程 Key');
      return;
    }
    setLoading(true);
    setConfirmed(false);
    setConfirmToken(null);
    try {
      const res = await analyzeHotUpdate({ processKey: processKey.trim(), migrationMode: mode });
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
      toast.error('请先勾选确认');
      return;
    }
    setLoading(true);
    try {
      const res = await prepareHotUpdate({ processKey: processKey.trim(), migrationMode: mode });
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
      const res = await executeHotUpdate({ confirmToken, processKey: processKey.trim(), migrationMode: mode });
      setResult(res);
      toast.success(res.message || '热更新完成');
      setConfirmed(false);
      setConfirmToken(null);
    } catch (e: any) {
      toast.error(e.message || '执行失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadHistory = async () => {
    if (!processKey.trim()) {
      toast.error('请先输入流程 Key');
      return;
    }
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const records = await getHotUpdateHistory(processKey.trim());
      setHistory(records);
    } catch (e: any) {
      toast.error(e.message || '加载历史失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PanelCard
        title="流程热更新"
        description="先分析影响，再生成一次性确认令牌，最后执行迁移。"
        aside={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadHistory}
              disabled={!processKey.trim() || historyLoading}
            >
              {historyLoading ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
              历史
            </Button>
            <Button size="sm" onClick={handleAnalyze} disabled={loading || !processKey.trim()}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              分析影响
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label htmlFor="hotupdate-process-key" className="text-slate-700 dark:text-slate-200">
                  流程 Key
                </Label>
                <Input
                  id="hotupdate-process-key"
                  value={processKey}
                  onChange={(event) => {
                    setProcessKey(event.target.value);
                    resetExecutionState();
                  }}
                  placeholder="如 purchase_request 或 leave_apply"
                />
                <div className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  使用流程定义唯一 Key 作为热更新目标。
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">当前模式</div>
                <div className={`mt-1 flex items-center gap-2 text-sm font-semibold ${modeMeta.accentClassName}`}>
                  {modeMeta.icon}
                  {modeMeta.label}
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {modeMeta.summary}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {HOT_UPDATE_MODE_OPTIONS.map((option) => {
                const active = mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setMode(option.value);
                      resetExecutionState();
                    }}
                    className={[
                      'rounded-xl border px-4 py-3 text-left',
                      option.cardClassName,
                      active
                        ? 'ring-2 ring-[rgba(20,184,166,0.24)]'
                        : 'cf-interactive-card opacity-90 hover:opacity-100',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {option.icon}
                        {option.label}
                      </div>
                      <span className="rounded-full border border-current/10 bg-white/70 px-2 py-0.5 text-[10px] dark:bg-slate-950/40">
                        {option.badge}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-5 opacity-85">{option.description}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={handleAnalyze} disabled={loading || !processKey.trim()}>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <SummaryMiniCard
              label="影响实例"
              value={result?.totalInstances ?? 0}
              icon={<Clock3 size={18} />}
              toneClassName="bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200"
            />
            <SummaryMiniCard
              label="预计迁移"
              value={result?.migratedCount ?? 0}
              icon={<RefreshCw size={18} />}
              toneClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
            />
            <SummaryMiniCard
              label="需人工关注"
              value={(result?.failedCount ?? 0) + (result?.skippedCount ?? 0)}
              icon={<AlertTriangle size={18} />}
              toneClassName="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
            />
          </div>
        </div>
      </PanelCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.9fr)]">
        <PanelCard
          title="实例明细"
          description="按实例查看迁移结果、当前节点与失败原因。"
        >
          {result?.details.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="max-h-[28rem] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                    <tr className="text-left text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 font-medium">流程编号</th>
                      <th className="px-4 py-3 font-medium">当前节点</th>
                      <th className="px-4 py-3 font-medium">状态</th>
                      <th className="px-4 py-3 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.details.map((item) => {
                      const statusMeta = getHotUpdateStatusMeta(item.status);
                      return (
                        <tr key={item.instanceId} className="bg-white dark:bg-slate-950/40">
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {item.processNo || item.instanceId.slice(0, 8)}
                            </div>
                            <div className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
                              {item.instanceId}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                            {item.currentNodeTitle || item.currentNodeKey || '-'}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}
                            >
                              {statusMeta.icon}
                              {statusMeta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400">
                            {item.reason || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              先执行影响分析，再查看实例结果。
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="分析结果"
          description={
            result
              ? result.message || '影响分析已返回'
              : '版本跨度、迁移结果和执行确认会显示在这里。'
          }
        >
          <div className="space-y-4">
            {result ? (
              <>
                <div
                  className={[
                    'rounded-xl border px-4 py-3',
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
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>版本迁移</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-950">
                        V{result.fromVersion}
                      </span>
                      <ArrowRight size={12} />
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-950">
                        V{result.toVersion}
                      </span>
                    </div>
                  ) : null}
                  {confirmToken ? (
                    <div className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                      已生成一次性确认令牌，请在 {result.confirmExpireSeconds || 30} 秒内执行热更新。
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SummaryMiniCard
                    label="已迁移"
                    value={result.migratedCount}
                    icon={<RefreshCw size={16} />}
                    toneClassName="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                  />
                  <SummaryMiniCard
                    label="已跳过"
                    value={result.skippedCount}
                    icon={<Clock3 size={16} />}
                    toneClassName="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <SummaryMiniCard
                    label="失败"
                    value={result.failedCount}
                    icon={<AlertTriangle size={16} />}
                    toneClassName="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200"
                  />
                  <SummaryMiniCard
                    label="总实例"
                    value={result.totalInstances}
                    icon={<Search size={16} />}
                    toneClassName="bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200"
                  />
                </div>

                {shouldRequireConfirm(result) ? (
                  <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
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
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                先输入流程 Key 并选择迁移模式。
              </div>
            )}
          </div>
        </PanelCard>
      </div>

      {showHistory ? (
        <PanelCard
          title="热更新历史"
          description="按流程 Key 查看既往迁移记录。"
        >
          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-8 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              正在加载历史记录
            </div>
          ) : history.length > 0 ? (
            <div className="space-y-3">
              {history.map((record) => {
                const summary = getHotUpdateRecordSummary(record);
                return (
                  <div
                    key={record.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
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
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              暂无热更新记录。
            </div>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
};
