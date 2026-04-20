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
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
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

const getPercent = (numerator: number, denominator: number) =>
  denominator > 0 ? ((numerator / denominator) * 100).toFixed(1) : '0.0';

const cardClassName =
  'rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-200/60 transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none';
const softPanelClassName =
  'rounded-3xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none';
const infoBlockClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70';

const ProgressMetric = ({
  title,
  icon,
  value,
  ratioText,
  progress,
  progressClassName,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  ratioText: string;
  progress: number;
  progressClassName: string;
}) => (
  <div className={cardClassName}>
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
      {icon}
      {title}
    </div>
    <div className="mt-4 flex items-end justify-between gap-3">
      <div className="text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-100">{value}</div>
      <div className="text-sm text-slate-400 dark:text-slate-500">{ratioText}</div>
    </div>
    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
      <div
        className={`h-full rounded-full transition-all duration-500 ${progressClassName}`}
        style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
      />
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
      const data = await getDeployStatistics(selectedProcess);
      setStats(data as DeployStats);
    } catch (error) {
      toast.error('加载发布统计失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcess) {
      loadStatistics();
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
    const successRate = Number(getPercent(successCount, totalDeploys));
    const rollbackRate = Number(getPercent(rollbackCount, totalDeploys));
    const coverageRate = Number(getPercent(snapshotCount, latestVersion || 0));

    let healthLabel = '待观察';
    let healthTone = 'text-amber-600 dark:text-amber-300';
    let healthSummary = '发布数据还在积累，建议继续观察成功率与回滚率。';

    if (successRate >= 90 && rollbackRate < 10) {
      healthLabel = '优秀';
      healthTone = 'text-emerald-600 dark:text-emerald-300';
      healthSummary = '发布成功率稳定且回滚占比低，可以维持当前准入标准。';
    } else if (successRate >= 70) {
      healthLabel = '良好';
      healthTone = 'text-sky-600 dark:text-sky-300';
      healthSummary = '整体表现可控，但仍建议继续监控回滚原因与快照覆盖率。';
    } else if (totalDeploys > 0) {
      healthLabel = '需改进';
      healthTone = 'text-rose-600 dark:text-rose-300';
      healthSummary = '成功率偏低或回滚偏高，建议优先收紧发布前校验与审批。';
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
      healthTone,
      healthSummary,
    };
  }, [stats]);

  const suggestions = useMemo(() => {
    const items: string[] = [];

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
    <div className="space-y-5">
      <WorkspaceSectionCard
        title="统计范围"
        description="选择流程后查看该流程的发布成功率、回滚情况和版本沉淀情况。"
        eyebrow="Analytics Scope"
        headerAside={(
          <Button variant="outline" size="sm" onClick={loadStatistics}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        )}
        bodyClassName="space-y-5"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={softPanelClassName}>
            <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-end">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">选择流程</label>
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

              <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                发布统计页已经统一到工作台比例，指标卡、进度条和建议卡全部使用同一套明暗主题语法。
              </div>
            </div>
          </div>

          <div className={softPanelClassName}>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前统计对象</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  流程
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '未选择流程'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                统计区只负责结果表达，不再保留旧页面里零散的颜色、比例和局部信息块。
              </div>
            </div>
          </div>
        </div>
      </WorkspaceSectionCard>

      {!selectedProcess ? (
        <WorkspaceInlineState
          icon={<BarChart3 className="h-5 w-5" />}
          title="请先选择流程"
          description="选定流程后才能拉取该流程的发布统计结果。"
          className="py-16"
        />
      ) : loading ? (
        <WorkspaceInlineState
          type="loading"
          title="正在计算发布统计..."
          description="系统正在汇总发布、回滚和版本快照数据。"
          className="py-16"
        />
      ) : stats ? (
        <>
          <div className="grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="总发布次数"
              value={derived.totalDeploys}
              hint="当前流程累计部署次数"
              aside={<Package className="h-[18px] w-[18px] text-cyan-700 dark:text-cyan-300" />}
            />
            <WorkspaceMetricCard
              label="成功发布"
              value={derived.successCount}
              hint={`成功率 ${derived.successRate.toFixed(1)}%`}
              aside={<CheckCircle className="h-[18px] w-[18px] text-emerald-500 dark:text-emerald-300" />}
            />
            <WorkspaceMetricCard
              label="回滚次数"
              value={derived.rollbackCount}
              hint={`回滚率 ${derived.rollbackRate.toFixed(1)}%`}
              aside={<RotateCcw className="h-[18px] w-[18px] text-amber-500 dark:text-amber-300" />}
            />
            <WorkspaceMetricCard
              label="当前版本"
              value={derived.latestVersion > 0 ? `v${derived.latestVersion}` : '暂无'}
              hint={`已沉淀 ${derived.snapshotCount} 个快照`}
              aside={<GitBranch className="h-[18px] w-[18px] text-sky-500 dark:text-sky-300" />}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
            <WorkspaceSectionCard
              title="发布质量"
              description="通过成功率、回滚率和健康度标签快速判断当前流程的发布表现。"
              eyebrow="Quality Score"
              bodyClassName="space-y-5"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <ProgressMetric
                  title="发布成功率"
                  icon={<TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />}
                  value={`${derived.successRate.toFixed(1)}%`}
                  ratioText={`${derived.successCount} / ${derived.totalDeploys || 0}`}
                  progress={derived.successRate}
                  progressClassName="bg-gradient-to-r from-emerald-500 to-teal-500"
                />
                <ProgressMetric
                  title="回滚占比"
                  icon={<RotateCcw className="h-4 w-4 text-amber-500 dark:text-amber-300" />}
                  value={`${derived.rollbackRate.toFixed(1)}%`}
                  ratioText={`${derived.rollbackCount} / ${derived.totalDeploys || 0}`}
                  progress={derived.rollbackRate}
                  progressClassName="bg-gradient-to-r from-amber-400 to-orange-500"
                />
              </div>

              <div className={cardClassName}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">发布健康度</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {derived.healthSummary}
                    </div>
                  </div>
                  <div className={`text-3xl font-bold tracking-tight ${derived.healthTone}`}>{derived.healthLabel}</div>
                </div>
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="版本沉淀"
              description="观察版本迭代速度、快照覆盖率和流程发布节奏。"
              eyebrow="Version Signal"
              bodyClassName="space-y-4"
            >
              <div className="rounded-[28px] border border-cyan-200 bg-cyan-50 px-5 py-5 shadow-sm shadow-cyan-100/60 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:shadow-none">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">当前版本</div>
                <div className="mt-3 text-4xl font-bold tracking-tight text-cyan-700 dark:text-cyan-200">
                  {derived.latestVersion > 0 ? `v${derived.latestVersion}` : '--'}
                </div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  已生成 {derived.snapshotCount} 个版本快照
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className={infoBlockClassName}>
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    平均发布密度
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {derived.latestVersion > 0
                      ? `${(derived.totalDeploys / Math.max(derived.latestVersion, 1)).toFixed(1)} 次 / 版本`
                      : '暂无数据'}
                  </div>
                </div>
                <div className={infoBlockClassName}>
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    快照覆盖率
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {derived.latestVersion > 0 ? `${derived.coverageRate.toFixed(1)}%` : '暂无数据'}
                  </div>
                </div>
              </div>
            </WorkspaceSectionCard>
          </div>

          <WorkspaceSectionCard
            title="发布建议"
            description="根据当前统计结果自动给出治理建议，帮助你判断是否需要调整流程。"
            eyebrow="Recommendation"
            bodyClassName="space-y-3"
          >
            {suggestions.map((item, index) => (
              <div key={`${item}-${index}`} className={cardClassName}>
                <div className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
                  <span>{item}</span>
                </div>
              </div>
            ))}
          </WorkspaceSectionCard>
        </>
      ) : (
        <WorkspaceInlineState
          icon={<BarChart3 className="h-5 w-5" />}
          title="暂无统计数据"
          description="当前流程还没有统计结果，可能尚未发布，或后端未返回统计信息。"
          className="py-16"
        />
      )}
    </div>
  );
};
