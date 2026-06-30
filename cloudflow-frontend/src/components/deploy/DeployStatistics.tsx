import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { Button } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
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
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
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
  <InnerTableSurface
    className={className}
    wrapperClassName="divide-y divide-slate-100 dark:divide-slate-800"
  >
    {children}
  </InnerTableSurface>
);

const DetailRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={cn(
      'flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4',
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
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
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

          <div className="admin-toolbar-field admin-deploy-toolbar-metrics">
            <span className="badge badge-gray">{selectedProcessMeta?.processName || selectedProcessMeta?.processKey || '未选择流程'}</span>
            <span className="badge badge-gray">发布 {derived.totalDeploys}</span>
            <span className="badge badge-gray">成功率 {derived.successRate.toFixed(1)}%</span>
            <span className="badge badge-gray">回滚率 {derived.rollbackRate.toFixed(1)}%</span>
          </div>

          <div className="admin-users-toolbar-actions">
            <Button variant="outline" size="sm" onClick={() => void loadStatistics()} disabled={!selectedProcess}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>
      </section>

      {!selectedProcess ? (
        <InnerTableSurface>
          <InlineState icon={<BarChart3 className="h-5 w-5" />} title="请先选择流程" />
        </InnerTableSurface>
      ) : loading ? (
        <InnerTableSurface>
          <InlineState title="正在读取发布统计" loading />
        </InnerTableSurface>
      ) : !stats ? (
        <InnerTableSurface>
          <InlineState icon={<BarChart3 className="h-5 w-5" />} title="暂无统计数据" />
        </InnerTableSurface>
      ) : (
        <div className="grid gap-4">
          <InnerTableSurface>
            <table className="unity-data-table admin-source-table min-w-[680px]">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>当前值</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
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
                    <tr key={item.label}>
                      <td><strong className="text-slate-900 dark:text-slate-100">{item.label}</strong></td>
                      <td>{item.value}</td>
                      <td>{item.note}</td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </InnerTableSurface>

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
