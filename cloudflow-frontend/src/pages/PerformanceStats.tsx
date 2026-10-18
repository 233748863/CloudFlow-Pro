import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Download,
  Gauge,
  PieChart,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { getAnomalyTypeLabel } from '@/utils/enumLabels';
import {
  AutoRefreshButton,
  Button,
  DateRangePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import {
  getPerformanceDashboard,
  getPerformanceRiskBreakdown,
  PerformanceAnomalyTypeBreakdownItem,
  PerformanceDashboardProcessRow,
  PerformanceDashboardResponse,
  PerformanceDashboardSummary,
  PerformanceDashboardTrendPoint,
  PerformanceRiskBreakdownResponse,
  PerformanceTimeoutLevelBreakdownItem,
} from '@/services/api/monitor';
import { downloadBlob } from '@/utils/download';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { Chart } from '@/components/charts/Chart';
import { DonutChart, LineChart, ScatterChart } from '@/components/charts/presets';
import '../styles/features/admin-performance.css';
import '../styles/features/dashboard-stat.css';

const getLocalDateString = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDaysAgoDateString = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getLocalDateString(date);
};

const formatCount = (value: number) => value.toLocaleString('zh-CN');

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatDuration = (ms: number): string => {
  const safeMs = Number.isFinite(ms) ? Math.max(ms, 0) : 0;
  const seconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
  return `${seconds}秒`;
};

const formatDurationCompact = (ms: number) => {
  const safeMs = Math.abs(Number.isFinite(ms) ? ms : 0);
  const minutes = Math.round(safeMs / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}小时${minutes % 60}分`;
  return `${minutes}分`;
};

const formatChartDuration = (ms: number) => {
  const safeMs = Math.max(ms, 0);
  const hours = safeMs / 3600000;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(safeMs / 60000)}m`;
};

const getSuccessTone = (value: number) => {
  if (value >= 95) return 'text-emerald-600 dark:text-emerald-300';
  if (value >= 80) return 'text-amber-600 dark:text-amber-300';
  return 'text-rose-600 dark:text-rose-300';
};

const getRiskTone = (value: number) => {
  if (value <= 5) return 'text-emerald-600 dark:text-emerald-300';
  if (value <= 12) return 'text-amber-600 dark:text-amber-300';
  return 'text-rose-600 dark:text-rose-300';
};

const getHealthBadgeClassName = (label: string) => {
  if (label === '稳定') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (label === '可控') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200';
  }
  if (label === '预警') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200';
};

const escapeCsv = (value: string | number) => {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

type DeltaKind = 'count' | 'success' | 'risk' | 'duration';

const DeltaMeta: React.FC<{
  current: number;
  previous: number;
  kind: DeltaKind;
}> = ({ current, previous, kind }) => {
  const delta = current - previous;

  if (delta === 0) {
    return <span className="text-cf-subtle">较上期持平</span>;
  }

  const isGood = kind === 'duration' ? delta < 0 : kind === 'risk' ? delta < 0 : delta > 0;
  const tone = isGood
    ? 'text-emerald-600 dark:text-emerald-300'
    : 'text-rose-600 dark:text-rose-300';
  const sign = delta > 0 ? '+' : '-';
  const body = kind === 'count'
    ? formatCount(Math.abs(Math.round(delta)))
    : kind === 'duration'
      ? formatDurationCompact(delta)
      : formatPercent(Math.abs(delta));

  return <span className={tone}>{`较上期 ${sign}${body}`}</span>;
};

const EmptyBlock: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-cf-faint" />
    ) : icon ? (
      <div className="mb-3 text-cf-faint">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 max-w-xl text-xs leading-6 text-cf-subtle">
        {description}
      </div>
    ) : null}
  </div>
);

const SectionHeader: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <div className="text-sm font-semibold text-cf-title">{title}</div>
      {description ? (
        <div className="mt-1 text-xs leading-6 text-cf-subtle">{description}</div>
      ) : null}
    </div>
    {action ? <div className="flex items-center gap-2">{action}</div> : null}
  </div>
);

