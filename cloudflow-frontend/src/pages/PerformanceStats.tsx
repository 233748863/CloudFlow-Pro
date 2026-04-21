import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
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

const EmptyBlock: React.FC<{
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
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const PresetButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100',
    )}
  >
    {label}
  </button>
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
        ? `已导出 ${stats.length} 条性能统计，下载文件：${fileName}`
        : `已导出空结果，下载文件：${fileName}`,
    );
  };

  const processOptions = useMemo(() => {
    const map = new Map<string, string>();

    // 保留当前选中的流程键，避免筛选后列表为空时选项突然丢失。
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

    // 统一把原始按天样本聚合成流程维度统计，供分布、风险和结果表复用。
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

    // 日期趋势单独按天汇总，避免页面各处维护不同口径的趋势统计。
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

  const topProcesses = processAggregates.slice(0, 6);
  const riskProcesses = [...processAggregates]
    .sort((a, b) => b.timeoutRate + b.anomalyRate - (a.timeoutRate + a.anomalyRate))
    .slice(0, 5);
  const tableRows = processAggregates;
  const maxProcessTotal = Math.max(...topProcesses.map((item) => item.totalCount), 1);
  const visibleDailyTrends = dailyTrends.slice(-10);
  const maxDailyTotal = Math.max(...visibleDailyTrends.map((item) => item.totalCount), 1);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

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
    <div className="space-y-5">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <BarChart3 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Performance Analytics
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          性能统计
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          性能页继续回收到源码后台页语法，筛选、趋势、风险和结果表统一放在同一套轻量容器里，不再保留分析工作台式的拼装结构。
        </p>
      </div>

      <TablePageLayout
        className="gap-4"
        actions={
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              流程数 {summary.totalCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              已完成 {summary.completedCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              平均时长 {formatDuration(summary.averageDuration)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              成功率 {summary.successRate.toFixed(1)}%
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              风险 {summary.timeoutRate.toFixed(1)}% / {summary.anomalyRate.toFixed(1)}%
            </span>
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs',
                summary.healthLabel === '稳定'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : summary.healthLabel === '可控'
                    ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
              )}
            >
              健康度 {summary.healthLabel}
            </span>
          </div>
        }
        filters={
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
              {RANGE_PRESETS.map((item) => (
                <PresetButton
                  key={item.value}
                  active={rangePreset === item.value}
                  label={item.label}
                  onClick={() => applyRangePreset(item.value)}
                />
              ))}
            </div>

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

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadStats()} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                刷新
              </Button>
              <Button variant="outline" size="sm" onClick={exportStats} disabled={stats.length === 0}>
                <Download className="h-4 w-4" />
                导出 CSV
              </Button>
            </div>
          </div>
        }
        table={
          <div className="grid min-h-full xl:grid-cols-[minmax(0,1.25fr)_320px]">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {isInitialLoading ? (
                <section className="p-5 sm:p-6">
                  <EmptyBlock
                    title="正在加载性能统计..."
                    description="正在汇总流程性能样本、风险指标和趋势结果，请稍候。"
                    loading
                  />
                </section>
              ) : hasNoData ? (
                <section className="p-5 sm:p-6">
                  <EmptyBlock
                    icon={<Activity className="h-5 w-5" />}
                    title="暂无统计数据"
                    description="请选择不同的时间范围或流程类型后再查看。"
                  />
                </section>
              ) : (
                <>
                  <section className="p-5 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">效率概览</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      用更紧凑的后台页语法直接查看成功率、超时率和异常率。
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          <TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                          成功率
                        </div>
                        <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                          {summary.successRate.toFixed(1)}%
                        </div>
                        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          {summary.completedCount} / {summary.totalCount || 0} 已完成
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          <Clock3 className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                          超时率
                        </div>
                        <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                          {summary.timeoutRate.toFixed(1)}%
                        </div>
                        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">越低越有利于用户体验</div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-300" />
                          异常率
                        </div>
                        <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                          {summary.anomalyRate.toFixed(1)}%
                        </div>
                        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">用于判断流程配置稳定性</div>
                      </div>
                    </div>
                  </section>

                  <section className="p-5 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">流程分布</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      按流程聚合查看处理量、平均时长和风险表现。
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="hidden bg-slate-50 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:bg-slate-900/70 dark:text-slate-500 md:grid md:grid-cols-[minmax(0,1fr)_110px_140px_120px_120px] md:items-center">
                        <span>流程</span>
                        <span>处理量</span>
                        <span>平均时长</span>
                        <span>成功率</span>
                        <span>风险率</span>
                      </div>

                      {topProcesses.length > 0 ? (
                        topProcesses.map((item) => (
                          <div
                            key={item.processDefKey}
                            className="grid gap-3 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_110px_140px_120px_120px] md:items-center"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {item.processName}
                              </div>
                              <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                {item.processDefKey}
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                                <div
                                  className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400"
                                  style={{ width: `${Math.max((item.totalCount / maxProcessTotal) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-200">{item.totalCount} 单</div>
                            <div className="text-sm text-slate-600 dark:text-slate-300">{formatDuration(item.avgDurationMs)}</div>
                            <div className={cn('text-sm font-semibold', getSuccessTone(item.successRate))}>
                              {item.successRate.toFixed(1)}%
                            </div>
                            <div className={cn('text-sm font-semibold', getRiskTone(item.timeoutRate + item.anomalyRate))}>
                              {(item.timeoutRate + item.anomalyRate).toFixed(1)}%
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyBlock
                          icon={<BarChart3 className="h-5 w-5" />}
                          title="暂无流程分布"
                          description="当前统计范围内还没有可聚合的流程样本。"
                        />
                      )}
                    </div>
                  </section>

                  <section className="p-5 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">日期趋势</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      按日期聚合查看处理量变化，并同步观察成功率和风险波动。
                    </div>

                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="hidden bg-slate-50 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:bg-slate-900/70 dark:text-slate-500 md:grid md:grid-cols-[120px_100px_120px_100px_100px_minmax(0,1fr)] md:items-center">
                        <span>日期</span>
                        <span>处理量</span>
                        <span>成功率</span>
                        <span>超时率</span>
                        <span>异常率</span>
                        <span>趋势</span>
                      </div>

                      {visibleDailyTrends.map((item) => (
                        <div
                          key={item.statDate}
                          className="grid gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 dark:border-slate-800 md:grid-cols-[120px_100px_120px_100px_100px_minmax(0,1fr)] md:items-center"
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {item.statDate}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-300">{item.totalCount}</div>
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
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                              <div
                                className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400"
                                style={{
                                  width: `${Math.max((item.totalCount / maxDailyTotal) * 100, item.totalCount > 0 ? 10 : 4)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="p-5 sm:p-6">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">流程结果表</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      平均时长、成功率、超时率和异常率统一在同一张结果表里查看与导出。
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <Table className="min-w-[1120px]">
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
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前统计上下文</div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        时间
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{todayLabel}</span>
                    </div>
                    <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {timeLabel}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      统计范围
                    </div>
                    <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {dateRange.startDate} ~ {dateRange.endDate}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      健康度
                    </div>
                    <div className={cn('mt-1.5 text-sm font-semibold', summary.healthTone)}>
                      {summary.healthLabel}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {summary.healthSummary}
                    </div>
                  </div>
                </div>
              </section>

              <section className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">风险焦点</div>
                <div className="mt-4 space-y-3">
                  {riskProcesses.length > 0 ? (
                    riskProcesses.map((item) => (
                      <div
                        key={item.processDefKey}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.processName}
                            </div>
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                              {item.processDefKey}
                            </div>
                          </div>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              getRateBadgeClassName(item.timeoutRate + item.anomalyRate),
                            )}
                          >
                            风险 {(item.timeoutRate + item.anomalyRate).toFixed(1)}%
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          <div className={cn('text-sm font-semibold', getSuccessTone(item.successRate))}>
                            成功 {item.successRate.toFixed(1)}%
                          </div>
                          <div className={cn('text-sm font-semibold', getRiskTone(item.timeoutRate))}>
                            超时 {item.timeoutRate.toFixed(1)}%
                          </div>
                          <div className={cn('text-sm font-semibold', getRiskTone(item.anomalyRate))}>
                            异常 {item.anomalyRate.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyBlock
                      icon={<AlertTriangle className="h-5 w-5" />}
                      title="暂无风险焦点"
                      description="当前统计范围内还没有可识别的高风险流程。"
                    />
                  )}
                </div>
              </section>

              <section className="p-5 sm:p-6">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">治理建议</div>
                <div className="mt-4 space-y-3">
                  {suggestions.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                        <span>{item}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        }
      />
    </div>
  );
};

export default PerformanceStats;
