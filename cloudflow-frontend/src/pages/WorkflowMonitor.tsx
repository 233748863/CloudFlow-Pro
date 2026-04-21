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
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button, LoadingSpinner, Switch } from '@/components/ui';
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

const MetricCard: React.FC<{
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          {label}
        </div>
        <div className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {value}
        </div>
      </div>
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        {icon}
      </div>
    </div>
    <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

const EmptyBlock: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    {loading ? (
      <LoadingSpinner size="lg" className="mb-3" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const KeyValueRow: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</div>
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
  new Date(
    type === 'timeout'
      ? (alert as TimeoutAlert).alertTime || (alert as TimeoutAlert).createTime
      : (alert as AnomalyAlert).alertTime || (alert as AnomalyAlert).createTime,
  ).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const getAnomalyMessage = (alert: AnomalyAlert) =>
  alert.errorMessage || alert.description || '暂无异常说明';

const AlertFeedRow: React.FC<{
  alert: TimeoutAlert | AnomalyAlert;
  type: 'timeout' | 'anomaly';
}> = ({ alert, type }) => {
  const isTimeout = type === 'timeout';
  const timeoutAlert = alert as TimeoutAlert;
  const anomalyAlert = alert as AnomalyAlert;
  const meta = isTimeout
    ? getTimeoutLevelMeta(timeoutAlert.timeoutLevel)
    : getAnomalySeverityMeta(anomalyAlert.severity);
  const category = isTimeout
    ? timeoutAlert.alertType === 'TASK'
      ? '任务超时'
      : '流程超时'
    : anomalyAlert.anomalyType;
  const title = isTimeout ? timeoutAlert.targetName : anomalyAlert.processName;
  const description = isTimeout
    ? `已超时 ${Math.max(1, Math.ceil(timeoutAlert.timeoutDuration / (1000 * 60 * 60)))} 小时`
    : getAnomalyMessage(anomalyAlert);
  const identityLabel = isTimeout ? '目标标识' : '流程 Key';
  const identityValue = isTimeout ? timeoutAlert.targetId : anomalyAlert.processDefKey;
  const statusLabel = isTimeout ? '处理人' : '状态';
  const statusValue = isTimeout
    ? timeoutAlert.assigneeName || '未分配'
    : anomalyAlert.resolved === 'Y'
      ? '已解决'
      : '待处理';

  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_120px] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.className)}>
            {meta.label}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{category}</span>
        </div>
        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          {identityLabel}
        </div>
        <div className="mt-1.5 break-all text-sm font-medium text-slate-700 dark:text-slate-200">
          {identityValue || '-'}
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          {statusLabel}
        </div>
        <div className="mt-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">{statusValue}</div>
        <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {getAlertDisplayTime(alert, type)}
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
      console.error('加载流程监控数据失败:', error);
      toast.error('加载流程监控数据失败');
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
      items.push(`存在 ${overview?.criticalAlertCount} 条严重超时告警，优先排查关键流程的阻塞节点。`);
    }
    if ((overview?.successRate || 0) < 85 && overview) {
      items.push('整体成功率偏低，建议先处理失败率较高的流程链路。');
    }
    if ((overview?.avgCompletionTimeMs || 0) > 4 * 60 * 60 * 1000) {
      items.push('平均完成时间偏长，优先检查审批 SLA、外部服务依赖和人工等待环节。');
    }
    if (!autoRefresh) {
      items.push('自动刷新已关闭，监控数据不会每 30 秒自动更新。');
    }
    if (items.length === 0) {
      items.push('当前监控指标处于可控区间，继续保持现有监控和治理节奏即可。');
    }

    return items;
  }, [autoRefresh, overview]);

  const todayLabel = formatDateCN(new Date());
  const lastUpdateTime = lastUpdate.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (loading && !overview) {
    return (
      <div className="space-y-5">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            Process Monitor
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            流程监控
          </h1>
        </div>
        <EmptyBlock
          title="正在加载流程监控"
          description="正在同步流程概览、趋势和告警信息，请稍候。"
          loading
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          Process Monitor
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          流程监控
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          运行趋势、超时告警和异常处理统一收口在同一页，不再继续保留旧的大屏式监控工作台语法。
        </p>
      </div>

      <TablePageLayout
        className="gap-4"
        actions={
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="今日启动"
              value={summary.todayStarted}
              hint="当天已进入运行队列的流程数"
              icon={<Activity className="h-[18px] w-[18px]" />}
            />
            <MetricCard
              label="今日完成"
              value={summary.todayCompleted}
              hint="当天完成闭环的流程数"
              icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
            />
            <MetricCard
              label="超时告警"
              value={summary.timeoutCount}
              hint="警告与严重超时合计"
              icon={<Bell className="h-[18px] w-[18px]" />}
            />
            <MetricCard
              label="异常告警"
              value={summary.anomalyCount}
              hint="当前未解决的异常流程"
              icon={<AlertTriangle className="h-[18px] w-[18px]" />}
            />
          </div>
        }
        filters={
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              自动刷新
            </label>
            <span className="text-xs text-slate-400 dark:text-slate-500">30 秒</span>

            <div className="hidden h-5 w-px bg-slate-200 dark:bg-slate-800 xl:block" />

            <div className="text-sm text-slate-500 dark:text-slate-400">
              最后更新
              <span className="ml-2 font-medium text-slate-700 dark:text-slate-200">{lastUpdateTime}</span>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              运行中
              <span className="ml-2 font-medium text-slate-700 dark:text-slate-200">
                {overview?.runningCount || 0}
              </span>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              待办
              <span className="ml-2 font-medium text-slate-700 dark:text-slate-200">
                {overview?.pendingTaskCount || 0}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                刷新
              </Button>
            </div>
          </div>
        }
        table={
          // 监控页收成“工具栏 + 单容器分栏 + 列表行”的后台语法，避免继续叠大卡片工作台。
          <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">运行趋势</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      最近 7 天的启动、完成、超时和异常走势。
                    </div>
                  </div>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    最近 7 天
                  </span>
                </div>

                {visibleTrends.length === 0 ? (
                  <EmptyBlock
                    title="暂无趋势数据"
                    description="当前还没有近 7 天的趋势统计结果。"
                    icon={<TrendingUp className="h-5 w-5" />}
                  />
                ) : (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="hidden bg-slate-50 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:bg-slate-900/70 dark:text-slate-500 md:grid md:grid-cols-[120px_repeat(4,minmax(0,1fr))_140px]">
                      <span>日期</span>
                      <span>启动</span>
                      <span>完成</span>
                      <span>超时</span>
                      <span>异常</span>
                      <span>趋势</span>
                    </div>

                    {visibleTrends.map((item) => (
                      <div
                        key={item.date}
                        className="grid gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 dark:border-slate-800 md:grid-cols-[120px_repeat(4,minmax(0,1fr))_140px] md:items-center"
                      >
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.date}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{item.started}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{item.completed}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{item.timeout}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{item.anomaly}</div>
                        <div className="w-full">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                            <div
                              className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400"
                              style={{ width: `${Math.max(10, (item.started / maxTrendStarted) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">超时告警</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      优先查看已超时的流程节点与任务。
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                    {timeoutAlerts.length} 条
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  {timeoutAlerts.length > 0 ? (
                    timeoutAlerts.map((alert, index) => (
                      <div
                        key={alert.id}
                        className={cn(index > 0 && 'border-t border-slate-200 dark:border-slate-800')}
                      >
                        <AlertFeedRow alert={alert} type="timeout" />
                      </div>
                    ))
                  ) : (
                    <EmptyBlock
                      title="暂无超时告警"
                      description="当前没有需要额外关注的超时流程。"
                      icon={<Clock3 className="h-5 w-5" />}
                    />
                  )}
                </div>
              </section>

              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">异常告警</div>
                    <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      统一查看失败、异常和高风险流程。
                    </div>
                  </div>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200">
                    {anomalyAlerts.length} 条
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  {anomalyAlerts.length > 0 ? (
                    anomalyAlerts.map((alert, index) => (
                      <div
                        key={alert.id}
                        className={cn(index > 0 && 'border-t border-slate-200 dark:border-slate-800')}
                      >
                        <AlertFeedRow alert={alert} type="anomaly" />
                      </div>
                    ))
                  ) : (
                    <EmptyBlock
                      title="暂无异常告警"
                      description="当前没有异常流程告警需要处理。"
                      icon={<AlertTriangle className="h-5 w-5" />}
                    />
                  )}
                </div>
              </section>
            </div>

            <aside className="border-t border-slate-200 dark:border-slate-800 xl:border-l xl:border-t-0">
              <section className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">当前监控上下文</div>
                <div className="mt-4 space-y-3">
                  <KeyValueRow label="日期" value={todayLabel} />
                  <KeyValueRow label="最后更新" value={lastUpdateTime} />
                  <KeyValueRow
                    label="运行中 / 待办"
                    value={`${overview?.runningCount || 0} / ${overview?.pendingTaskCount || 0}`}
                  />
                </div>
              </section>

              <section className="border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">处置摘要</div>
                <div className="mt-4 space-y-3">
                  <KeyValueRow label="严重超时" value={`${overview?.criticalAlertCount || 0} 条`} />
                  <KeyValueRow label="警告提醒" value={`${overview?.warningAlertCount || 0} 条`} />
                  <KeyValueRow
                    label="异常未解决"
                    value={`${overview?.unresolvedAnomalyCount || anomalyAlerts.length} 条`}
                  />
                  <KeyValueRow
                    label="平均完成时间"
                    value={formatDuration(overview?.avgCompletionTimeMs || 0)}
                  />
                  <KeyValueRow
                    label="整体成功率"
                    value={`${(overview?.successRate || 0).toFixed(1)}%`}
                  />
                </div>
              </section>

              <section className="p-5 sm:p-6">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">治理建议</div>
                <div className="mt-4 space-y-3">
                  {monitorSuggestions.map((item) => (
                    <div
                      key={item}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                          <ShieldAlert className="h-4 w-4" />
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

export default WorkflowMonitor;