const ChartCard: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  loading?: boolean;
  testId?: string;
  compact?: boolean;
  contentClassName?: string;
}> = ({
  title,
  description,
  action,
  children,
  loading = false,
  testId,
  compact = false,
  contentClassName,
}) => (
  <InnerTableSurface
    data-testid={testId}
    className="admin-performance-panel relative"
    wrapperClassName="flex min-h-0 flex-col"
  >
    {loading ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--cf-surface-strong)] dark:bg-slate-950">
        <RefreshCw className="h-5 w-5 animate-spin text-cf-faint" />
      </div>
    ) : null}
    <div className="admin-performance-panel-head">
      <SectionHeader title={title} description={description} action={action} />
    </div>
    <div className={cn('admin-performance-panel-body', compact ? 'pt-4 sm:pt-5' : 'pt-5 sm:pt-6', contentClassName)}>{children}</div>
  </InnerTableSurface>
);

const ContextPill: React.FC<{
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}> = ({ label, value, valueClassName }) => (
  <div className="admin-performance-context-pill px-3 py-2">
    <div className="text-[11px] font-medium text-cf-faint">
      {label}
    </div>
    <div className={cn('mt-1 text-sm font-medium text-cf-title', valueClassName)}>
      {value}
    </div>
  </div>
);

const TableEmptyRow: React.FC<{
  colSpan: number;
  loading: boolean;
}> = ({ colSpan, loading }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <EmptyBlock
        title={loading ? '正在加载流程明细' : '暂无流程明细'}
        description={loading ? undefined : '调整筛选条件后重试，或切换到其他时间范围查看。'}
        loading={loading}
        icon={!loading ? <Activity className="h-5 w-5" /> : undefined}
      />
    </td>
  </tr>
);

const ExecutionTrendChart: React.FC<{
  data: PerformanceDashboardTrendPoint[];
  loading: boolean;
}> = ({ data, loading }) => {
  if (data.length === 0) {
    return <EmptyBlock title="暂无执行趋势" description="当前时间范围没有流程统计数据。" icon={<TrendingUp className="h-5 w-5" />} loading={loading} />;
  }
  return (
    <Chart
      className="h-[236px]"
      ariaLabel="流程执行总量、完成数和平均时长趋势图"
      seriesCount={3}
      dataTable={{ columns: ['日期', '流程总量', '完成数', '平均时长'], rows: data.map(item => [item.statDate, item.totalCount, item.completedCount, formatDuration(item.avgDurationMs)]) }}
      option={(theme) => ({
        tooltip: { trigger: 'axis' },
        legend: { data: ['流程总量', '完成数', '平均时长'], top: 0, textStyle: { color: theme.subtle } },
        grid: { left: 44, right: 54, top: 42, bottom: 32 },
        xAxis: { type: 'category', data: data.map((item) => item.statDate.slice(5)), axisLabel: { color: theme.subtle }, axisLine: { lineStyle: { color: theme.border } } },
        yAxis: [
          { type: 'value', axisLabel: { color: theme.subtle }, splitLine: { lineStyle: { color: theme.border } } },
          { type: 'value', axisLabel: { color: theme.subtle, formatter: (value: number) => formatChartDuration(value) }, splitLine: { show: false } },
        ],
        series: [
          { name: '流程总量', type: 'bar', data: data.map((item) => item.totalCount), itemStyle: { color: theme.colors[0], borderRadius: [4, 4, 0, 0] } },
          { name: '完成数', type: 'bar', data: data.map((item) => item.completedCount), itemStyle: { color: theme.colors[1], borderRadius: [4, 4, 0, 0] } },
          { name: '平均时长', type: 'line', yAxisIndex: 1, data: data.map((item) => item.avgDurationMs), smooth: false, symbolSize: 7, lineStyle: { color: theme.colors[2] }, itemStyle: { color: theme.colors[2] } },
        ],
      })}
    />
  );
};

