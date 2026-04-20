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

    let healthLabel = '待观察';
    let healthTone = 'text-amber-600';

    if (successRate >= 90 && rollbackRate < 10) {
      healthLabel = '优秀';
      healthTone = 'text-emerald-600';
    } else if (successRate >= 70) {
      healthLabel = '良好';
      healthTone = 'text-sky-600';
    } else if (totalDeploys > 0) {
      healthLabel = '需改进';
      healthTone = 'text-rose-600';
    }

    return {
      totalDeploys,
      successCount,
      rollbackCount,
      snapshotCount,
      latestVersion,
      successRate,
      rollbackRate,
      healthLabel,
      healthTone,
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
        headerAside={
          <Button variant="outline" size="sm" onClick={loadStatistics}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:items-end">
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

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            当前统计对象：
            <span className="ml-2 font-semibold text-slate-700">
              {selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '未选择流程'}
            </span>
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
              aside={<Package className="h-[18px] w-[18px] text-cyan-700" />}
            />
            <WorkspaceMetricCard
              label="成功发布"
              value={derived.successCount}
              hint={`成功率 ${derived.successRate.toFixed(1)}%`}
              aside={<CheckCircle className="h-[18px] w-[18px] text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="回滚次数"
              value={derived.rollbackCount}
              hint={`回滚率 ${derived.rollbackRate.toFixed(1)}%`}
              aside={<RotateCcw className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="当前版本"
              value={derived.latestVersion > 0 ? `v${derived.latestVersion}` : '暂无'}
              hint={`已沉淀 ${derived.snapshotCount} 个快照`}
              aside={<GitBranch className="h-[18px] w-[18px] text-sky-500" />}
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
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    发布成功率
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="text-3xl font-bold tracking-tight text-slate-900">
                      {derived.successRate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-400">{derived.successCount} / {derived.totalDeploys || 0}</div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${derived.successRate}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <RotateCcw className="h-4 w-4 text-amber-500" />
                    回滚占比
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="text-3xl font-bold tracking-tight text-slate-900">
                      {derived.rollbackRate.toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-400">{derived.rollbackCount} / {derived.totalDeploys || 0}</div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${derived.rollbackRate}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200/70">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">发布健康度</div>
                    <div className="mt-1 text-xs text-slate-400">综合成功率与回滚率得出的当前健康等级</div>
                  </div>
                  <div className={`text-3xl font-bold tracking-tight ${derived.healthTone}`}>
                    {derived.healthLabel}
                  </div>
                </div>
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="版本沉淀"
              description="观察版本迭代速度、快照覆盖率和流程发布节奏。"
              eyebrow="Version Signal"
              bodyClassName="space-y-4"
            >
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-5 shadow-sm ring-1 ring-cyan-200/70">
                <div className="text-sm font-semibold text-slate-700">当前版本</div>
                <div className="mt-3 text-4xl font-bold tracking-tight text-cyan-700">
                  {derived.latestVersion > 0 ? `v${derived.latestVersion}` : '--'}
                </div>
                <div className="mt-2 text-sm text-slate-500">已生成 {derived.snapshotCount} 个版本快照</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  <div className="text-xs text-slate-400">平均发布密度</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {derived.latestVersion > 0
                      ? `${(derived.totalDeploys / Math.max(derived.latestVersion, 1)).toFixed(1)} 次 / 版本`
                      : '暂无数据'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  <div className="text-xs text-slate-400">快照覆盖率</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {derived.latestVersion > 0
                      ? `${getPercent(derived.snapshotCount, derived.latestVersion)}%`
                      : '暂无数据'}
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
              <div
                key={`${item}-${index}`}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm"
              >
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
                <span>{item}</span>
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
