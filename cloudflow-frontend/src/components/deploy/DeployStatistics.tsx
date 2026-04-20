import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle,
  GitBranch,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProcessDefinitions } from '@/services/api/workflow';
import { getDeployStatistics } from '@/services/api/deployEnhancement';

interface DeployStats {
  totalDeploys: number;
  successCount: number;
  rollbackCount: number;
  snapshotCount: number;
  latestVersion: number;
}

interface ProcessOption {
  definitionId?: string | number;
  processName?: string;
  processKey?: string;
}

const formatPercent = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

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
          <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    {children}
  </section>
);

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
    </div>
    <div className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

const ProgressMetric: React.FC<{
  title: string;
  value: string;
  ratioText: string;
  progress: number;
  icon: React.ReactNode;
  progressClassName: string;
}> = ({ title, value, ratioText, progress, icon, progressClassName }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
      {icon}
      {title}
    </div>
    <div className="mt-4 flex items-end justify-between gap-3">
      <div className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 dark:text-slate-500">{ratioText}</div>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
      <div
        className={`h-full rounded-full transition-all duration-300 ${progressClassName}`}
        style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
      />
    </div>
  </div>
);

const SuggestionCard: React.FC<{ content: string }> = ({ content }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-300">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
        <ShieldCheck className="h-4 w-4" />
      </span>
      <span className="leading-6">{content}</span>
    </div>
  </div>
);