const RiskTrendChart: React.FC<{
  data: PerformanceDashboardTrendPoint[];
  loading: boolean;
}> = ({ data, loading }) => {
  if (data.length === 0) {
    return <EmptyBlock title="暂无风险趋势" description="当前区间没有可绘制的风险数据。" icon={<ShieldAlert className="h-5 w-5" />} loading={loading} />;
  }
  return (
    <LineChart
      height={236}
      ariaLabel="流程超时实例率与异常实例率趋势图"
      categories={data.map(item => item.statDate)} categoryAxisName="日期" valueAxisName="实例率"
      valueFormatter={formatPercent}
      series={[
        { name: '超时实例率', values: data.map(item => item.timeoutInstanceRate), semantic: 'warning' },
        { name: '异常实例率', values: data.map(item => item.anomalyInstanceRate), semantic: 'critical' },
      ]}
    />
  );
};

const ProcessRankingChart: React.FC<{
  data: PerformanceDashboardProcessRow[];
  selectedProcess: string;
  onSelect: (processDefKey: string) => void;
  loading: boolean;
}> = ({ data, selectedProcess, onSelect, loading }) => {
  if (data.length === 0) {
    return (
      <EmptyBlock
        title="暂无流程排行"
        description="当前区间没有流程聚合数据。"
        icon={<BarChart3 className="h-5 w-5" />}
        loading={loading}
      />
    );
  }

  const rows = data.slice(0, 4);
  const maxTotal = Math.max(...rows.map((item) => item.totalCount), 1);

  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {rows.map((item, index) => {
        const selected = selectedProcess === item.processDefKey;
        const barWidth = `${Math.max((item.totalCount / maxTotal) * 100, 8)}%`;
        return (
          <button
            key={item.processDefKey}
            type="button"
            onClick={() => onSelect(item.processDefKey)}
            data-testid={`performance-ranking-${item.processDefKey}`}
            aria-label={`流程排行 ${item.processName}`}
            className={cn(
              'w-full rounded-md px-1 py-2 text-left transition-colors',
              selected
                ? 'bg-cyan-50/80 dark:bg-cyan-950/18'
                : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/55',
            )}
          >
            <div className="grid gap-3 md:grid-cols-[32px_minmax(0,1fr)_136px] md:items-center">
              <div className="flex items-center">
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold',
                    selected
                      ? 'bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950'
                      : 'bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100',
                  )}
                >
                  {index + 1}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-cf-title">
                      {item.processName}
                    </div>
                    <div className="mt-1 truncate text-xs text-cf-subtle">
                      {item.processDefKey}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-cf-title md:hidden">
                    {formatCount(item.totalCount)}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-md',
                        item.successRate >= 95
                          ? 'bg-emerald-500'
                          : item.successRate >= 80
                            ? 'bg-amber-500'
                            : 'bg-rose-500',
                      )}
                      style={{ width: barWidth }}
                    />
                  </div>
                  <div className="hidden shrink-0 text-sm font-semibold text-cf-title md:block">
                    {formatCount(item.totalCount)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-left text-[11px] md:grid-cols-1 md:text-right">
                <div>
                  <div className="text-cf-faint">完成率</div>
                  <div className={cn('mt-0.5 text-sm font-semibold', getSuccessTone(item.successRate))}>
                    {formatPercent(item.successRate)}
                  </div>
                </div>
                <div>
                  <div className="text-cf-faint">失败率</div>
                  <div className={cn('mt-0.5 text-sm font-semibold', getRiskTone(item.failedRate))}>
                    {formatPercent(item.failedRate)}
                  </div>
                </div>
                <div>
                  <div className="text-cf-faint">平均时长</div>
                  <div className="mt-0.5 text-sm font-semibold text-cf-title">
                    {formatDurationCompact(item.avgDurationMs)}
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

const RiskMatrixChart: React.FC<{
  data: PerformanceDashboardProcessRow[];
  selectedProcess: string;
  onSelect: (processDefKey: string) => void;
  loading: boolean;
}> = ({ data, selectedProcess, onSelect, loading }) => {
  if (data.length === 0) {
    return <EmptyBlock title="暂无风险矩阵" description="当前区间没有可用于建模的流程风险数据。" icon={<AlertTriangle className="h-5 w-5" />} loading={loading} />;
  }
  return (
    <ScatterChart
      height={220}
      ariaLabel="流程平均时长、风险强度与实例数量矩阵图"
      xAxisName="平均时长" yAxisName="风险强度" sizeName="实例数" xFormatter={formatDuration} yFormatter={formatPercent}
      selectedId={selectedProcess} onSelect={point => { if (point.id) onSelect(point.id); }}
      data={data.map(item => {
        const risk = item.timeoutInstanceRate + item.anomalyInstanceRate;
        return { id: item.processDefKey, name: item.processName, x: item.avgDurationMs, y: risk, size: item.totalCount,
          semantic: risk <= 5 ? 'good' : risk <= 12 ? 'warning' : 'critical',
          dimensions: { 超时实例率: formatPercent(item.timeoutInstanceRate), 异常实例率: formatPercent(item.anomalyInstanceRate) } };
      })}
    />
  );
};

/**
 * 超时等级/**
 * 超时等级 → 图表状态色。
 *
 * stroke（SVG 标记）与 dot（图例色块）必须取自同一个 token：改造前 stroke 是
 * 写死的 v3 hex、dot 是 Tailwind 类名，而项目已升到 v4——v4 的 `amber-500` 是
 * Tailwind 的语义色与项目色板并非同一组值，图例色块和扇区因此可能不一致。
 * 现在两者都指向 `--cf-chart-*`，亮暗切换交给 index.css。
 *
 * text 仍用 Tailwind 语义色：它是文字，要保证对比度，不能用图表标记色。
 *
 * 「正常」档用 good（绿）而不是另造一个青色档：没超时本身就是好状态，
 * 而青绿两色常视力 ΔE 只有 12.5，低于 15 的可辨底线，并列时读者分不开。
 */
const timeoutLevelTone = (level: string) => {
  if (level === 'CRITICAL') {
    return {
      stroke: 'var(--cf-chart-critical)',
      dot: 'bg-cf-chart-critical',
      text: 'text-rose-600 dark:text-rose-300',
    };
  }
  if (level === 'WARNING') {
    return {
      stroke: 'var(--cf-chart-warning)',
      dot: 'bg-cf-chart-warning',
      text: 'text-amber-600 dark:text-amber-300',
    };
  }
  return {
    stroke: 'var(--cf-chart-good)',
    dot: 'bg-cf-chart-good',
    text: 'text-emerald-600 dark:text-emerald-300',
  };
};

const TimeoutLevelDistributionCard: React.FC<{
  items: PerformanceTimeoutLevelBreakdownItem[];
  total: number;
  loading: boolean;
}> = ({ items, total, loading }) => {
  if (total <= 0 || items.length === 0) {
    return <EmptyBlock title="暂无超时等级分布" description="当前筛选区间没有超时事件。" icon={<PieChart className="h-5 w-5" />} loading={loading} />;
  }
  return (
    <DonutChart
      height={220}
      ariaLabel="超时事件等级分布图"
      data={items.map(item => ({ name: item.label, value: item.count, semantic: item.level === 'CRITICAL' ? 'critical' : item.level === 'WARNING' ? 'warning' : 'good' }))}
    />
  );
};

/**
 * 异常类型/**
 * 异常类型分布条的颜色：**单色**。
 *
 * 改造前是 5 个色按 `index % 5` 轮着发，两个问题：
 * 1. 颜色跟的是名次而不是实体——筛选一变、排序一变，所有条的颜色重排，
 *    读者会误以为分类变了；
 * 2. 这是单系列的量级比较，每条旁边已经有类型名 + 数量 + 占比三个可见标签，
 *    颜色不携带任何信息，多色只是噪声（而且首位用的还是状态色 rose，
 *    会被误读成"这一类是严重的"）。
 *
 * 量级比较用同一个色即可，长度已经表达了大小。
 */
const ANOMALY_BAR_TONE = 'bg-cf-chart-1';

const AnomalyTypeRankingCard: React.FC<{
  items: PerformanceAnomalyTypeBreakdownItem[];
  total: number;
  loading: boolean;
}> = ({ items, total, loading }) => {
  if (total <= 0 || items.length === 0) {
    return (
      <EmptyBlock
        title="暂无异常类型排行"
        description="当前筛选区间没有异常事件。"
        icon={<AlertTriangle className="h-5 w-5" />}
        loading={loading}
      />
    );
  }

  const rows = items.slice(0, 4);
  const maxCount = Math.max(...rows.map((item) => item.count), 1);

  return (
    <div className="grid gap-3">
      {rows.map((item) => (
        <div key={item.type} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm text-cf-body">{getAnomalyTypeLabel(item.type) || item.label}</div>
            <div className="text-right">
              <span className="text-sm font-semibold text-cf-title">
                {formatCount(item.count)}
              </span>
              <span className="ml-2 text-xs text-cf-subtle">{formatPercent(item.rate)}</span>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800">
            <div
              className={cn('h-full rounded-md', ANOMALY_BAR_TONE)}
              style={{ width: `${Math.max((item.count / maxCount) * 100, 10)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const PerformanceStatsPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<PerformanceDashboardResponse | null>(null);
  const [riskBreakdown, setRiskBreakdown] = useState<PerformanceRiskBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(60);
  const [dateRange, setDateRange] = useState({
    startDate: getDaysAgoDateString(29),
    endDate: getLocalDateString(),
  });
  const [selectedProcess, setSelectedProcess] = useState('');
  const [processCatalog, setProcessCatalog] = useState<Record<string, string>>({});

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [dashboardData, riskBreakdownData] = await Promise.all([
        getPerformanceDashboard({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          processDefKey: selectedProcess || undefined,
        }),
        getPerformanceRiskBreakdown({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          processDefKey: selectedProcess || undefined,
        }),
      ]);
      setDashboard(dashboardData);
      setRiskBreakdown(riskBreakdownData);
      setProcessCatalog((previous) => {
        const next = { ...previous };
        dashboardData.processes.forEach((item) => {
          next[item.processDefKey] = item.processName;
        });
        if (
          dashboardData.context.processDefKey
          && dashboardData.context.processLabel
          && dashboardData.context.processLabel !== '全部流程'
        ) {
          next[dashboardData.context.processDefKey] = dashboardData.context.processLabel;
        }
        return next;
      });
    } catch (error) {
      console.error('加载流程性能看板失败:', error);
      toast.error(getErrorMessage(error, '加载流程性能看板失败'));
    } finally {
      setLoading(false);
    }
  }, [dateRange.endDate, dateRange.startDate, selectedProcess]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const processOptions = useMemo(
    () =>
      Object.entries(processCatalog)
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    [processCatalog],
  );

  const summary = dashboard?.summary ?? {
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    avgDurationMs: 0,
    minDurationMs: 0,
    maxDurationMs: 0,
    successRate: 0,
    failedRate: 0,
    timeoutInstanceCount: 0,
    timeoutEventCount: 0,
    timeoutInstanceRate: 0,
    anomalyInstanceCount: 0,
    anomalyEventCount: 0,
    anomalyInstanceRate: 0,
    healthLabel: '观察中',
  };
  const compareSummary = dashboard?.compareSummary ?? summary;
  const trendRows = dashboard?.trend ?? [];
  const processRows = dashboard?.processes ?? [];
  const timeoutBreakdown = riskBreakdown?.timeoutLevels ?? [];
  const anomalyBreakdown = riskBreakdown?.anomalyTypes ?? [];
  const timeoutBreakdownTotal = riskBreakdown?.totals.timeoutTotal ?? 0;
  const anomalyBreakdownTotal = riskBreakdown?.totals.anomalyTotal ?? 0;
  const selectedProcessLabel = dashboard?.context.processLabel
    || processCatalog[selectedProcess]
    || '全部流程';

  const exportDashboard = () => {
    if (processRows.length === 0) {
      toast.error('当前没有可导出的流程数据');
      return;
    }

    const lines = [
      [
        '流程',
        '流程 Key',
        '总量',
        '完成',
        '失败',
        '平均时长',
        '完成率',
        '失败率',
        '超时实例率',
        '超时事件数',
        '异常实例率',
        '异常事件数',
        '风险评分',
      ].join(','),
      ...processRows.map((item) => [
        escapeCsv(item.processName),
        escapeCsv(item.processDefKey),
        item.totalCount,
        item.completedCount,
        item.failedCount,
        escapeCsv(formatDuration(item.avgDurationMs)),
        escapeCsv(formatPercent(item.successRate)),
        escapeCsv(formatPercent(item.failedRate)),
        escapeCsv(formatPercent(item.timeoutInstanceRate)),
        item.timeoutEventCount,
        escapeCsv(formatPercent(item.anomalyInstanceRate)),
        item.anomalyEventCount,
        item.riskScore.toFixed(2),
      ].join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + lines], { type: 'text/csv;charset=utf-8;' });
    const fileName = downloadBlob(
      blob,
      `performance_dashboard_${dateRange.startDate}_${dateRange.endDate}${selectedProcess ? `_${selectedProcess}` : ''}.csv`,
    );
    toast.success(`已导出 ${processRows.length} 条流程统计，文件：${fileName}`);
  };

  const selectProcessFromChart = (processDefKey: string) => {
    setSelectedProcess((current) => current === processDefKey ? '' : processDefKey);
  };

  const primaryStats: Array<{
    label: string;
    value: React.ReactNode;
    meta: React.ReactNode;
    icon: React.ElementType;
    tone: 'blue' | 'green' | 'amber' | 'violet';
    valueClassName?: string;
  }> = [
    {
      label: '流程总量',
      value: formatCount(summary.totalCount),
      meta: <DeltaMeta current={summary.totalCount} previous={compareSummary.totalCount} kind="count" />,
      icon: Workflow,
      tone: 'blue',
    },
    {
      label: '完成实例',
      value: formatCount(summary.completedCount),
      meta: <DeltaMeta current={summary.completedCount} previous={compareSummary.completedCount} kind="count" />,
      icon: Activity,
      tone: 'green',
    },
    {
      label: '失败实例',
      value: formatCount(summary.failedCount),
      meta: <span className={getRiskTone(summary.failedRate)}>失败率 {formatPercent(summary.failedRate)}</span>,
      icon: AlertTriangle,
      tone: 'amber',
      valueClassName: getRiskTone(summary.failedRate),
    },
    {
      label: '平均时长',
      value: formatDuration(summary.avgDurationMs),
      meta: <DeltaMeta current={summary.avgDurationMs} previous={compareSummary.avgDurationMs} kind="duration" />,
      icon: Clock3,
      tone: 'violet',
    },
  ];

  const secondaryStats: Array<{
    label: string;
    value: React.ReactNode;
    meta: React.ReactNode;
    icon: React.ElementType;
    tone: 'blue' | 'green' | 'amber' | 'violet';
    valueClassName?: string;
  }> = [
    {
      label: '完成率',
      value: formatPercent(summary.successRate),
      meta: <DeltaMeta current={summary.successRate} previous={compareSummary.successRate} kind="success" />,
      icon: Gauge,
      tone: 'green',
      valueClassName: getSuccessTone(summary.successRate),
    },
    {
      label: '失败率',
      value: formatPercent(summary.failedRate),
      meta: <DeltaMeta current={summary.failedRate} previous={compareSummary.failedRate} kind="risk" />,
      icon: BarChart3,
      tone: 'amber',
      valueClassName: getRiskTone(summary.failedRate),
    },
    {
      label: '超时实例率',
      value: formatPercent(summary.timeoutInstanceRate),
      meta: <DeltaMeta current={summary.timeoutInstanceRate} previous={compareSummary.timeoutInstanceRate} kind="risk" />,
      icon: TrendingUp,
      tone: 'blue',
      valueClassName: getRiskTone(summary.timeoutInstanceRate),
    },
    {
      label: '异常实例率',
      value: formatPercent(summary.anomalyInstanceRate),
      meta: <DeltaMeta current={summary.anomalyInstanceRate} previous={compareSummary.anomalyInstanceRate} kind="risk" />,
      icon: ShieldAlert,
      tone: 'violet',
      valueClassName: getRiskTone(summary.anomalyInstanceRate),
    },
  ];

  const isInitialLoading = loading && dashboard === null;

  const pageActions = (
    <div className="grid gap-4">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORKFLOW PERFORMANCE</p>
          <h2>流程性能统计</h2>
          <span>监控流程吞吐、耗时、失败、超时与异常风险。</span>
        </div>
        <div className="admin-source-controls">
          <AutoRefreshButton
            enabled={autoRefreshEnabled}
            intervalSeconds={autoRefreshInterval}
            intervals={[30, 60, 300]}
            loading={loading}
            onEnabledChange={setAutoRefreshEnabled}
            onIntervalChange={setAutoRefreshInterval}
            onRefresh={loadDashboard}
          />
          <Button variant="outline" size="sm" onClick={exportDashboard} disabled={processRows.length === 0}>
            <Download className="h-4 w-4" />
            导出 CSV
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid admin-performance-dashboard-stats">
        {primaryStats.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={`card admin-source-stat admin-source-tone-${item.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{item.label}</p>
                <strong className={cn(item.valueClassName)}>{item.value}</strong>
                <span>{item.meta}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="admin-source-stat-grid admin-performance-dashboard-stats admin-performance-secondary-stats">
        {secondaryStats.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className={`card admin-source-stat admin-source-tone-${item.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{item.label}</p>
                <strong className={cn(item.valueClassName)}>{item.value}</strong>
                <span>{item.meta}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const pageFilters = (
      <section className="admin-source-inline-toolbar admin-performance-filter-toolbar">
        <div className="admin-performance-filter-controls">
          <label className="admin-performance-date-range-control">
            <span className="input-label">统计区间</span>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              ariaLabel="选择流程性能统计区间"
            />
          </label>

          <label className="admin-performance-process-control">
            <span className="input-label">流程</span>
            <Select
              value={selectedProcess || 'all'}
              onValueChange={(value) => setSelectedProcess(value === 'all' ? '' : value)}
            >
              <SelectTrigger className="cf-control">
                <SelectValue placeholder="全部流程" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部流程</SelectItem>
                {processOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="admin-performance-context-strip">
          <ContextPill label="当前区间" value={`${dateRange.startDate} ~ ${dateRange.endDate}`} />
          <ContextPill
            label="对比区间"
            value={
              dashboard
                ? `${dashboard.context.compareStartDate} ~ ${dashboard.context.compareEndDate}`
                : '--'
            }
          />
          <ContextPill label="流程范围" value={selectedProcessLabel} />
          <ContextPill
            label="健康状态"
            value={
              <span
                className={cn(
                  'inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold',
                  getHealthBadgeClassName(summary.healthLabel),
                )}
              >
                {summary.healthLabel}
              </span>
            }
          />
          <ContextPill
            label="风险摘要"
            value={`${formatPercent(summary.timeoutInstanceRate)} / ${formatPercent(summary.anomalyInstanceRate)}`}
            valueClassName={getRiskTone(summary.timeoutInstanceRate + summary.anomalyInstanceRate)}
          />
        </div>
      </section>
  );

  const pageContent = isInitialLoading ? (
        <InnerTableSurface className="admin-performance-panel">
          <EmptyBlock title="正在加载流程性能看板" loading />
        </InnerTableSurface>
      ) : (
          <div className="admin-source-content-grid admin-performance-content-grid">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="执行趋势图" loading={loading} testId="execution-trend-card">
                <ExecutionTrendChart data={trendRows} loading={loading} />
              </ChartCard>

              <ChartCard title="风险趋势图" loading={loading} testId="risk-trend-card">
                <RiskTrendChart data={trendRows} loading={loading} />
              </ChartCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
              <ChartCard
                title="流程效率排行"
                loading={loading}
                testId="process-ranking-card"
                compact
                action={
                  <span className="text-xs text-cf-subtle">
                    {processRows.length} 项
                  </span>
                }
              >
                <ProcessRankingChart
                  data={processRows}
                  selectedProcess={selectedProcess}
                  onSelect={selectProcessFromChart}
                  loading={loading}
                />
              </ChartCard>

              <div className="grid gap-4">
                <ChartCard title="风险矩阵" loading={loading} testId="risk-matrix-card" compact>
                  <RiskMatrixChart
                    data={processRows}
                    selectedProcess={selectedProcess}
                    onSelect={selectProcessFromChart}
                    loading={loading}
                  />
                </ChartCard>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                  <ChartCard
                    title="超时等级分布"
                    loading={loading}
                    testId="timeout-level-card"
                    compact
                    action={
                      <span className="text-xs text-cf-subtle">
                        {timeoutBreakdownTotal} 个
                      </span>
                    }
                  >
                    <TimeoutLevelDistributionCard
                      items={timeoutBreakdown}
                      total={timeoutBreakdownTotal}
                      loading={loading}
                    />
                  </ChartCard>

                  <ChartCard
                    title="异常类型排行"
                    loading={loading}
                    testId="anomaly-type-card"
                    compact
                    action={
                      <span className="text-xs text-cf-subtle">
                        {anomalyBreakdownTotal} 个
                      </span>
                    }
                  >
                    <AnomalyTypeRankingCard
                      items={anomalyBreakdown}
                      total={anomalyBreakdownTotal}
                      loading={loading}
                    />
                  </ChartCard>
                </div>
              </div>
            </div>

            <InnerTableSurface data-testid="process-detail-card" className="relative">
              {loading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--cf-surface-strong)] dark:bg-slate-950">
                  <RefreshCw className="h-5 w-5 animate-spin text-cf-faint" />
                </div>
              ) : null}
              <div className="admin-performance-panel-head">
                <SectionHeader
                  title="流程明细表"
                  action={
                    <span className="text-xs text-cf-subtle">
                      {processRows.length} 条
                    </span>
                  }
                />
              </div>
                <table data-testid="performance-detail-table" className="unity-data-table admin-source-table admin-performance-detail-table">
                  <thead>
                    <tr>
                      <th className="w-[22%]">流程</th>
                      <th className="text-right">总量</th>
                      <th className="text-right">完成</th>
                      <th className="text-right">失败</th>
                      <th className="text-right">平均时长</th>
                      <th className="text-right">完成率</th>
                      <th className="text-right">失败率</th>
                      <th className="text-right">超时率</th>
                      <th className="text-right">超时数</th>
                      <th className="text-right">异常率</th>
                      <th className="text-right">异常数</th>
                    </tr>
                  </thead>
                  <tbody>
                  {processRows.length > 0 ? (
                    processRows.map((item) => (
                      <tr
                        key={item.processDefKey}
                        className={cn(
                          selectedProcess === item.processDefKey && 'bg-cyan-50/60 dark:bg-cyan-950/10',
                        )}
                      >
                        <td className="min-w-0">
                          <div className="truncate font-medium text-cf-title">
                            {item.processName}
                          </div>
                          <div className="mt-1 truncate text-xs text-cf-subtle">
                            {item.processDefKey}
                          </div>
                        </td>
                        <td className="text-right">{formatCount(item.totalCount)}</td>
                        <td className="text-right">{formatCount(item.completedCount)}</td>
                        <td className="text-right">{formatCount(item.failedCount)}</td>
                        <td className="text-right">{formatDurationCompact(item.avgDurationMs)}</td>
                        <td className={cn('text-right font-semibold', getSuccessTone(item.successRate))}>
                          {formatPercent(item.successRate)}
                        </td>
                        <td className={cn('text-right font-semibold', getRiskTone(item.failedRate))}>
                          {formatPercent(item.failedRate)}
                        </td>
                        <td className={cn('text-right font-semibold', getRiskTone(item.timeoutInstanceRate))}>
                          {formatPercent(item.timeoutInstanceRate)}
                        </td>
                        <td className="text-right">{formatCount(item.timeoutEventCount)}</td>
                        <td className={cn('text-right font-semibold', getRiskTone(item.anomalyInstanceRate))}>
                          {formatPercent(item.anomalyInstanceRate)}
                        </td>
                        <td className="text-right">{formatCount(item.anomalyEventCount)}</td>
                      </tr>
                    ))
                  ) : (
                    <TableEmptyRow colSpan={11} loading={loading} />
                  )}
                  </tbody>
                </table>
            </InnerTableSurface>
          </div>
      );

  return (
    <section className="admin-source-page performance-stats-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default PerformanceStatsPage;
