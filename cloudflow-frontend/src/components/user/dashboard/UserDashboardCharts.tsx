import React, { useMemo } from 'react';
import { PieChart, RefreshCw, TrendingUp } from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

type DashboardTone = 'cyan' | 'emerald' | 'amber' | 'slate';

export interface UserDashboardDistributionItem {
  label: string;
  count: number;
  description: string;
  tone: DashboardTone;
}

export interface UserDashboardTrendPoint {
  label: string;
  shortLabel: string;
  tasks: number;
  applications: number;
  announcements: number;
  schedules: number;
}

interface UserDashboardChartsProps {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'hour';
  loading: boolean;
  distribution: UserDashboardDistributionItem[];
  trend: UserDashboardTrendPoint[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onGranularityChange: (value: 'day' | 'hour') => void;
  onRefresh: () => void;
}

const toneStyles: Record<
  DashboardTone,
  { solid: string; soft: string; text: string; stroke: string; fill: string }
> = {
  cyan: {
    solid: '#06b6d4',
    soft: 'bg-cyan-100 dark:bg-cyan-950/30',
    text: 'text-cyan-700 dark:text-cyan-200',
    stroke: '#06b6d4',
    fill: 'rgba(6, 182, 212, 0.12)',
  },
  emerald: {
    solid: '#10b981',
    soft: 'bg-emerald-100 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-200',
    stroke: '#10b981',
    fill: 'rgba(16, 185, 129, 0.12)',
  },
  amber: {
    solid: '#f59e0b',
    soft: 'bg-amber-100 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-200',
    stroke: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.12)',
  },
  slate: {
    solid: '#64748b',
    soft: 'bg-slate-200 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-200',
    stroke: '#64748b',
    fill: 'rgba(100, 116, 139, 0.12)',
  },
};

const seriesMeta = [
  { key: 'tasks', label: '待办审批', tone: 'cyan' as const },
  { key: 'applications', label: '我的申请', tone: 'emerald' as const },
  { key: 'announcements', label: '公告提醒', tone: 'amber' as const },
  { key: 'schedules', label: '日程安排', tone: 'slate' as const },
];

