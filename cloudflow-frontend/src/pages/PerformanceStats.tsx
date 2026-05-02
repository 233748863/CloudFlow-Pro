import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import {
  PerformanceStats as PerformanceStatsItem,
  getPerformanceStats,
} from '@/services/api/monitor';
import { downloadBlob } from '@/utils/download';
import { cn } from '@/utils/cn';

interface AggregatedProcessStat {
  processDefKey: string;
  processName: string;
  totalCount: number;
  completedCount: number;
  avgDurationMs: number;
  successRate: number;
  timeoutRate: number;
  anomalyRate: number;
  dayCount: number;
}

interface DailyTrendStat {
  statDate: string;
  totalCount: number;
  completedCount: number;
  successRate: number;
  timeoutRate: number;
  anomalyRate: number;
}

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

const formatDuration = (ms: number): string => {
  const safeMs = Number.isFinite(ms) ? Math.max(ms, 0) : 0;
  const seconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
  return `${seconds}秒`;
};

const formatCount = (value: number) => value.toLocaleString('zh-CN');

const getSuccessTone = (value: number) => {
  if (value >= 95) return 'text-emerald-600 dark:text-emerald-300';
  if (value >= 80) return 'text-amber-600 dark:text-amber-300';
  return 'text-rose-600 dark:text-rose-300';
};

const getRiskTone = (value: number) => {
  if (value <= 5) return 'text-emerald-600 dark:text-emerald-300';
  if (value <= 20) return 'text-amber-600 dark:text-amber-300';
  return 'text-rose-600 dark:text-rose-300';
};

