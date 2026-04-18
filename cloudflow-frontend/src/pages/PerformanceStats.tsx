import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Filter,
  TrendingUp,
} from 'lucide-react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableHead, TableHeader, Button, Card } from '@/components/ui';
import {
  getPerformanceStats,
  PerformanceStats as PerformanceStatsItem,
} from '@/services/api/monitor';
import { toast } from 'sonner';
import { downloadBlob } from '@/utils/download';
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
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace/WorkspacePanels';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const PerformanceStats: React.FC = () => {
  const [stats, setStats] = useState<PerformanceStatsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [selectedProcess, setSelectedProcess] = useState('');

  const loadStats = async () => {
    try {
      setLoading(true);
      const params: any = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };
      if (selectedProcess) {
        params.processDefKey = selectedProcess;
      }

      const data = await getPerformanceStats(params);
      setStats(data);
    } catch (error) {
      console.error('加载性能统计失败:', error);
      toast.error('加载性能统计失败');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void loadStats();
  }, [dateRange, selectedProcess]);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
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

  const processTypes = Array.from(new Set(stats.map((item) => item.processDefKey)));

  const summary = useMemo(() => {
    const initial = {
      totalCount: 0,
      completedCount: 0,
      avgDuration: 0,
      successRate: 0,
      timeoutRate: 0,
      anomalyRate: 0,
    };

    const result = stats.reduce((acc, stat) => {
      acc.totalCount += stat.totalCount;
      acc.completedCount += stat.completedCount;
      acc.avgDuration += stat.avgDurationMs * stat.totalCount;
      acc.successRate += stat.successRate * stat.totalCount;
      acc.timeoutRate += stat.timeoutRate * stat.totalCount;
      acc.anomalyRate += stat.anomalyRate * stat.totalCount;
      return acc;
    }, initial);

    if (result.totalCount > 0) {
      result.avgDuration /= result.totalCount;
      result.successRate /= result.totalCount;
      result.timeoutRate /= result.totalCount;
      result.anomalyRate /= result.totalCount;
    }

    return result;
  }, [stats]);

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '统计日期范围', value: `${dateRange.startDate} ~ ${dateRange.endDate}` },
    { label: '流程类型', value: selectedProcess || '全部流程' },
    { label: '当前结果', value: `${stats.length} 条` },
    { label: '成功率', value: `${summary.successRate.toFixed(1)}%` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <BarChart3 size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="性能统计"
          description="把监控统计页统一到工作台结构后，日期筛选、流程切换、导出和表格分析都会更清晰。"
          actions={(
            <Button variant="outline" onClick={exportStats} disabled={stats.length === 0}>
              <Download size={15} />
              导出 CSV
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="总流程数"
              value={summary.totalCount}
              hint={`已完成 ${summary.completedCount} 个`}
              aside={<BarChart3 size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="平均时长"
              value={formatDuration(summary.avgDuration)}
              hint="基于统计范围内所有流程加权计算"
              aside={<TrendingUp size={18} className="text-purple-600" />}
            />
            <WorkspaceMetricCard
              label="成功率"
              value={`${summary.successRate.toFixed(1)}%`}
              hint="越高代表流程执行越稳定"
              aside={<TrendingUp size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="超时率"
              value={`${summary.timeoutRate.toFixed(1)}%`}
              hint="越低越有利于用户体验"
              aside={<Calendar size={18} className="text-amber-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="性能筛选"
              total={stats.length}
              hasActiveFilters={Boolean(selectedProcess)}
              overviewItems={overviewItems}
              quickFilterAside={selectedProcess ? (
                <Button variant="outline" size="sm" onClick={() => setSelectedProcess('')}>
                  <Filter size={14} />
                  清空流程
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前统计全部流程
                </span>
              )}
              filterBar={(
                <div className="grid gap-2.5 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
                  <DatePicker
                    className="h-11 rounded-2xl"
                    type="date"
                    value={dateRange.startDate}
                    onChange={(event) => setDateRange({ ...dateRange, startDate: event.target.value })}
                  />

                  <DatePicker
                    className="h-11 rounded-2xl"
                    type="date"
                    value={dateRange.endDate}
                    onChange={(event) => setDateRange({ ...dateRange, endDate: event.target.value })}
                  />

                  <Select value={selectedProcess || 'all'} onValueChange={(value) => setSelectedProcess(value === 'all' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="所有流程类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有流程类型</SelectItem>
                      {processTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <WorkspaceResultCard
              total={stats.length}
              description="平均时长、成功率、超时率和异常率统一在同一张工作台表格里查看与导出。"
            >
              <div className="overflow-x-auto">
                {loading ? (
                  <WorkspaceInlineState type="loading" title="正在加载性能统计..." className="m-4 py-12" />
                ) : stats.length > 0 ? (
                  <table className="min-w-[1180px] w-full divide-y divide-slate-100">
                    <TableHeader>
                      <tr>
                        <TableHead>日期</TableHead>
                        <TableHead>流程类型</TableHead>
                        <TableHead className="text-right">总数</TableHead>
                        <TableHead className="text-right">完成数</TableHead>
                        <TableHead className="text-right">平均时长</TableHead>
                        <TableHead className="text-right">最大时长</TableHead>
                        <TableHead className="text-right">最小时长</TableHead>
                        <TableHead className="text-right">成功率</TableHead>
                        <TableHead className="text-right">超时率</TableHead>
                        <TableHead className="text-right">异常率</TableHead>
                      </tr>
                    </TableHeader>
                    <tbody className="divide-y divide-slate-100">
                      {stats.map((stat, index) => (
                        <tr key={`${stat.processDefKey}-${stat.statDate}-${index}`} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3 text-sm text-slate-900">{stat.statDate}</td>
                          <td className="px-4 py-3 text-sm text-slate-900">{stat.processName}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-pink-500">{stat.totalCount}</td>
                          <td className="px-4 py-3 text-right text-sm text-emerald-600">{stat.completedCount}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-900">{formatDuration(stat.avgDurationMs)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">{formatDuration(stat.maxDurationMs)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600">{formatDuration(stat.minDurationMs)}</td>
                          <td className="px-4 py-3 text-right text-sm">
                            <span className={`font-medium ${
                              stat.successRate >= 95 ? 'text-emerald-600' :
                              stat.successRate >= 80 ? 'text-amber-600' :
                              'text-rose-600'
                            }`}>
                              {stat.successRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <span className={`font-medium ${
                              stat.timeoutRate <= 5 ? 'text-emerald-600' :
                              stat.timeoutRate <= 20 ? 'text-amber-600' :
                              'text-rose-600'
                            }`}>
                              {stat.timeoutRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <span className={`font-medium ${
                              stat.anomalyRate <= 5 ? 'text-emerald-600' :
                              stat.anomalyRate <= 20 ? 'text-amber-600' :
                              'text-rose-600'
                            }`}>
                              {stat.anomalyRate.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-4 py-6">
                    <WorkspaceEmptyPanel
                      variant="glass"
                      icon={<BarChart3 className="h-7 w-7" />}
                      title="暂无统计数据"
                      description="请选择不同的时间范围或流程类型后再查看。"
                    />
                  </div>
                )}
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>
    </div>
  );
};

export default PerformanceStats;
