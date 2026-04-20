import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';
import {
  AnomalyAlert,
  MonitorOverview,
  ProcessTrend,
  TimeoutAlert,
  getAnomalyAlerts,
  getMonitorOverview,
  getProcessTrend,
  getTimeoutAlerts,
} from '@/services/api/monitor';

const PanelCard: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, aside, children }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    {children}
  </section>
);

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
    </div>
    <div className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

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

const StatusMetric: React.FC<{
  label: string;
  value: string;
  tone: string;
  hint: string;
}> = ({ label, value, tone, hint }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
    <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</div>
    <div className={cn('mt-2 text-2xl font-semibold tracking-tight', tone)}>{value}</div>
    <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

const getTimeoutLevelMeta = (level: TimeoutAlert['timeoutLevel']) => {
  if (level === 'CRITICAL') {
    return {
      label: '严重',
      className:
        'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    };
  }
  if (level === 'WARNING') {
    return {
      label: '警告',
      className:
        'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    };
  }
  return {
    label: '提醒',
    className:
      'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200',
  };
};

const getAnomalySeverityMeta = (severity: AnomalyAlert['severity']) => {
  if (severity === 'CRITICAL') {
    return {
      label: '严重',
      className:
        'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    };
  }
  if (severity === 'HIGH') {
    return {
      label: '高',
      className:
        'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-orange-200',
    };
  }
  if (severity === 'MEDIUM') {
    return {
      label: '中',
      className:
        'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    };
  }
  return {
    label: '低',
    className:
      'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200',
  };
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getAlertDisplayTime = (alert: TimeoutAlert | AnomalyAlert, type: 'timeout' | 'anomaly') =>
  new Date(type === 'timeout' ? (alert as TimeoutAlert).alertTime || (alert as TimeoutAlert).createTime : (alert as AnomalyAlert).alertTime || (alert as AnomalyAlert).createTime)
    .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const getAnomalyMessage = (alert: AnomalyAlert) =>
  alert.errorMessage || alert.description || '暂无异常说明';

const AlertFeedItem: React.FC<{
  alert: TimeoutAlert | AnomalyAlert;
  type: 'timeout' | 'anomaly';
}> = ({ alert, type }) => {
  const isTimeout = type === 'timeout';
  const timeoutAlert = alert as TimeoutAlert;
  const anomalyAlert = alert as AnomalyAlert;
  const meta = isTimeout
    ? getTimeoutLevelMeta(timeoutAlert.timeoutLevel)
    : getAnomalySeverityMeta(anomalyAlert.severity);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.className)}>
              {meta.label}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {isTimeout ? (timeoutAlert.alertType === 'TASK' ? '任务超时' : '流程超时') : anomalyAlert.anomalyType}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isTimeout ? timeoutAlert.targetName : anomalyAlert.processName}
          </div>
          <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {isTimeout
              ? `已超时 ${Math.max(1, Math.ceil(timeoutAlert.timeoutDuration / (1000 * 60 * 60)))} 小时`
              : getAnomalyMessage(anomalyAlert)}
          </div>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{getAlertDisplayTime(alert, type)}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {isTimeout ? '目标标识' : '流程 Key'}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isTimeout ? timeoutAlert.targetId : anomalyAlert.processDefKey}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {isTimeout ? '处理人' : '状态'}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isTimeout ? timeoutAlert.assigneeName || '未分配' : anomalyAlert.resolved === 'Y' ? '已解决' : '待处理'}
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkflowMonitor: React.FC = () => {
  const [overview, setOverview] = useState<MonitorOverview | null>(null);
  const [trend, setTrend] = useState<ProcessTrend[]>([]);
  const [timeoutAlerts, setTimeoutAlerts] = useState<TimeoutAlert[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadData = async () => {
    try {
      setLoading(true);

      // 监控页需要同时消化概览、趋势和告警三类数据，这里统一并行拉取。
      const [overviewData, trendData, timeoutData, anomalyData] = await Promise.all([
        getMonitorOverview(),
        getProcessTrend({ days: 7 }),
        getTimeoutAlerts({ pageNum: 1, pageSize: 10, resolved: false }),
        getAnomalyAlerts({ pageNum: 1, pageSize: 10, resolved: false }),
      ]);

      setOverview(overviewData);
      setTrend(Array.isArray(trendData) ? trendData : []);
      setTimeoutAlerts(timeoutData.rows || timeoutData.records || []);
      setAnomalyAlerts(anomalyData.rows || anomalyData.records || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('加载监控数据失败:', error);
      toast.error('加载监控数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();

    if (!autoRefresh) {
      return;
    }

    const interval = setInterval(() => {
      void loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const summary = useMemo(() => {
    const warningTimeouts = overview?.warningAlertCount || 0;
    const criticalTimeouts = overview?.criticalAlertCount || 0;
    return {
      todayStarted: overview?.todayStarted || 0,
      todayCompleted: overview?.todayCompleted || 0,
      timeoutCount: warningTimeouts + criticalTimeouts,
      anomalyCount: overview?.unresolvedAnomalyCount || anomalyAlerts.length,
    };
  }, [anomalyAlerts.length, overview]);

  const visibleTrends = useMemo(() => trend.slice(-7), [trend]);
  const maxTrendStarted = Math.max(...visibleTrends.map((item) => item.started), 1);

  const monitorSuggestions = useMemo(() => {
    const items: string[] = [];

    if ((overview?.criticalAlertCount || 0) > 0) {
      items.push(`当前存在 ${overview?.criticalAlertCount} 条严重超时告警，建议优先排查关键流程的阻塞节点。`);
    }
    if ((overview?.successRate || 0) < 85 && overview) {
      items.push('整体成功率偏低，建议结合告警结果优先处理失败率高的流程链路。');
    }
    if ((overview?.avgCompletionTimeMs || 0) > 4 * 60 * 60 * 1000) {
      items.push('平均完成时间偏长，建议检查审批 SLA、外部服务依赖和人工等待环节。');
    }
    if (!autoRefresh) {
      items.push('自动刷新已关闭，当前监控页不会每 30 秒自动更新。');
    }
    if (items.length === 0) {
      items.push('当前监控指标处于可控区间，可以继续保持现有监控和治理策略。');
    }

    return items;
  }, [autoRefresh, overview]);

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (loading && !overview) {
    return (
      <div className="space-y-4">
        <InlineState
          title="正在加载流程监控..."
          description="正在同步流程概览、趋势和告警信息，请稍候。"
          loading
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryCard
          label="今日启动"
          value={summary.todayStarted}
          hint="当天已进入运行队列的流程数"
          icon={<Activity className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="今日完成"
          value={summary.todayCompleted}
          hint="当天完成闭环的流程数"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="超时告警"
          value={summary.timeoutCount}
          hint="警告与严重超时合计"
          icon={<Bell className="h-[18px] w-[18px]" />}
        />
        <SummaryCard
          label="异常告警"
          value={summary.anomalyCount}
          hint="当前未解决的异常流程"
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
        />
      </div>

      <PanelCard
        title="监控工作台"
        description="把流程监控、趋势和告警结果统一收口到同一套轻量复杂页语法，去掉旧的大屏式 Workspace 壳层。"
        aside={
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
            刷新
          </Button>
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="space-y-4">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-cyan-600 dark:border-slate-700"
                  />
                  自动刷新（30 秒）
                </label>
                <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                  监控页已经统一到与部署治理、告警列表相同的轻量工作台比例，运行概览、趋势区和告警面板不再单独维护旧的监控大屏语法。
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前监控上下文</div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    日期
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{todayLabel}</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{timeLabel}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  最后更新
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {lastUpdate.toLocaleTimeString('zh-CN')}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  运行中 / 待办
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {overview?.runningCount || 0} / {overview?.pendingTaskCount || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PanelCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-4">
          <PanelCard
            title="运行总览"
            description="统一查看运行中流程、待办任务、平均完成时间和整体成功率。"
          >
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
              <StatusMetric
                label="运行中流程"
                value={String(overview?.runningCount || 0)}
                tone="text-cyan-700 dark:text-cyan-200"
                hint="当前仍在执行中的流程实例"
              />
              <StatusMetric
                label="待办任务"
                value={String(overview?.pendingTaskCount || 0)}
                tone="text-amber-600 dark:text-amber-300"
                hint="等待节点处理的任务总数"
              />
              <StatusMetric
                label="平均完成时间"
                value={formatDuration(overview?.avgCompletionTimeMs || 0)}
                tone="text-sky-600 dark:text-sky-300"
                hint="按当前概览数据计算的平均流程完成耗时"
              />
              <StatusMetric
                label="整体成功率"
                value={`${(overview?.successRate || 0).toFixed(1)}%`}
                tone="text-emerald-600 dark:text-emerald-300"
                hint="成功完成流程占比"
              />
            </div>
          </PanelCard>

          <PanelCard
            title="流程趋势（最近 7 天）"
            description="快速查看每日启动、完成、超时和异常的波动情况。"
          >
            <div className="space-y-3 px-4 py-4">
              {visibleTrends.length === 0 ? (
                <InlineState
                  icon={<TrendingUp className="h-5 w-5" />}
                  title="暂无趋势数据"
                  description="当前还没有近 7 天的趋势统计结果。"
                />
              ) : (
                visibleTrends.map((item) => (
                  <div
                    key={item.date}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88"
                  >
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.date}</div>
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                          启动 {item.started}，完成 {item.completed}，超时 {item.timeout}，异常 {item.anomaly}
                        </div>
                      </div>
                      <div className="w-full max-w-[220px]">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
                            style={{ width: `${Math.max(10, (item.started / maxTrendStarted) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>

        <div className="space-y-4">
          <PanelCard
            title="治理建议"
            description="根据当前概览和告警结果，给出这一轮监控收口后的处理建议。"
          >
            <div className="space-y-3 px-4 py-4">
              {monitorSuggestions.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-300"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                      <ShieldAlert className="h-4 w-4" />
                    </span>
                    <span className="leading-6">{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>

          <PanelCard
            title="监控摘要"
            description="按当前概览聚合的高层状态，辅助判断告警处置优先级。"
          >
            <div className="space-y-3 px-4 py-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  严重超时
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {overview?.criticalAlertCount || 0} 条
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  警告提醒
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {overview?.warningAlertCount || 0} 条
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  异常未解决
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {overview?.unresolvedAnomalyCount || anomalyAlerts.length} 条
                </div>
              </div>
            </div>
          </PanelCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard
          title="超时告警"
          description="优先查看已超时的流程节点与任务。"
          aside={
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
              {timeoutAlerts.length} 条
            </span>
          }
        >
          <div className="space-y-3 px-4 py-4">
            {timeoutAlerts.length > 0 ? (
              timeoutAlerts.map((alert) => <AlertFeedItem key={alert.id} alert={alert} type="timeout" />)
            ) : (
              <InlineState
                icon={<Clock3 className="h-5 w-5" />}
                title="暂无超时告警"
                description="当前没有需要额外关注的超时流程。"
              />
            )}
          </div>
        </PanelCard>

        <PanelCard
          title="异常告警"
          description="统一查看失败、异常和高风险流程。"
          aside={
            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200">
              {anomalyAlerts.length} 条
            </span>
          }
        >
          <div className="space-y-3 px-4 py-4">
            {anomalyAlerts.length > 0 ? (
              anomalyAlerts.map((alert) => <AlertFeedItem key={alert.id} alert={alert} type="anomaly" />)
            ) : (
              <InlineState
                icon={<AlertTriangle className="h-5 w-5" />}
                title="暂无异常告警"
                description="当前没有异常流程告警需要处理。"
              />
            )}
          </div>
        </PanelCard>
      </div>
    </div>
  );
};

export default WorkflowMonitor;
