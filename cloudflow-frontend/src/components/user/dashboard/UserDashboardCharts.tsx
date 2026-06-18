import React, { useMemo, useState } from 'react';
import { PieChart, RefreshCw, TrendingUp } from 'lucide-react';
import {
  Button,
  Card,
  DatePicker,
  EmptyState,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';

type DashboardTone = 'cyan' | 'emerald' | 'amber' | 'slate';
type TrendSeriesKey = keyof Pick<
  UserDashboardTrendPoint,
  'tasks' | 'applications' | 'announcements' | 'schedules'
>;

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

const seriesMeta: Array<{ key: TrendSeriesKey; label: string; tone: DashboardTone }> = [
  { key: 'tasks', label: '待办审批', tone: 'cyan' },
  { key: 'applications', label: '我的申请', tone: 'emerald' },
  { key: 'announcements', label: '公告提醒', tone: 'amber' },
  { key: 'schedules', label: '日程安排', tone: 'slate' },
];

const DONUT_SIZE = 176;
const DONUT_STROKE_WIDTH = 22;
const DONUT_CENTER = DONUT_SIZE / 2;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE_WIDTH) / 2;

const formatTrendValue = (value: number) => value.toLocaleString('zh-CN');

const getTooltipTransform = (xPercent: number) => {
  if (xPercent <= 18) {
    return 'translateX(0)';
  }

  if (xPercent >= 82) {
    return 'translateX(-100%)';
  }

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

const DistributionCard: React.FC<{
  loading: boolean;
  items: UserDashboardDistributionItem[];
}> = ({ loading, items }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  const segments = useMemo(() => {
    let startAngle = 0;

    return items.map((item) => {
      const percentage = total === 0 ? 0 : Math.round((item.count / total) * 100);
      const angle = total === 0 ? 0 : (item.count / total) * 360;
      const segment = {
        ...item,
        percentage,
        startAngle,
        endAngle: startAngle + angle,
      };
      startAngle += angle;
      return segment;
    });
  }, [items, total]);

  const activeSegment =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < segments.length
      ? segments[hoveredIndex]
      : null;

  return (
    <Card className="relative h-full overflow-hidden p-4">
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
          description="尝试调整时间范围，或刷新后重新查看。"
          className="px-0 py-8"
        />
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
          <div
            className="mx-auto flex w-full max-w-[220px] justify-center"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="relative h-44 w-44">
              {activeSegment ? (
                <div className="pointer-events-none absolute left-1/2 top-2 z-10 min-w-[176px] -translate-x-1/2 rounded-2xl border border-slate-800/80 bg-slate-950/92 px-3 py-2 text-xs shadow-[0_18px_36px_rgba(15,23,42,0.24)] backdrop-blur-sm">
                  <div className="mb-2 text-[11px] font-semibold text-white">
                    {activeSegment.label}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-300">数量</span>
                      <span className="font-medium text-white">
                        {formatTrendValue(activeSegment.count)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-300">占比</span>
                      <span className="font-medium text-white">
                        {activeSegment.percentage}%
                      </span>
                    </div>
                    <div className="border-t border-white/10 pt-1.5 text-[11px] leading-5 text-slate-300">
                      {activeSegment.description}
                    </div>
                  </div>
                </div>
              ) : null}

              <svg
                viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
                className="h-full w-full"
                aria-label="工作负载分布"
              >
                <circle
                  cx={DONUT_CENTER}
                  cy={DONUT_CENTER}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={DONUT_STROKE_WIDTH}
                  className="text-slate-200 dark:text-slate-800"
                />

                {segments.map((segment, index) => {
                  if (segment.count <= 0 || segment.endAngle <= segment.startAngle) {
                    return null;
                  }

                  const tone = toneStyles[segment.tone];
                  const active = hoveredIndex === index;

                  return (
                    <path
                      key={segment.label}
                      d={describeArc(
                        DONUT_CENTER,
                        DONUT_CENTER,
                        DONUT_RADIUS,
                        segment.startAngle,
                        segment.endAngle,
                      )}
                      fill="none"
                      stroke={tone.solid}
                      strokeWidth={active ? DONUT_STROKE_WIDTH + 4 : DONUT_STROKE_WIDTH}
                      strokeLinecap="butt"
                      style={{
                        filter: active ? `drop-shadow(0 0 10px ${tone.fill})` : undefined,
                        transition: 'stroke-width 160ms ease, filter 160ms ease',
                      }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseMove={() => setHoveredIndex(index)}
                    />
                  );
                })}
              </svg>

              <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full border border-slate-200 bg-white text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
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
            {segments.map((item, index) => {
              const tone = toneStyles[item.tone];
              const active = hoveredIndex === index;

              return (
                <div
                  key={item.label}
                  className={`rounded-2xl border p-3 transition-all ${
                    active
                      ? 'border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900'
                      : 'border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/70'
                  }`}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
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
                        {item.percentage}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

const TrendCard: React.FC<{
  loading: boolean;
  trend: UserDashboardTrendPoint[];
  granularity: 'day' | 'hour';
}> = ({ loading, trend, granularity }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 960;
  const height = 420;
  const padding = { top: 18, right: 24, bottom: 52, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...trend.map((item) =>
      Math.max(item.tasks, item.applications, item.announcements, item.schedules),
    ),
  );

  const labelStep = Math.max(1, Math.ceil(trend.length / (granularity === 'hour' ? 12 : 8)));
  const x = (index: number) =>
    padding.left + (index / Math.max(trend.length - 1, 1)) * chartWidth;
  const y = (value: number) =>
    padding.top + chartHeight - (value / maxValue) * chartHeight;
  const activeIndex =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < trend.length ? hoveredIndex : null;
  const activePoint = activeIndex !== null ? trend[activeIndex] : null;
  const activeX = activeIndex !== null ? x(activeIndex) : null;
  const activeXPercent = activeX !== null ? (activeX / width) * 100 : 0;

  const getHoverZone = (index: number) => {
    if (trend.length <= 1) {
      return { x: padding.left, width: chartWidth };
    }

    const currentX = x(index);
    const previousBoundary =
      index === 0 ? padding.left : (x(index - 1) + currentX) / 2;
    const nextBoundary =
      index === trend.length - 1 ? width - padding.right : (currentX + x(index + 1)) / 2;

    return {
      x: previousBoundary,
      width: nextBoundary - previousBoundary,
    };
  };

  const linePath = (key: TrendSeriesKey) =>
    trend
      .map((item, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(item[key])}`)
      .join(' ');

  const areaPath = (key: TrendSeriesKey) =>
    `${linePath(key)} L${x(trend.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <Card className="relative flex h-full flex-col overflow-hidden p-4">
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
        <div
          className="relative flex min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {activePoint && activeX !== null ? (
            <div
              className="pointer-events-none absolute z-10 min-w-[176px] rounded-2xl border border-slate-800/80 bg-slate-950/92 px-3 py-2 text-xs shadow-[0_18px_36px_rgba(15,23,42,0.24)] backdrop-blur-sm"
              style={{
                left: `${activeXPercent}%`,
                top: 12,
                transform: getTooltipTransform(activeXPercent),
              }}
            >
              <div className="mb-2 text-[11px] font-semibold text-white">
                {activePoint.label}
              </div>
              <div className="space-y-1.5">
                {seriesMeta.map((series) => (
                  <div key={series.key} className="flex items-center justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 text-slate-200">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: toneStyles[series.tone].solid }}
                      />
                      {series.label}
                    </span>
                    <span className="font-medium text-white">
                      {formatTrendValue(activePoint[series.key])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full">
            {Array.from({ length: 5 }, (_, index) => {
              const value = Math.round((maxValue / 4) * index);
              const lineY = y(value);
              return (
                <g key={`grid-${index}-${value}`}>
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
                  <path d={areaPath(series.key)} fill={toneStyles[series.tone].fill} />
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

            {activeX !== null ? (
              <line
                x1={activeX}
                y1={padding.top}
                x2={activeX}
                y2={padding.top + chartHeight}
                stroke="currentColor"
                strokeWidth={1.25}
                strokeDasharray="5 5"
                className="text-slate-300 dark:text-slate-700"
              />
            ) : null}

            {activePoint && activeIndex !== null
              ? seriesMeta.map((series) => (
                  <g key={`active-${series.key}`}>
                    <circle
                      cx={x(activeIndex)}
                      cy={y(activePoint[series.key])}
                      r={5.5}
                      fill="white"
                      fillOpacity={0.96}
                    />
                    <circle
                      cx={x(activeIndex)}
                      cy={y(activePoint[series.key])}
                      r={3.5}
                      fill={toneStyles[series.tone].stroke}
                    />
                  </g>
                ))
              : null}

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

            {trend.map((item, index) => {
              const zone = getHoverZone(index);
              return (
                <rect
                  key={`hover-zone-${item.label}-${index}`}
                  x={zone.x}
                  y={padding.top}
                  width={zone.width}
                  height={chartHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                />
              );
            })}
          </svg>
        </div>
      )}
    </Card>
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
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[152px]">
            <Label
              htmlFor="dashboard-start-date"
              className="mb-1.5 block text-xs text-slate-500 dark:text-slate-400"
            >
              开始日期
            </Label>
            <DatePicker
              id="dashboard-start-date"
              type="date"
              className="h-10"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
            />
          </div>
          <div className="w-[152px]">
            <Label
              htmlFor="dashboard-end-date"
              className="mb-1.5 block text-xs text-slate-500 dark:text-slate-400"
            >
              结束日期
            </Label>
            <DatePicker
              id="dashboard-end-date"
              type="date"
              className="h-10"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </div>
        </div>

        <div className="min-w-[132px]">
          <Label className="mb-1.5 block text-xs text-slate-500 dark:text-slate-400">
            聚合粒度
          </Label>
          <Select
            value={granularity}
            onValueChange={(value) => onGranularityChange(value as 'day' | 'hour')}
          >
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
    </Card>

    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <DistributionCard loading={loading} items={distribution} />
      <TrendCard loading={loading} trend={trend} granularity={granularity} />
    </div>
  </div>
);