const getRateBadgeClassName = (value: number, inverse?: boolean) => {
  if (inverse) {
    if (value >= 95) {
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200';
    }
    if (value >= 80) {
      return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200';
    }
    return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200';
  }

  if (value <= 5) {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (value <= 20) {
    return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200';
  }
  return 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200';
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

const EmptyBlock: React.FC<{
  title: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const MetricField: React.FC<{
  label: string;
  children: React.ReactNode;
  valueClassName?: string;
}> = ({ label, children, valueClassName }) => (
  <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
      {label}
    </span>
    <div className={cn('text-sm font-semibold text-slate-900 dark:text-slate-100', valueClassName)}>
      {children}
    </div>
  </div>
);

const SideFieldRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3">
    <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-right text-sm font-medium text-slate-900 dark:text-slate-100">{children}</span>
  </div>
);

const SectionHeader: React.FC<{
  title: string;
  meta?: React.ReactNode;
}> = ({ title, meta }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {meta ? <div className="text-xs text-slate-500 dark:text-slate-400">{meta}</div> : null}
  </div>
);

const PerformanceStats: React.FC = () => {
  const [stats, setStats] = useState<PerformanceStatsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: getDaysAgoDateString(29),
    endDate: getLocalDateString(),
  });
  const [selectedProcess, setSelectedProcess] = useState('');
  const [rangePreset, setRangePreset] = useState('30');

  const loadStats = async () => {
    try {
      setLoading(true);
      const params: { startDate: string; endDate: string; processDefKey?: string } = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };

      if (selectedProcess) {
        params.processDefKey = selectedProcess;
      }

      const data = await getPerformanceStats(params);
      setStats(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('加载性能统计失败:', error);
      toast.error(getErrorMessage(error, '加载性能统计失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, [dateRange, selectedProcess]);

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

  const exportStats = () => {
    const csv = [
      ['日期', '流程类型', '总数', '完成数', '平均时长', '最长时长', '最短时长', '成功率', '超时率', '异常率'].join(','),
      ...stats.map((stat) =>
        [
          stat.statDate,
          stat.processName,
          stat.totalCount,
          stat.completedCount,
          formatDuration(stat.avgDurationMs),
          formatDuration(stat.maxDurationMs),
          formatDuration(stat.minDurationMs),
          `${stat.successRate.toFixed(1)}%`,
          `${stat.timeoutRate.toFixed(1)}%`,
          `${stat.anomalyRate.toFixed(1)}%`,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const fileName = downloadBlob(blob, `performance_stats_${dateRange.startDate}_${dateRange.endDate}.csv`);

    toast.success(
      stats.length > 0
        ? `已导出 ${stats.length} 条性能统计，文件：${fileName}`
        : `已导出空结果，文件：${fileName}`,
    );
  };

  const processOptions = useMemo(() => {
    const map = new Map<string, string>();

    stats.forEach((item) => {
      if (!map.has(item.processDefKey)) {
        map.set(item.processDefKey, item.processName);
      }
    });

    if (selectedProcess && !map.has(selectedProcess)) {
      map.set(selectedProcess, selectedProcess);
    }

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [selectedProcess, stats]);

  const selectedProcessLabel = useMemo(() => {
    if (!selectedProcess) {
      return '全部流程';
    }
    return processOptions.find((option) => option.value === selectedProcess)?.label || selectedProcess;
  }, [processOptions, selectedProcess]);

  const summary = useMemo(() => {
    const initial = {
      totalCount: 0,
      completedCount: 0,
      avgDurationWeight: 0,
      successRateWeight: 0,
      timeoutRateWeight: 0,
      anomalyRateWeight: 0,
    };

    const result = stats.reduce((acc, stat) => {
      acc.totalCount += stat.totalCount;
      acc.completedCount += stat.completedCount;
      acc.avgDurationWeight += stat.avgDurationMs * stat.totalCount;
      acc.successRateWeight += stat.successRate * stat.totalCount;
      acc.timeoutRateWeight += stat.timeoutRate * stat.totalCount;
      acc.anomalyRateWeight += stat.anomalyRate * stat.totalCount;
      return acc;
    }, initial);

    const averageDuration = result.totalCount > 0 ? result.avgDurationWeight / result.totalCount : 0;
    const successRate = result.totalCount > 0 ? result.successRateWeight / result.totalCount : 0;
    const timeoutRate = result.totalCount > 0 ? result.timeoutRateWeight / result.totalCount : 0;
    const anomalyRate = result.totalCount > 0 ? result.anomalyRateWeight / result.totalCount : 0;

    let healthLabel = '观察中';

    if (successRate >= 95 && timeoutRate <= 5 && anomalyRate <= 3) {
      healthLabel = '稳定';
    } else if (successRate >= 85 && timeoutRate <= 12 && anomalyRate <= 8) {
      healthLabel = '可控';
    } else if (result.totalCount > 0) {
      healthLabel = '预警';
    }

    return {
      totalCount: result.totalCount,
      completedCount: result.completedCount,
      averageDuration,
      successRate,
      timeoutRate,
      anomalyRate,
      healthLabel,
    };
  }, [stats]);

  const processAggregates = useMemo(() => {
    const grouped = new Map<string, AggregatedProcessStat>();

    stats.forEach((item) => {
      const current = grouped.get(item.processDefKey) || {
        processDefKey: item.processDefKey,
        processName: item.processName,
        totalCount: 0,
        completedCount: 0,
        avgDurationMs: 0,
        successRate: 0,
        timeoutRate: 0,
        anomalyRate: 0,
        dayCount: 0,
      };

      current.totalCount += item.totalCount;
      current.completedCount += item.completedCount;
      current.avgDurationMs += item.avgDurationMs * item.totalCount;
      current.successRate += item.successRate * item.totalCount;
      current.timeoutRate += item.timeoutRate * item.totalCount;
      current.anomalyRate += item.anomalyRate * item.totalCount;
      current.dayCount += 1;
      grouped.set(item.processDefKey, current);
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        avgDurationMs: item.totalCount > 0 ? item.avgDurationMs / item.totalCount : 0,
        successRate: item.totalCount > 0 ? item.successRate / item.totalCount : 0,
        timeoutRate: item.totalCount > 0 ? item.timeoutRate / item.totalCount : 0,
        anomalyRate: item.totalCount > 0 ? item.anomalyRate / item.totalCount : 0,
      }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [stats]);

  const dailyTrends = useMemo(() => {
    const grouped = new Map<string, DailyTrendStat>();

    stats.forEach((item) => {
      const current = grouped.get(item.statDate) || {
        statDate: item.statDate,
        totalCount: 0,
        completedCount: 0,
        successRate: 0,
        timeoutRate: 0,
        anomalyRate: 0,
      };

      current.totalCount += item.totalCount;
      current.completedCount += item.completedCount;
      current.successRate += item.successRate * item.totalCount;
      current.timeoutRate += item.timeoutRate * item.totalCount;
      current.anomalyRate += item.anomalyRate * item.totalCount;
      grouped.set(item.statDate, current);
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        successRate: item.totalCount > 0 ? item.successRate / item.totalCount : 0,
        timeoutRate: item.totalCount > 0 ? item.timeoutRate / item.totalCount : 0,
        anomalyRate: item.totalCount > 0 ? item.anomalyRate / item.totalCount : 0,
      }))
      .sort((a, b) => a.statDate.localeCompare(b.statDate));
  }, [stats]);

  const topProcesses = processAggregates.slice(0, 6);
  const riskProcesses = [...processAggregates]
    .sort((a, b) => b.timeoutRate + b.anomalyRate - (a.timeoutRate + a.anomalyRate))
    .slice(0, 5);
  const tableRows = processAggregates;
  const visibleDailyTrends = dailyTrends.slice(-10);
  const maxProcessTotal = Math.max(...topProcesses.map((item) => item.totalCount), 1);
  const maxDailyTotal = Math.max(...visibleDailyTrends.map((item) => item.totalCount), 1);

  const handleStartDateChange = (value: string) => {
    setRangePreset('custom');
    setDateRange((prev) => ({ ...prev, startDate: value }));
  };

  const handleEndDateChange = (value: string) => {
    setRangePreset('custom');
    setDateRange((prev) => ({ ...prev, endDate: value }));
  };

  const isInitialLoading = loading && stats.length === 0;
  const hasNoData = !loading && stats.length === 0;

  return (
    <TablePageLayout
      className="gap-4"
      filters={
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
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

            <DatePicker
              className="h-10 w-full sm:w-40"
              type="date"
              value={dateRange.startDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
            />
            <DatePicker
              className="h-10 w-full sm:w-40"
              type="date"
              value={dateRange.endDate}
              onChange={(event) => handleEndDateChange(event.target.value)}
            />

            <div className="w-full sm:w-56">
              <Select
                value={selectedProcess || 'all'}
                onValueChange={(value) => setSelectedProcess(value === 'all' ? '' : value)}
              >
                <SelectTrigger>
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
            </div>
          </div>

          <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => void loadStats()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={exportStats}
              disabled={stats.length === 0}
            >
              <Download className="h-4 w-4" />
              导出 CSV
            </Button>
          </div>
        </div>
      }
      table={
        <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_284px]">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {isInitialLoading ? (
              <section className="p-5 sm:p-6">
                <EmptyBlock title="正在加载性能统计" loading />
              </section>
            ) : hasNoData ? (
              <section className="p-5 sm:p-6">
                <EmptyBlock title="暂无统计数据" icon={<Activity className="h-5 w-5" />} />
              </section>
            ) : (
              <>
                <section className="p-5 sm:p-6">
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="grid gap-0 md:grid-cols-3 xl:grid-cols-6">
                      <MetricField label="样本总数">{formatCount(summary.totalCount)}</MetricField>
                      <MetricField label="完成数">{formatCount(summary.completedCount)}</MetricField>
                      <MetricField label="平均时长">{formatDuration(summary.averageDuration)}</MetricField>
                      <MetricField
                        label="成功率"
                        valueClassName={cn('font-semibold', getSuccessTone(summary.successRate))}
                      >
                        {summary.successRate.toFixed(1)}%
                      </MetricField>
                      <MetricField
                        label="超时率"
                        valueClassName={cn('font-semibold', getRiskTone(summary.timeoutRate))}
                      >
                        {summary.timeoutRate.toFixed(1)}%
                      </MetricField>
                      <MetricField label="健康状态">
                        <span
                          className={cn(
                            'inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold',
                            getHealthBadgeClassName(summary.healthLabel),
                          )}
                        >
                          {summary.healthLabel}
                        </span>
                      </MetricField>
                    </div>
                  </div>
                </section>

                <section className="p-5 sm:p-6">
                  <SectionHeader title="流程分布" meta={`${topProcesses.length} 项`} />

                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="hidden bg-slate-50 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:bg-slate-900/70 dark:text-slate-500 md:grid md:grid-cols-[minmax(0,1fr)_96px_128px_96px_96px] md:items-center">
                      <span>流程</span>
                      <span>总数</span>
                      <span>平均时长</span>
                      <span>成功率</span>
                      <span>风险率</span>
                    </div>

                    {topProcesses.length > 0 ? (
                      topProcesses.map((item) => (
                        <div
                          key={item.processDefKey}
                          className="grid gap-3 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_96px_128px_96px_96px] md:items-center"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              {item.processName}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                              {item.processDefKey}
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                              <div
                                className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400"
                                style={{ width: `${Math.max((item.totalCount / maxProcessTotal) * 100, 8)}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-300">
                            {formatCount(item.totalCount)}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-300">
                            {formatDuration(item.avgDurationMs)}
                          </div>
                          <div className={cn('text-sm font-semibold', getSuccessTone(item.successRate))}>
                            {item.successRate.toFixed(1)}%
                          </div>
                          <div
                            className={cn(
                              'text-sm font-semibold',
                              getRiskTone(item.timeoutRate + item.anomalyRate),
                            )}
                          >
                            {(item.timeoutRate + item.anomalyRate).toFixed(1)}%
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyBlock title="暂无流程分布" icon={<Activity className="h-5 w-5" />} />
                    )}
                  </div>
                </section>

                <section className="p-5 sm:p-6">
                  <SectionHeader title="日期趋势" meta={`最近 ${visibleDailyTrends.length} 天`} />

                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="hidden bg-slate-50 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:bg-slate-900/70 dark:text-slate-500 md:grid md:grid-cols-[112px_88px_104px_88px_88px_minmax(0,1fr)] md:items-center">
                      <span>日期</span>
                      <span>总数</span>
                      <span>成功率</span>
                      <span>超时率</span>
                      <span>异常率</span>
                      <span>趋势</span>
                    </div>

                    {visibleDailyTrends.length > 0 ? (
                      visibleDailyTrends.map((item) => (
                        <div
                          key={item.statDate}
                          className="grid gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 dark:border-slate-800 md:grid-cols-[112px_88px_104px_88px_88px_minmax(0,1fr)] md:items-center"
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {item.statDate}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-300">
                            {formatCount(item.totalCount)}
                          </div>
                          <div className={cn('text-sm font-semibold', getSuccessTone(item.successRate))}>
                            {item.successRate.toFixed(1)}%
                          </div>
                          <div className={cn('text-sm font-semibold', getRiskTone(item.timeoutRate))}>
                            {item.timeoutRate.toFixed(1)}%
                          </div>
                          <div className={cn('text-sm font-semibold', getRiskTone(item.anomalyRate))}>
                            {item.anomalyRate.toFixed(1)}%
                          </div>
                          <div className="w-full">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                              <div
                                className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400"
                                style={{
                                  width: `${Math.max((item.totalCount / maxDailyTotal) * 100, item.totalCount > 0 ? 10 : 4)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyBlock title="暂无日期趋势" icon={<Activity className="h-5 w-5" />} />
                    )}
                  </div>
                </section>

                <section className="p-5 sm:p-6">
                  <SectionHeader title="结果明细" meta={`${tableRows.length} 项`} />

                  <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
                          <TableHead className="w-[28%]">流程</TableHead>
                          <TableHead className="text-right">总数</TableHead>
                          <TableHead className="text-right">完成数</TableHead>
                          <TableHead className="text-right">平均时长</TableHead>
                          <TableHead className="text-right">统计天数</TableHead>
                          <TableHead className="text-right">成功率</TableHead>
                          <TableHead className="text-right">超时率</TableHead>
                          <TableHead className="text-right">异常率</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableRows.map((item) => (
                          <TableRow key={item.processDefKey}>
                            <TableCell className="min-w-0">
                              <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                {item.processName}
                              </div>
                              <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                {item.processDefKey}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{formatCount(item.totalCount)}</TableCell>
                            <TableCell className="text-right">{formatCount(item.completedCount)}</TableCell>
                            <TableCell className="text-right">
                              {formatDuration(item.avgDurationMs)}
                            </TableCell>
                            <TableCell className="text-right">{formatCount(item.dayCount)}</TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                  getRateBadgeClassName(item.successRate, true),
                                )}
                              >
                                {item.successRate.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                  getRateBadgeClassName(item.timeoutRate),
                                )}
                              >
                                {item.timeoutRate.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                  getRateBadgeClassName(item.anomalyRate),
                                )}
                              >
                                {item.anomalyRate.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </>
            )}
          </div>

          <aside className="border-t border-slate-200 dark:border-slate-800 xl:border-l xl:border-t-0">
            <section className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
              <SectionHeader title="统计上下文" />

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <SideFieldRow label="统计范围">
                  {dateRange.startDate} ~ {dateRange.endDate}
                </SideFieldRow>
                <SideFieldRow label="流程类型">{selectedProcessLabel}</SideFieldRow>
                <SideFieldRow label="样本 / 完成">
                  {formatCount(summary.totalCount)} / {formatCount(summary.completedCount)}
                </SideFieldRow>
                <SideFieldRow label="平均时长">{formatDuration(summary.averageDuration)}</SideFieldRow>
                <SideFieldRow label="异常率">
                  <span className={getRiskTone(summary.anomalyRate)}>{summary.anomalyRate.toFixed(1)}%</span>
                </SideFieldRow>
                <SideFieldRow label="健康状态">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
                      getHealthBadgeClassName(summary.healthLabel),
                    )}
                  >
                    {summary.healthLabel}
                  </span>
                </SideFieldRow>
              </div>
            </section>

            <section className="p-5 sm:p-6">
              <SectionHeader title="风险焦点" meta={`${riskProcesses.length} 项`} />

              {riskProcesses.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  {riskProcesses.map((item, index) => (
                    <div
                      key={item.processDefKey}
                      className={cn(
                        'px-4 py-4',
                        index > 0 && 'border-t border-slate-200 dark:border-slate-800',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {item.processName}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                            {item.processDefKey}
                          </div>
                        </div>
                        <span className={cn('text-sm font-semibold whitespace-nowrap', getRiskTone(item.timeoutRate + item.anomalyRate))}>
                          {(item.timeoutRate + item.anomalyRate).toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>成功 {item.successRate.toFixed(1)}%</span>
                        <span>超时 {item.timeoutRate.toFixed(1)}%</span>
                        <span>异常 {item.anomalyRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyBlock title="暂无风险流程" icon={<AlertTriangle className="h-5 w-5" />} />
                </div>
              )}
            </section>
          </aside>
        </div>
      }
    />
  );
};

export default PerformanceStats;