export const DeployStatistics: React.FC = () => {
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [stats, setStats] = useState<DeployStats | null>(null);
  const [loading, setLoading] = useState(false);

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

  const loadStatistics = async () => {
    if (!selectedProcess) {
      return;
    }

    try {
      setLoading(true);
      setStats(null);
      const data = await getDeployStatistics(selectedProcess);
      setStats(data as DeployStats);
    } catch (error) {
      setStats(null);
      toast.error('加载发布统计失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcess) {
      void loadStatistics();
    }
  }, [selectedProcess]);

  const selectedProcessMeta = useMemo(
    () => processes.find((item) => String(item.definitionId || '') === selectedProcess),
    [processes, selectedProcess],
  );

  const derived = useMemo(() => {
    const totalDeploys = stats?.totalDeploys || 0;
    const successCount = stats?.successCount || 0;
    const rollbackCount = stats?.rollbackCount || 0;
    const snapshotCount = stats?.snapshotCount || 0;
    const latestVersion = stats?.latestVersion || 0;

    // 统一将后端原始计数转换为治理面板使用的摘要指标。
    const successRate = formatPercent(successCount, totalDeploys);
    const rollbackRate = formatPercent(rollbackCount, totalDeploys);
    const coverageRate = formatPercent(snapshotCount, latestVersion || 0);

    let healthLabel = '待观察';
    let healthSummary = '发布数据还在积累，建议继续观察成功率、回滚率和版本沉淀。';
    let healthBadgeClassName =
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200';

    if (successRate >= 90 && rollbackRate < 10) {
      healthLabel = '优秀';
      healthSummary = '发布成功率稳定且回滚占比低，可以维持当前准入标准。';
      healthBadgeClassName =
        'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200';
    } else if (successRate >= 70) {
      healthLabel = '良好';
      healthSummary = '整体表现可控，但仍建议继续跟踪回滚原因和快照覆盖率。';
      healthBadgeClassName =
        'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200';
    } else if (totalDeploys > 0) {
      healthLabel = '需改进';
      healthSummary = '成功率偏低或回滚偏高，建议优先收紧发布前校验与审批。';
      healthBadgeClassName =
        'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200';
    }

    return {
      totalDeploys,
      successCount,
      rollbackCount,
      snapshotCount,
      latestVersion,
      successRate,
      rollbackRate,
      coverageRate,
      healthLabel,
      healthSummary,
      healthBadgeClassName,
    };
  }, [stats]);

  const suggestions = useMemo(() => {
    const items: string[] = [];

    // 建议区仍沿用原有业务判断，但统一收敛到同一套轻量风险提示语法。
    if (derived.totalDeploys === 0) {
      items.push('当前流程还没有发布记录，建议先完成一次标准发布以沉淀基线数据。');
    }
    if (derived.successRate < 70 && derived.totalDeploys > 0) {
      items.push('发布成功率偏低，建议加强发布前测试、审批和环境校验。');
    }
    if (derived.rollbackRate > 20) {
      items.push('回滚率偏高，建议补强影响分析和上线后监控告警。');
    }
    if (derived.snapshotCount < derived.latestVersion && derived.latestVersion > 0) {
      items.push('快照数少于当前版本数，建议确保每次发布都稳定生成版本快照。');
    }
    if (items.length === 0) {
      items.push('当前发布健康度表现稳定，可以继续保持现有发布流程与准入标准。');
    }

    return items;
  }, [derived]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard
          label="总发布次数"
          value={derived.totalDeploys}
          hint="当前流程累计完成的发布记录"
          icon={<Package className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="成功发布"
          value={derived.successCount}
          hint={`成功率 ${derived.successRate.toFixed(1)}%`}
          icon={<CheckCircle className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="回滚次数"
          value={derived.rollbackCount}
          hint={`回滚率 ${derived.rollbackRate.toFixed(1)}%`}
          icon={<RotateCcw className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="当前版本"
          value={derived.latestVersion > 0 ? `v${derived.latestVersion}` : '暂无'}
          hint={`已沉淀 ${derived.snapshotCount} 个快照`}
          icon={<GitBranch className="h-[18px] w-[18px]" />}
        />
      </div>

      <PanelCard
        title="发布统计"
        description="统一查看流程发布质量、版本沉淀和治理建议，收口到与其它治理模块一致的轻量骨架。"
        aside={
          <Button variant="outline" size="sm" onClick={() => void loadStatistics()} disabled={!selectedProcess}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    选择流程
                  </label>
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

                <div className="space-y-3">
                  <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    统计模块已经回收到与窗口、审批、回滚一致的治理语法，不再额外挂载旧的 Workspace Hero、指标容器和私有信息块。
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        统计口径
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        发布、回滚、快照三类结果统一汇总
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        主题要求
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Light / Dark 同步验收
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前统计对象</div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  流程
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '未选择流程'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  发布健康度
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${derived.healthBadgeClassName}`}
                  >
                    {derived.healthLabel}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    快照覆盖率 {derived.coverageRate.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {derived.healthSummary}
                </div>
              </div>
            </div>
          </div>

          {!selectedProcess ? (
            <InlineState
              icon={<BarChart3 className="h-5 w-5" />}
              title="请先选择流程"
              description="选定流程后才能拉取该流程的发布统计结果。"
            />
          ) : loading ? (
            <InlineState
              title="正在计算发布统计..."
              description="系统正在汇总发布、回滚和版本快照数据。"
              loading
            />
          ) : !stats ? (
            <InlineState
              icon={<BarChart3 className="h-5 w-5" />}
              title="暂无统计数据"
              description="当前流程还没有统计结果，可能尚未发布，或后端未返回统计信息。"
            />
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
                <PanelCard
                  title="发布质量"
                  description="通过成功率、回滚率和健康度标签快速判断当前流程的发布表现。"
                >
                  <div className="space-y-4 px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <ProgressMetric
                        title="发布成功率"
                        value={`${derived.successRate.toFixed(1)}%`}
                        ratioText={`${derived.successCount} / ${derived.totalDeploys || 0}`}
                        progress={derived.successRate}
                        icon={<TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />}
                        progressClassName="bg-gradient-to-r from-emerald-500 to-teal-500"
                      />
                      <ProgressMetric
                        title="回滚占比"
                        value={`${derived.rollbackRate.toFixed(1)}%`}
                        ratioText={`${derived.rollbackCount} / ${derived.totalDeploys || 0}`}
                        progress={derived.rollbackRate}
                        icon={<RotateCcw className="h-4 w-4 text-amber-500 dark:text-amber-300" />}
                        progressClassName="bg-gradient-to-r from-amber-400 to-orange-500"
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            发布健康度
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                            {derived.healthSummary}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${derived.healthBadgeClassName}`}
                        >
                          {derived.healthLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </PanelCard>

                <PanelCard
                  title="版本信号"
                  description="观察版本迭代速度、快照覆盖率和流程发布节奏。"
                >
                  <div className="space-y-4 px-4 py-4">
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-5 py-5 shadow-sm dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:shadow-none">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前版本</div>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-cyan-700 dark:text-cyan-200">
                        {derived.latestVersion > 0 ? `v${derived.latestVersion}` : '--'}
                      </div>
                      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        已生成 {derived.snapshotCount} 个版本快照
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          平均发布密度
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {derived.latestVersion > 0
                            ? `${(derived.totalDeploys / Math.max(derived.latestVersion, 1)).toFixed(1)} 次 / 版本`
                            : '暂无数据'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          快照覆盖率
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {derived.latestVersion > 0 ? `${derived.coverageRate.toFixed(1)}%` : '暂无数据'}
                        </div>
                      </div>
                    </div>
                  </div>
                </PanelCard>
              </div>

              <PanelCard
                title="发布建议"
                description="根据当前统计结果自动给出治理建议，帮助你判断是否需要调整流程。"
              >
                <div className="space-y-3 px-4 py-4">
                  {suggestions.map((item, index) => (
                    <SuggestionCard key={`${item}-${index}`} content={item} />
                  ))}
                </div>
              </PanelCard>
            </>
          )}
        </div>
      </PanelCard>
    </div>
  );
};
