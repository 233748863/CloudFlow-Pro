import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { Button } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common/select';
import { cn } from '@/utils/cn';
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

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={cn(
      'overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800',
      className,
    )}
  >
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={cn(
      'flex flex-col gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:gap-4',
      alignStart ? 'sm:items-start' : 'sm:items-center',
    )}
  >
    <div className="w-24 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    <div
      className={cn(
        'min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200',
        alignStart ? '' : 'sm:text-right',
      )}
    >
      {value}
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
      toast.error(getErrorMessage(error, '加载流程列表失败'));
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
      toast.error(getErrorMessage(error, '加载发布统计失败'));
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
    const successRate = formatPercent(successCount, totalDeploys);
    const rollbackRate = formatPercent(rollbackCount, totalDeploys);
    const coverageRate = formatPercent(snapshotCount, latestVersion || 0);

    let healthLabel = '待观察';

    if (successRate >= 90 && rollbackRate < 10) {
      healthLabel = '优秀';
    } else if (successRate >= 70) {
      healthLabel = '良好';
    } else if (totalDeploys > 0) {
      healthLabel = '需改进';
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
      deployDensity:
        latestVersion > 0 ? (totalDeploys / Math.max(latestVersion, 1)).toFixed(1) : '--',
    };
  }, [stats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="w-full sm:w-72">
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span>{selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '未选择流程'}</span>
          <span>发布 {derived.totalDeploys}</span>
          <span>成功率 {derived.successRate.toFixed(1)}%</span>
          <span>回滚率 {derived.rollbackRate.toFixed(1)}%</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadStatistics()} disabled={!selectedProcess}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {!selectedProcess ? (
        <InlineState icon={<BarChart3 className="h-5 w-5" />} title="请先选择流程" />
      ) : loading ? (
        <InlineState title="正在读取发布统计" loading />
      ) : !stats ? (
        <InlineState icon={<BarChart3 className="h-5 w-5" />} title="暂无统计数据" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="hidden bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 dark:bg-slate-900/70 dark:text-slate-400 md:grid md:grid-cols-[160px_140px_minmax(0,1fr)] md:items-center">
              <span>指标</span>
              <span>当前值</span>
              <span>说明</span>
            </div>

            {[
              {
                label: '发布成功',
                value: `${derived.successCount}/${derived.totalDeploys || 0}`,
                note: `成功率 ${derived.successRate.toFixed(1)}%`,
              },
              {
                label: '回滚记录',
                value: `${derived.rollbackCount}/${derived.totalDeploys || 0}`,
                note: `回滚率 ${derived.rollbackRate.toFixed(1)}%`,
              },
              {
                label: '版本快照',
                value: `${derived.snapshotCount}`,
                note: derived.latestVersion > 0 ? `当前版本 v${derived.latestVersion}` : '暂无版本',
              },
              {
                label: '发布密度',
                value: derived.deployDensity === '--' ? '--' : `${derived.deployDensity} 次/版本`,
                note: `健康度 ${derived.healthLabel}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="grid gap-2 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 md:grid-cols-[160px_140px_minmax(0,1fr)] md:items-center"
              >
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</div>
                <div className="text-sm text-slate-700 dark:text-slate-200">{item.value}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{item.note}</div>
              </div>
            ))}
          </div>

          <DetailRows className="self-start">
            <DetailRow label="流程" value={selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '-'} />
            <DetailRow label="发布总数" value={`${derived.totalDeploys}`} />
            <DetailRow label="快照数量" value={`${derived.snapshotCount}`} />
            <DetailRow label="当前版本" value={derived.latestVersion > 0 ? `v${derived.latestVersion}` : '-'} />
            <DetailRow label="成功率" value={`${derived.successRate.toFixed(1)}%`} />
            <DetailRow label="回滚率" value={`${derived.rollbackRate.toFixed(1)}%`} />
            <DetailRow
              label="覆盖率"
              value={derived.latestVersion > 0 ? `${derived.coverageRate.toFixed(1)}%` : '-'}
            />
            <DetailRow
              label="发布密度"
              value={derived.deployDensity === '--' ? '--' : `${derived.deployDensity} 次/版本`}
            />
            <DetailRow label="健康度" value={derived.healthLabel} />
          </DetailRows>
        </div>
      )}
    </div>
  );
};