const DistributionCard: React.FC<{
  loading: boolean;
  items: UserDashboardDistributionItem[];
}> = ({ loading, items }) => {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  const ringGradient = useMemo(() => {
    if (total === 0) {
      return 'conic-gradient(#e2e8f0 0 100%)';
    }

    let start = 0;
    const segments = items.map((item) => {
      const percentage = (item.count / total) * 100;
      const end = start + percentage;
      const segment = `${toneStyles[item.tone].solid} ${start}% ${end}%`;
      start = end;
      return segment;
    });

    return `conic-gradient(${segments.join(', ')})`;
  }, [items, total]);

  return (
    <div className="card relative overflow-hidden p-4">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65 backdrop-blur-sm dark:bg-slate-950/70">
          <LoadingSpinner size="lg" />
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-2">
        <PieChart size={18} className="text-slate-400 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          工作负载分布
        </h3>
      </div>

      {total === 0 ? (
        <EmptyState
          title="当前时间范围没有数据"
          description="尝试调整时间范围，或者刷新后重新查看。"
          className="px-0 py-8"
        />
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
          <div className="mx-auto flex w-full max-w-[220px] justify-center">
            <div
              className="relative h-44 w-44 rounded-full"
              style={{ backgroundImage: ringGradient }}
            >
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full border border-slate-200 bg-white text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  总计
                </div>
                <div className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                  {total}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  命中事项
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            {items.map((item) => {
              const percentage = total === 0 ? 0 : Math.round((item.count / total) * 100);
              const tone = toneStyles[item.tone];

              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tone.soft}`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${tone.text}`}
                          style={{ backgroundColor: tone.solid }}
                        />
                      </span>
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.label}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {item.description}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.count}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {percentage}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const TrendCard: React.FC<{
  loading: boolean;
  trend: UserDashboardTrendPoint[];
  granularity: 'day' | 'hour';
}> = ({ loading, trend, granularity }) => {
  const width = Math.max(720, trend.length * (granularity === 'hour' ? 26 : 86));
  const height = 280;
  const padding = { top: 18, right: 20, bottom: 42, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...trend.map((item) =>
      Math.max(item.tasks, item.applications, item.announcements, item.schedules),
    ),
  );

  const labelStep = Math.max(1, Math.ceil(trend.length / 6));
  const x = (index: number) =>
    padding.left + (index / Math.max(trend.length - 1, 1)) * chartWidth;
  const y = (value: number) =>
    padding.top + chartHeight - (value / maxValue) * chartHeight;

  const linePath = (key: keyof Pick<UserDashboardTrendPoint, 'tasks' | 'applications' | 'announcements' | 'schedules'>) =>
    trend
      .map((item, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(item[key])}`)
      .join(' ');

  const areaPath = (key: keyof Pick<UserDashboardTrendPoint, 'tasks' | 'applications' | 'announcements' | 'schedules'>) =>
    `${linePath(key)} L${x(trend.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <div className="card relative overflow-hidden p-4">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/65 backdrop-blur-sm dark:bg-slate-950/70">
          <LoadingSpinner size="lg" />
        </div>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-slate-400 dark:text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            协同趋势
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {seriesMeta.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: toneStyles[item.tone].solid }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {trend.length === 0 ? (
        <EmptyState
          title="没有可绘制的趋势数据"
          description="当前筛选区间内没有命中任何待办、申请、公告或日程。"
          className="px-0 py-8"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[720px]">
            {Array.from({ length: 5 }, (_, index) => {
              const value = Math.round((maxValue / 4) * index);
              const lineY = y(value);
              return (
                <g key={value}>
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
                    {value}
                  </text>
                </g>
              );
            })}

            {seriesMeta.map((series, index) => (
              <g key={series.key}>
                {index === 0 ? (
                  <path
                    d={areaPath(series.key)}
                    fill={toneStyles[series.tone].fill}
                  />
                ) : null}
                <path
                  d={linePath(series.key)}
                  fill="none"
                  stroke={toneStyles[series.tone].stroke}
                  strokeWidth={2}
                />
                {trend.map((item, pointIndex) => (
                  <circle
                    key={`${series.key}-${item.label}-${pointIndex}`}
                    cx={x(pointIndex)}
                    cy={y(item[series.key])}
                    r={2.75}
                    fill={toneStyles[series.tone].stroke}
                  />
                ))}
              </g>
            ))}

            {trend.map((item, index) =>
              index % labelStep === 0 || index === trend.length - 1 ? (
                <text
                  key={`${item.label}-${index}`}
                  x={x(index)}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  className="text-slate-400 dark:text-slate-500"
                >
                  {item.shortLabel}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      )}
    </div>
  );
};

export const UserDashboardCharts: React.FC<UserDashboardChartsProps> = ({
  startDate,
  endDate,
  granularity,
  loading,
  distribution,
  trend,
  onStartDateChange,
  onEndDateChange,
  onGranularityChange,
  onRefresh,
}) => (
  <div className="space-y-6">
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[152px]">
            <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              开始日期
            </div>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
            />
          </div>
          <div className="w-[152px]">
            <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              结束日期
            </div>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </div>
        </div>

        <div className="min-w-[132px]">
          <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            聚合粒度
          </div>
          <Select value={granularity} onValueChange={(value) => onGranularityChange(value as 'day' | 'hour')}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="选择粒度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">按天</SelectItem>
              <SelectItem value="hour">按小时</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-end">
          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            刷新数据
          </Button>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <DistributionCard loading={loading} items={distribution} />
      <TrendCard loading={loading} trend={trend} granularity={granularity} />
    </div>
  </div>
);
