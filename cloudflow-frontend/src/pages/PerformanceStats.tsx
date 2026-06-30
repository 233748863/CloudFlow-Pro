import React, { useEffect, useMemo, useState } from 'react';
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
  Button,
  DatePicker,
  SegmentedControl,
  SegmentedControlItem,
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

const RANGE_PRESETS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
];

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

const getTooltipTransform = (xPercent: number) => {
  if (xPercent <= 16) return 'translateX(0)';
  if (xPercent >= 84) return 'translateX(-100%)';
  return 'translateX(-50%)';
};

const polarToCartesian = (centerX: number, centerY: number, radius: number, angle: number) => {
  const angleInRadians = ((angle - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
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
    return <span className="text-slate-500 dark:text-slate-400">较上期持平</span>;
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
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 max-w-xl text-xs leading-6 text-slate-500 dark:text-slate-400">
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
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description ? (
        <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
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
        <RefreshCw className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
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
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className={cn('mt-1 text-sm font-medium text-slate-900 dark:text-slate-100', valueClassName)}>
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <EmptyBlock
        title="暂无执行趋势"
        description="当前时间范围没有流程统计数据。"
        icon={<TrendingUp className="h-5 w-5" />}
        loading={loading}
      />
    );
  }

  const width = 760;
  const height = 236;
  const padding = { top: 18, right: 24, bottom: 34, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxCount = Math.max(...data.map((item) => Math.max(item.totalCount, item.completedCount)), 1);
  const maxDuration = Math.max(...data.map((item) => item.avgDurationMs), 1);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const columnWidth = chartW / Math.max(data.length, 1);
  const barWidth = Math.min(18, Math.max(8, columnWidth * 0.22));
  const x = (index: number) => padding.left + columnWidth * index + columnWidth / 2;
  const yCount = (value: number) => padding.top + chartH - (value / maxCount) * chartH;
  const yDuration = (value: number) => padding.top + chartH - (value / maxDuration) * chartH;
  const durationLine = data.map((item, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${yDuration(item.avgDurationMs)}`).join(' ');
  const activeIndex =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < data.length ? hoveredIndex : null;
  const activePoint = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className="admin-source-content-grid">
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-cyan-500 dark:bg-cyan-400" />
          流程总量
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
          完成数
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500 dark:bg-amber-400" />
          平均时长
        </span>
      </div>

      <div className="relative" onMouseLeave={() => setHoveredIndex(null)}>
        {activePoint && activeIndex !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-20 min-w-[176px] rounded-md border border-slate-800/80 bg-slate-950/92 px-3 py-2 text-xs shadow-none"
            style={{
              left: `${((x(activeIndex) - padding.left) / chartW) * 100}%`,
              transform: getTooltipTransform(((x(activeIndex) - padding.left) / chartW) * 100),
            }}
          >
            <div className="mb-2 font-semibold text-white">{activePoint.statDate}</div>
            <div className="space-y-1.5 text-slate-200">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">总量</span>
                <span>{formatCount(activePoint.totalCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">完成</span>
                <span>{formatCount(activePoint.completedCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">失败</span>
                <span>{formatCount(activePoint.failedCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">平均时长</span>
                <span>{formatDuration(activePoint.avgDurationMs)}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full">
            {Array.from({ length: 5 }, (_, index) => {
              const value = Math.round((maxCount / 4) * index);
              const y = yCount(value);

              return (
                <g key={index}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth={1}
                    className="text-slate-200 dark:text-slate-800"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={10}
                    fill="currentColor"
                    className="text-slate-400 dark:text-slate-500"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            <path d={durationLine} fill="none" stroke="#f59e0b" strokeWidth={2.5} />

            {data.map((item, index) => {
              const centerX = x(index);
              const totalHeight = chartH - (yCount(item.totalCount) - padding.top);
              const completedHeight = chartH - (yCount(item.completedCount) - padding.top);
              return (
                <g key={item.statDate}>
                  <rect
                    x={centerX - barWidth - 3}
                    y={yCount(item.totalCount)}
                    width={barWidth}
                    height={totalHeight}
                    rx={4}
                    fill="#06b6d4"
                    opacity={0.92}
                  />
                  <rect
                    x={centerX + 3}
                    y={yCount(item.completedCount)}
                    width={barWidth}
                    height={completedHeight}
                    rx={4}
                    fill="#10b981"
                    opacity={0.92}
                  />
                  <circle cx={centerX} cy={yDuration(item.avgDurationMs)} r={3.5} fill="#f59e0b" />
                  <rect
                    x={centerX - columnWidth / 2}
                    y={padding.top}
                    width={columnWidth}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseMove={() => setHoveredIndex(index)}
                  />
                </g>
              );
            })}

            {data.map((item, index) =>
              index % labelStep === 0 || index === data.length - 1 ? (
                <text
                  key={item.statDate}
                  x={x(index)}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  className="text-slate-400 dark:text-slate-500"
                >
                  {item.statDate.slice(5)}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

const RiskTrendChart: React.FC<{
  data: PerformanceDashboardTrendPoint[];
  loading: boolean;
}> = ({ data, loading }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <EmptyBlock
        title="暂无风险趋势"
        description="当前区间没有可绘制的风险数据。"
        icon={<ShieldAlert className="h-5 w-5" />}
        loading={loading}
      />
    );
  }

  const width = 760;
  const height = 236;
  const padding = { top: 18, right: 24, bottom: 34, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxRate = Math.max(
    ...data.map((item) => Math.max(item.timeoutInstanceRate, item.anomalyInstanceRate)),
    1,
  );
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const x = (index: number) => padding.left + (index / Math.max(data.length - 1, 1)) * chartW;
  const y = (value: number) => padding.top + chartH - (value / maxRate) * chartH;
  const timeoutLine = data.map((item, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(item.timeoutInstanceRate)}`).join(' ');
  const anomalyLine = data.map((item, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(item.anomalyInstanceRate)}`).join(' ');
  const activeIndex =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < data.length ? hoveredIndex : null;
  const activePoint = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className="admin-source-content-grid">
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500 dark:bg-amber-400" />
          超时实例率
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500 dark:bg-rose-400" />
          异常实例率
        </span>
      </div>

      <div className="relative" onMouseLeave={() => setHoveredIndex(null)}>
        {activePoint && activeIndex !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-20 min-w-[200px] rounded-md border border-slate-800/80 bg-slate-950/92 px-3 py-2 text-xs shadow-none"
            style={{
              left: `${((x(activeIndex) - padding.left) / chartW) * 100}%`,
              transform: getTooltipTransform(((x(activeIndex) - padding.left) / chartW) * 100),
            }}
          >
            <div className="mb-2 font-semibold text-white">{activePoint.statDate}</div>
            <div className="space-y-1.5 text-slate-200">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">超时实例率</span>
                <span>{formatPercent(activePoint.timeoutInstanceRate)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">超时事件数</span>
                <span>{formatCount(activePoint.timeoutEventCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">异常实例率</span>
                <span>{formatPercent(activePoint.anomalyInstanceRate)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">异常事件数</span>
                <span>{formatCount(activePoint.anomalyEventCount)}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full">
            {Array.from({ length: 5 }, (_, index) => {
              const value = (maxRate / 4) * index;
              const lineY = y(value);
              return (
                <g key={index}>
                  <line
                    x1={padding.left}
                    y1={lineY}
                    x2={width - padding.right}
                    y2={lineY}
                    stroke="currentColor"
                    strokeWidth={1}
                    className="text-slate-200 dark:text-slate-800"
                  />
                  <text
                    x={padding.left - 8}
                    y={lineY + 4}
                    textAnchor="end"
                    fontSize={10}
                    fill="currentColor"
                    className="text-slate-400 dark:text-slate-500"
                  >
                    {formatPercent(value)}
                  </text>
                </g>
              );
            })}

            <path d={timeoutLine} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
            <path d={anomalyLine} fill="none" stroke="#f43f5e" strokeWidth={2.5} />

            {data.map((item, index) => (
              <g key={item.statDate}>
                <circle cx={x(index)} cy={y(item.timeoutInstanceRate)} r={3.5} fill="#f59e0b" />
                <circle cx={x(index)} cy={y(item.anomalyInstanceRate)} r={3.5} fill="#f43f5e" />
                <rect
                  x={x(index) - chartW / Math.max(data.length - 1, 1) / 2}
                  y={padding.top}
                  width={chartW / Math.max(data.length - 1, 1)}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                />
              </g>
            ))}

            {data.map((item, index) =>
              index % labelStep === 0 || index === data.length - 1 ? (
                <text
                  key={item.statDate}
                  x={x(index)}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  className="text-slate-400 dark:text-slate-500"
                >
                  {item.statDate.slice(5)}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      </div>
    </div>
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
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.processName}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.processDefKey}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100 md:hidden">
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
                  <div className="hidden shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100 md:block">
                    {formatCount(item.totalCount)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-left text-[11px] md:grid-cols-1 md:text-right">
                <div>
                  <div className="text-slate-400 dark:text-slate-500">完成率</div>
                  <div className={cn('mt-0.5 text-sm font-semibold', getSuccessTone(item.successRate))}>
                    {formatPercent(item.successRate)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 dark:text-slate-500">失败率</div>
                  <div className={cn('mt-0.5 text-sm font-semibold', getRiskTone(item.failedRate))}>
                    {formatPercent(item.failedRate)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 dark:text-slate-500">平均时长</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <EmptyBlock
        title="暂无风险矩阵"
        description="当前区间没有可用于建模的流程风险数据。"
        icon={<AlertTriangle className="h-5 w-5" />}
        loading={loading}
      />
    );
  }

  const width = 720;
  const height = 152;
  const padding = { top: 16, right: 16, bottom: 28, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxDuration = Math.max(...data.map((item) => item.avgDurationMs), 1);
  const maxRisk = Math.max(...data.map((item) => item.timeoutInstanceRate + item.anomalyInstanceRate), 1);
  const maxTotal = Math.max(...data.map((item) => item.totalCount), 1);
  const activeItem = data.find((item) => item.processDefKey === hoveredKey) || null;

  const toX = (value: number) => padding.left + (value / maxDuration) * chartW;
  const toY = (value: number) => padding.top + chartH - (value / maxRisk) * chartH;
  const radius = (value: number) => 6 + (value / maxTotal) * 10;

  return (
    <div className="relative" onMouseLeave={() => setHoveredKey(null)}>
      {activeItem ? (
        <div
          className="pointer-events-none absolute right-0 top-0 z-20 min-w-[208px] rounded-md border border-slate-800/80 bg-slate-950/92 px-3 py-2 text-xs shadow-none"
        >
          <div className="mb-2 font-semibold text-white">{activeItem.processName}</div>
          <div className="space-y-1.5 text-slate-200">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-300">平均时长</span>
              <span>{formatDuration(activeItem.avgDurationMs)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-300">超时实例率</span>
              <span>{formatPercent(activeItem.timeoutInstanceRate)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-300">异常实例率</span>
              <span>{formatPercent(activeItem.anomalyInstanceRate)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-300">总量</span>
              <span>{formatCount(activeItem.totalCount)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full">
          {Array.from({ length: 5 }, (_, index) => {
            const x = padding.left + (chartW / 4) * index;
            return (
              <line
                key={`v-${index}`}
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="currentColor"
                strokeWidth={1}
                className="text-slate-200 dark:text-slate-800"
              />
            );
          })}
          {Array.from({ length: 5 }, (_, index) => {
            const y = padding.top + (chartH / 4) * index;
            return (
              <line
                key={`h-${index}`}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                className="text-slate-200 dark:text-slate-800"
              />
            );
          })}

          {data.map((item) => {
            const selected = selectedProcess === item.processDefKey;
            const totalRisk = item.timeoutInstanceRate + item.anomalyInstanceRate;
            const fill =
              totalRisk <= 5
                ? 'rgba(16,185,129,0.55)'
                : totalRisk <= 12
                  ? 'rgba(245,158,11,0.55)'
                  : 'rgba(244,63,94,0.6)';
            return (
              <circle
                key={item.processDefKey}
                cx={toX(item.avgDurationMs)}
                cy={toY(totalRisk)}
                r={radius(item.totalCount)}
                fill={fill}
                stroke={selected ? '#06b6d4' : '#0f172a'}
                strokeWidth={selected ? 3 : 1.5}
                className="cursor-pointer"
                data-testid={`performance-matrix-${item.processDefKey}`}
                onMouseEnter={() => setHoveredKey(item.processDefKey)}
                onMouseMove={() => setHoveredKey(item.processDefKey)}
                onClick={() => onSelect(item.processDefKey)}
              />
            );
          })}

          <text
            x={width / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            className="text-slate-500 dark:text-slate-400"
          >
            平均时长
          </text>
          <text
            x={16}
            y={height / 2}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            transform={`rotate(-90 16 ${height / 2})`}
            className="text-slate-500 dark:text-slate-400"
          >
            风险强度
          </text>

          <text x={padding.left} y={height - 14} fontSize={10} fill="currentColor" className="text-slate-400 dark:text-slate-500">
            0
          </text>
          <text x={width - padding.right} y={height - 14} textAnchor="end" fontSize={10} fill="currentColor" className="text-slate-400 dark:text-slate-500">
            {formatChartDuration(maxDuration)}
          </text>
          <text x={padding.left - 6} y={padding.top + 4} textAnchor="end" fontSize={10} fill="currentColor" className="text-slate-400 dark:text-slate-500">
            {formatPercent(maxRisk)}
          </text>
          <text x={padding.left - 6} y={height - padding.bottom + 4} textAnchor="end" fontSize={10} fill="currentColor" className="text-slate-400 dark:text-slate-500">
            0.0%
          </text>
        </svg>
      </div>
    </div>
  );
};

const timeoutLevelTone = (level: string) => {
  if (level === 'CRITICAL') {
    return { stroke: '#f43f5e', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-300' };
  }
  if (level === 'WARNING') {
    return { stroke: '#f59e0b', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-300' };
  }
  return { stroke: '#06b6d4', dot: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-300' };
};

const TimeoutLevelDistributionCard: React.FC<{
  items: PerformanceTimeoutLevelBreakdownItem[];
  total: number;
  loading: boolean;
}> = ({ items, total, loading }) => {
  if (total <= 0 || items.length === 0) {
    return (
      <EmptyBlock
        title="暂无超时等级分布"
        description="当前筛选区间没有超时事件。"
        icon={<PieChart className="h-5 w-5" />}
        loading={loading}
      />
    );
  }

  const size = 112;
  const strokeWidth = 16;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  let startAngle = 0;
  const segments = items.map((item) => {
    const angle = total <= 0 ? 0 : (item.count / total) * 360;
    const segment = {
      ...item,
      startAngle,
      endAngle: startAngle + angle,
    };
    startAngle += angle;
    return segment;
  });

  return (
    <div className="grid gap-4 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-28 w-28">
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-100">{formatCount(total)}</div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            超时事件
          </div>
        </div>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-slate-200 dark:text-slate-800"
          />
          {segments.map((segment) => {
            const tone = timeoutLevelTone(segment.level);
            return segment.endAngle <= segment.startAngle ? null : (
              <path
                key={segment.level}
                d={describeArc(center, center, radius, segment.startAngle, segment.endAngle)}
                fill="none"
                stroke={tone.stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
      </div>

      <div className="grid gap-3">
        {segments.map((item) => {
          const tone = timeoutLevelTone(item.level);
          return (
            <div key={item.level} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', tone.dot)} />
                <span className="truncate text-sm text-slate-700 dark:text-slate-200">{item.label}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatCount(item.count)}
                </div>
                <div className={cn('text-xs', tone.text)}>{formatPercent(item.rate)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const anomalyBarTone = (index: number) => {
  const tones = [
    'bg-rose-500',
    'bg-[#0d95b5]',
    'bg-orange-500',
    'bg-amber-500',
    'bg-[var(--cf-text-muted)]',
  ];
  return tones[index % tones.length];
};

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
      {rows.map((item, index) => (
        <div key={item.type} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm text-slate-700 dark:text-slate-200">{getAnomalyTypeLabel(item.type) || item.label}</div>
            <div className="text-right">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatCount(item.count)}
              </span>
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{formatPercent(item.rate)}</span>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800">
            <div
              className={cn('h-full rounded-md', anomalyBarTone(index))}
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
  const [dateRange, setDateRange] = useState({
    startDate: getDaysAgoDateString(29),
    endDate: getLocalDateString(),
  });
  const [selectedProcess, setSelectedProcess] = useState('');
  const [rangePreset, setRangePreset] = useState('30');
  const [processCatalog, setProcessCatalog] = useState<Record<string, string>>({});

  const loadDashboard = async () => {
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
  };

  useEffect(() => {
    void loadDashboard();
  }, [dateRange.endDate, dateRange.startDate, selectedProcess]);

  const applyRangePreset = (value: string) => {
    setRangePreset(value);
    const days = Number(value);
    if (Number.isNaN(days)) {
      return;
    }
    setDateRange({
      startDate: getDaysAgoDateString(days - 1),
      endDate: getLocalDateString(),
    });
  };

  const handleStartDateChange = (value: string) => {
    setRangePreset('custom');
    setDateRange((previous) => ({ ...previous, startDate: value }));
  };

  const handleEndDateChange = (value: string) => {
    setRangePreset('custom');
    setDateRange((previous) => ({ ...previous, endDate: value }));
  };

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
          <Button variant="outline" size="sm" onClick={() => void loadDashboard()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
            刷新
          </Button>
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
          <SegmentedControl className="min-h-9">
            {RANGE_PRESETS.map((item) => (
              <SegmentedControlItem
                key={item.value}
                size="sm"
                active={rangePreset === item.value}
                onClick={() => applyRangePreset(item.value)}
              >
                {item.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>

          <label>
            <span className="input-label">开始日期</span>
            <DatePicker
              className="cf-control admin-performance-date-control"
              type="date"
              value={dateRange.startDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
            />
          </label>
          <label>
            <span className="input-label">结束日期</span>
            <DatePicker
              className="cf-control admin-performance-date-control"
              type="date"
              value={dateRange.endDate}
              onChange={(event) => handleEndDateChange(event.target.value)}
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">
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
                      <span className="text-xs text-slate-500 dark:text-slate-400">
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
                      <span className="text-xs text-slate-500 dark:text-slate-400">
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
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
                </div>
              ) : null}
              <div className="admin-performance-panel-head">
                <SectionHeader
                  title="流程明细表"
                  action={
                    <span className="text-xs text-slate-500 dark:text-slate-400">
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
                          <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {item.processName}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
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
