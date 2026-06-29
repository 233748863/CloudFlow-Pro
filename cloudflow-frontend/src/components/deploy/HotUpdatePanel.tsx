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
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { cn } from '@/utils/cn';
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
  <article className="admin-source-stat rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] shadow-none dark:border-slate-800 dark:bg-slate-950">
    <div className={`admin-source-stat-icon ${toneClassName}`}>{icon}</div>
    <div className="min-w-0">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  </article>
);

const SurfaceBlock: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  wrapperClassName?: string;
}> = ({ title, description, aside, children, className, contentClassName, wrapperClassName }) => (
  <InnerTableSurface className={className} wrapperClassName={cn('p-0', wrapperClassName)}>
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    <div className={cn('p-4', contentClassName)}>{children}</div>
  </InnerTableSurface>
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
    <div className="admin-source-content-grid">
      <SurfaceBlock
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
        <div className="grid gap-4">
          <div className="admin-source-content-grid">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="admin-dialog-field">
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

              <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
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
                    data-active={active ? 'true' : 'false'}
                    onClick={() => {
                      setMode(option.value);
                      resetExecutionState();
                    }}
                    className={[
                      'rounded-md border px-4 py-3 text-left transition-colors',
                      option.cardClassName,
                      active
                        ? ''
                        : 'admin-option-surface',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {option.icon}
                        {option.label}
                      </div>
                      <span className="rounded-md border border-current/15 bg-[var(--cf-surface-muted)] px-2 py-0.5 text-[10px] dark:bg-slate-900">
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

          <div className="grid gap-3 sm:grid-cols-3">
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
      </SurfaceBlock>

      <div className="grid gap-4">
        <SurfaceBlock
          title="实例明细"
          description="按实例查看迁移结果、当前节点与失败原因。"
          contentClassName="p-0"
        >
          {result?.details.length ? (
            <table className="unity-data-table admin-source-table min-w-[760px]">
              <thead className="sticky top-0">
                <tr>
                  <th>流程编号</th>
                  <th>当前节点</th>
                  <th>状态</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {result.details.map((item) => {
                  const statusMeta = getHotUpdateStatusMeta(item.status);
                  return (
                    <tr key={item.instanceId}>
                      <td className="align-top">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.processNo || item.instanceId.slice(0, 8)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
                          {item.instanceId}
                        </div>
                      </td>
                      <td className="align-top text-slate-600 dark:text-slate-300">
                        {item.currentNodeTitle || item.currentNodeKey || '-'}
                      </td>
                      <td className="align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}
                        >
                          {statusMeta.icon}
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="align-top text-slate-500 dark:text-slate-400">
                        {item.reason || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              先执行影响分析，再查看实例结果。
            </div>
          )}
        </SurfaceBlock>

        <SurfaceBlock
          title="分析结果"
          description={
            result
              ? result.message || '影响分析已返回'
              : '版本跨度、迁移结果和执行确认会显示在这里。'
          }
        >
          <div className="admin-source-content-grid">
            {result ? (
              <>
                <div
                  className={[
                    'rounded-md border px-4 py-3',
                    result.success
                        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
                      : 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20',
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
                      <span className="badge badge-gray">
                        V{result.fromVersion}
                      </span>
                      <ArrowRight size={12} />
                      <span className="badge badge-gray">
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
                    toneClassName="bg-[var(--cf-surface-muted)] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
                  <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100">
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
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                先输入流程 Key 并选择迁移模式。
              </div>
            )}
          </div>
        </SurfaceBlock>
      </div>

      {showHistory ? (
        <SurfaceBlock
          title="热更新历史"
          description="按流程 Key 查看既往迁移记录。"
          contentClassName="p-0"
        >
          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              正在加载历史记录
            </div>
          ) : history.length > 0 ? (
            <table className="unity-data-table admin-source-table min-w-[760px]">
              <thead>
                <tr>
                  <th>版本</th>
                  <th>迁移模式</th>
                  <th>执行信息</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => {
                  const summary = getHotUpdateRecordSummary(record);
                  return (
                    <tr key={record.id}>
                      <td className="font-medium text-slate-900 dark:text-slate-100">{summary.title}</td>
                      <td>{summary.modeLabel}</td>
                      <td>
                        <div>{summary.executedAt}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">执行人 {record.executedBy || '-'}</div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="badge border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                            迁移 {record.migratedCount}
                          </span>
                          <span className="badge badge-gray">跳过 {record.skippedCount}</span>
                          <span className="badge border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-300">
                            失败 {record.failedCount}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              暂无热更新记录。
            </div>
          )}
        </SurfaceBlock>
      ) : null}
    </div>
  );
};
