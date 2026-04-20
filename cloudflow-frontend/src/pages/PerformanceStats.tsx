import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  Button,
  DatePicker,
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
} from '@/components/ui';
import {
  getPerformanceStats,
  PerformanceStats as PerformanceStatsItem,
} from '@/services/api/monitor';
import { toast } from 'sonner';
import { downloadBlob } from '@/utils/download';
import { cn } from '@/utils/cn';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceInlineState,
  WorkspacePageContent,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';

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

const cardClassName =
  'rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-sm shadow-slate-200/60 transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/88 dark:shadow-none';
const softPanelClassName =
  'rounded-3xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none';
const infoBlockClassName =
  'rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70';

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

const getPercent = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const formatDuration = (ms: number): string => {
  const safeMs = Number.isFinite(ms) ? Math.max(ms, 0) : 0;
  const seconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

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

const ProgressMetric = ({
  title,
  icon,
  value,
  hint,
  progress,
  progressClassName,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  hint: string;
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
      <div className="max-w-[180px] text-right text-sm text-slate-400 dark:text-slate-500">{hint}</div>
    </div>
    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
      <div
        className={cn('h-full rounded-full transition-all duration-500', progressClassName)}
        style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
      />
    </div>
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
      toast.error('加载性能统计失败');
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
      ['日期', '流程类型', '总数', '完成数', '平均时长', '最大时长', '最小时长', '成功率', '超时率', '异常率'].join(','),
      ...stats.map((stat) => [
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
      ].join(',')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const fileName = downloadBlob(blob, `performance_stats_${dateRange.startDate}_${dateRange.endDate}.csv`);

    toast.success(
      stats.length > 0
        ? `已导出 ${stats.length} 条性能统计，下载文件：${fileName}`
        : `已导出空结果，下载文件：${fileName}`,
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

    let healthLabel = '待观察';
    let healthTone = 'text-amber-600 dark:text-amber-300';
    let healthSummary = '当前统计样本还在积累，建议继续观察成功率、超时率和异常率的组合表现。';

    if (successRate >= 95 && timeoutRate <= 5 && anomalyRate <= 3) {
      healthLabel = '稳定';
      healthTone = 'text-emerald-600 dark:text-emerald-300';
      healthSummary = '成功率高且风险指标低，当前流程整体表现稳定。';
    } else if (successRate >= 85 && timeoutRate <= 12 && anomalyRate <= 8) {
      healthLabel = '可控';
      healthTone = 'text-sky-600 dark:text-sky-300';
      healthSummary = '整体质量可控，但仍建议继续优化超时与异常波动。';
    } else if (result.totalCount > 0) {
      healthLabel = '预警';
      healthTone = 'text-rose-600 dark:text-rose-300';
      healthSummary = '成功率或风险指标偏离健康区间，建议优先排查高风险流程。';
    }

    return {
      totalCount: result.totalCount,
      completedCount: result.completedCount,
      averageDuration,
      successRate,
      timeoutRate,
      anomalyRate,
      healthLabel,
      healthTone,
      healthSummary,
    };
  }, [stats]);

  const processAggregates = useMemo(() => {
    const grouped = new Map<string, AggregatedProcessStat>();

    // 按流程聚合，给右侧分布、风险焦点和下方结果表共用。
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

  const suggestions = useMemo(() => {
    const items: string[] = [];

    if (summary.totalCount === 0) {
      items.push('当前时间范围内还没有性能统计样本，建议扩大时间范围或切换到全部流程查看。');
    }
    if (summary.successRate < 85 && summary.totalCount > 0) {
      items.push('整体成功率偏低，建议先排查失败重试、节点配置和审批链路中的不稳定流程。');
    }
    if (summary.timeoutRate > 12) {
      items.push('超时率偏高，建议重点核查耗时最长流程的审批 SLA、通知链路和外部依赖。');
    }
    if (summary.anomalyRate > 8) {
      items.push('异常率偏高，建议先从风险焦点列表中优先处理异常比例最高的流程。');
    }
    if (items.length === 0) {
      items.push('当前性能指标处于健康区间，可以继续保持现有发布和监控策略。');
    }

    return items;
  }, [summary]);

  const topProcesses = processAggregates.slice(0, 5);
  const riskProcesses = [...processAggregates]
    .sort((a, b) => (b.timeoutRate + b.anomalyRate) - (a.timeoutRate + a.anomalyRate))
    .slice(0, 5);
  const tableRows = processAggregates;
  const maxProcessTotal = Math.max(...topProcesses.map((item) => item.totalCount), 1);
  const visibleDailyTrends = dailyTrends.slice(-10);
  const maxDailyTotal = Math.max(...visibleDailyTrends.map((item) => item.totalCount), 1);
  const latestDailyTrend = visibleDailyTrends.length > 0 ? visibleDailyTrends[visibleDailyTrends.length - 1] : null;
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '统计范围', value: `${dateRange.startDate} ~ ${dateRange.endDate}` },
    { label: '流程范围', value: selectedProcess ? processOptions.find((item) => item.value === selectedProcess)?.label || selectedProcess : '全部流程' },
    { label: '样本条数', value: `${stats.length} 条` },
    { label: '健康度', value: summary.healthLabel },
  ];

  const handleStartDateChange = (value: string) => {
    setRangePreset('custom');
    setDateRange((prev) => ({ ...prev, startDate: value }));
  };

  const handleEndDateChange = (value: string) => {
    setRangePreset('custom');
    setDateRange((prev) => ({ ...prev, endDate: value }));
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent className="space-y-4">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                <Activity size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950/90">
                {timeLabel}
              </span>
            </div>
          )}
          title="性能统计"
          description="把监控统计页统一到分析工作台后，日期范围、流程筛选、风险焦点和结果表会用同一套视觉语法表达。"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={loadStats}>
                <RefreshCw size={15} />
                刷新
              </Button>
              <Button variant="outline" onClick={exportStats} disabled={stats.length === 0}>
                <Download size={15} />
                导出 CSV
              </Button>
            </div>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="总流程数"
              value={summary.totalCount}
              hint={`已完成 ${summary.completedCount} 个`}
              aside={<BarChart3 size={18} className="text-cyan-600 dark:text-cyan-200" />}
            />
            <WorkspaceMetricCard
              label="平均时长"
              value={formatDuration(summary.averageDuration)}
              hint="按统计范围内所有流程加权计算"
              aside={<Clock3 size={18} className="text-sky-500 dark:text-sky-200" />}
            />
            <WorkspaceMetricCard
              label="成功率"
              value={`${summary.successRate.toFixed(1)}%`}
              hint="越高代表流程执行越稳定"
              aside={<CheckCircle2 size={18} className="text-emerald-500 dark:text-emerald-200" />}
            />
            <WorkspaceMetricCard
              label="风险窗口"
              value={`${summary.timeoutRate.toFixed(1)}% / ${summary.anomalyRate.toFixed(1)}%`}
              hint="超时率 / 异常率"
              aside={<AlertTriangle size={18} className="text-amber-500 dark:text-amber-200" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="Performance Filters"
          title="统计范围与快筛"
          total={stats.length}
          hasActiveFilters={Boolean(selectedProcess) || rangePreset !== '30'}
          overviewItems={overviewItems}
          quickFilters={RANGE_PRESETS.map((item) => ({ label: item.label, value: item.value }))}
          activeQuickFilter={rangePreset}
          onQuickFilterChange={applyRangePreset}
          quickFilterAside={selectedProcess ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedProcess('')}>
              <Filter size={14} />
              清空流程
            </Button>
          ) : (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500">
              当前统计全部流程
            </span>
          )}
          filterBar={(
            <div className="grid gap-3 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
              <DatePicker
                className="h-11 rounded-2xl"
                type="date"
                value={dateRange.startDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
              />

              <DatePicker
                className="h-11 rounded-2xl"
                type="date"
                value={dateRange.endDate}
                onChange={(event) => handleEndDateChange(event.target.value)}
              />

              <Select
                value={selectedProcess || 'all'}
                onValueChange={(value) => setSelectedProcess(value === 'all' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="所有流程类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有流程类型</SelectItem>
                  {processOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />

        {loading && stats.length === 0 ? (
          <WorkspaceInlineState
            type="loading"
            title="正在加载性能统计..."
            description="正在汇总流程性能样本、风险指标和趋势结果，请稍候。"
            className="py-16"
          />
        ) : stats.length > 0 ? (
          <>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
              <WorkspaceSectionCard
                title="效率概览"
                description="用统一进度条和健康标签快速判断当前统计范围内的流程质量。"
                eyebrow="Quality Score"
                bodyClassName="space-y-5"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <ProgressMetric
                    title="成功率"
                    icon={<TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />}
                    value={`${summary.successRate.toFixed(1)}%`}
                    hint={`${summary.completedCount} / ${summary.totalCount || 0} 已完成`}
                    progress={summary.successRate}
                    progressClassName="bg-gradient-to-r from-emerald-500 to-teal-500"
                  />
                  <ProgressMetric
                    title="超时率"
                    icon={<Calendar className="h-4 w-4 text-amber-500 dark:text-amber-300" />}
                    value={`${summary.timeoutRate.toFixed(1)}%`}
                    hint="越低越有利于用户体验"
                    progress={summary.timeoutRate}
                    progressClassName="bg-gradient-to-r from-amber-400 to-orange-500"
                  />
                  <ProgressMetric
                    title="异常率"
                    icon={<AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-300" />}
                    value={`${summary.anomalyRate.toFixed(1)}%`}
                    hint="用于判断流程配置稳定性"
                    progress={summary.anomalyRate}
                    progressClassName="bg-gradient-to-r from-rose-400 to-red-500"
                  />
                </div>

                <div className={cardClassName}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">统计健康度</div>
                      <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {summary.healthSummary}
                      </div>
                    </div>
                    <div className={cn('text-3xl font-bold tracking-tight', summary.healthTone)}>
                      {summary.healthLabel}
                    </div>
                  </div>
                </div>
              </WorkspaceSectionCard>

              <WorkspaceSectionCard
                title="流程分布"
                description="按流程聚合查看处理量、平均时长和风险分布，快速识别主力流程。"
                eyebrow="Process Mix"
                bodyClassName="space-y-4"
              >
                {topProcesses.length > 0 ? (
                  <>
                    {topProcesses.map((item) => (
                      <div key={item.processDefKey} className={cardClassName}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.processName}
                            </div>
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.processDefKey}</div>
                          </div>
                          <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-200">
                            {item.totalCount} 单
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
                            style={{ width: `${Math.max((item.totalCount / maxProcessTotal) * 100, 8)}%` }}
                          />
                        </div>
                        <div className="mt-4 grid gap-2 md:grid-cols-3">
                          <div className={infoBlockClassName}>
                            <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">平均时长</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {formatDuration(item.avgDurationMs)}
                            </div>
                          </div>
                          <div className={infoBlockClassName}>
                            <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">成功率</div>
                            <div className={cn('mt-1 text-sm font-semibold', getSuccessTone(item.successRate))}>
                              {item.successRate.toFixed(1)}%
                            </div>
                          </div>
                          <div className={infoBlockClassName}>
                            <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">风险率</div>
                            <div className={cn('mt-1 text-sm font-semibold', getRiskTone(item.timeoutRate + item.anomalyRate))}>
                              {(item.timeoutRate + item.anomalyRate).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <WorkspaceEmptyPanel
                    variant="glass"
                    icon={<BarChart3 className="h-7 w-7" />}
                    title="暂无流程分布"
                    description="当前统计范围内还没有可聚合的流程样本。"
                  />
                )}
              </WorkspaceSectionCard>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.95fr)]">
              <WorkspaceSectionCard
                title="日期趋势"
                description="按日期聚合查看处理量变化，并同步观察成功率和超时率波动。"
                eyebrow="Daily Signal"
                bodyClassName="space-y-4"
              >
                <div className={softPanelClassName}>
                  <div className="flex items-end gap-3">
                    {visibleDailyTrends.map((item) => (
                      <div key={item.statDate} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                        <div className="flex h-36 w-full items-end justify-center">
                          <div
                            className="w-full rounded-t-2xl bg-gradient-to-t from-cyan-600 to-sky-400 shadow-[0_8px_18px_rgba(14,165,233,0.18)]"
                            style={{
                              height: `${Math.max((item.totalCount / maxDailyTotal) * 100, item.totalCount > 0 ? 10 : 4)}%`,
                            }}
                            title={`${item.statDate} · ${item.totalCount} 单`}
                          />
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.totalCount}</div>
                          <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                            {item.statDate.slice(5)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">最近一天成功率</div>
                    <div className={cn('mt-1 text-sm font-semibold', getSuccessTone(latestDailyTrend?.successRate || 0))}>
                      {(latestDailyTrend?.successRate || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">最近一天超时率</div>
                    <div className={cn('mt-1 text-sm font-semibold', getRiskTone(latestDailyTrend?.timeoutRate || 0))}>
                      {(latestDailyTrend?.timeoutRate || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div className={infoBlockClassName}>
                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">最近一天异常率</div>
                    <div className={cn('mt-1 text-sm font-semibold', getRiskTone(latestDailyTrend?.anomalyRate || 0))}>
                      {(latestDailyTrend?.anomalyRate || 0).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </WorkspaceSectionCard>

              <WorkspaceSectionCard
                title="风险焦点"
                description="按超时率和异常率排序，优先识别需要立即排查的流程。"
                eyebrow="Risk Focus"
                bodyClassName="space-y-3"
              >
                {riskProcesses.length > 0 ? (
                  riskProcesses.map((item) => (
                    <div key={item.processDefKey} className={cardClassName}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.processName}
                          </div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.processDefKey}</div>
                        </div>
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', getRateBadgeClassName(item.timeoutRate + item.anomalyRate))}>
                          风险 {(item.timeoutRate + item.anomalyRate).toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        <div className={infoBlockClassName}>
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">成功率</div>
                          <div className={cn('mt-1 text-sm font-semibold', getSuccessTone(item.successRate))}>
                            {item.successRate.toFixed(1)}%
                          </div>
                        </div>
                        <div className={infoBlockClassName}>
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">超时率</div>
                          <div className={cn('mt-1 text-sm font-semibold', getRiskTone(item.timeoutRate))}>
                            {item.timeoutRate.toFixed(1)}%
                          </div>
                        </div>
                        <div className={infoBlockClassName}>
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">异常率</div>
                          <div className={cn('mt-1 text-sm font-semibold', getRiskTone(item.anomalyRate))}>
                            {item.anomalyRate.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <WorkspaceEmptyPanel
                    variant="glass"
                    icon={<AlertTriangle className="h-7 w-7" />}
                    title="暂无风险焦点"
                    description="当前统计范围内还没有可识别的高风险流程。"
                  />
                )}
              </WorkspaceSectionCard>
            </div>

            <WorkspaceSectionCard
              title="治理建议"
              description="根据当前统计结果自动给出治理建议，帮助你判断是否需要调整流程。"
              eyebrow="Recommendation"
              bodyClassName="space-y-3"
            >
              {suggestions.map((item, index) => (
                <div key={`${item}-${index}`} className={cardClassName}>
                  <div className="flex items-start gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <Filter className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" />
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </WorkspaceSectionCard>

            <WorkspaceResultCard
              total={tableRows.length}
              title="流程结果表"
              description="平均时长、成功率、超时率和异常率统一在同一张工作台结果表里查看与导出。"
            >
              <div className="overflow-x-auto">
                {loading ? (
                  <WorkspaceInlineState type="loading" title="正在加载性能统计..." className="m-4 py-12" />
                ) : (
                  <Table className="min-w-[1180px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>流程</TableHead>
                        <TableHead>流程 Key</TableHead>
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
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                            {item.processName}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                            {item.processDefKey}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-cyan-700 dark:text-cyan-200">
                            {item.totalCount}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-300">
                            {item.completedCount}
                          </TableCell>
                          <TableCell className="text-right text-slate-900 dark:text-slate-100">
                            {formatDuration(item.avgDurationMs)}
                          </TableCell>
                          <TableCell className="text-right text-slate-500 dark:text-slate-400">
                            {item.dayCount}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', getRateBadgeClassName(item.successRate, true))}>
                              {item.successRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', getRateBadgeClassName(item.timeoutRate))}>
                              {item.timeoutRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', getRateBadgeClassName(item.anomalyRate))}>
                              {item.anomalyRate.toFixed(1)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </WorkspaceResultCard>
          </>
        ) : (
          <WorkspaceSectionCard
            title="性能结果"
            description="当前筛选条件下没有可展示的性能样本。"
            eyebrow="Empty Result"
          >
            <WorkspaceEmptyPanel
              variant="glass"
              icon={<BarChart3 className="h-7 w-7" />}
              title="暂无统计数据"
              description="请选择不同的时间范围或流程类型后再查看。"
            />
          </WorkspaceSectionCard>
        )}
      </WorkspacePageContent>
    </div>
  );
};

export default PerformanceStats;
