import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock3,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button, LoadingSpinner, Switch } from '@/components/common';
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
  <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center sm:gap-4">
    <div className="w-24 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 sm:text-right">{value}</div>
  </div>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={cn('overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800', className)}>
    {children}
  </div>
);

const getTimeoutLevelMeta = (level: TimeoutAlert['timeoutLevel']) => {
  if (level === 'CRITICAL') {
    return { label: '严重' };
  }
  if (level === 'WARNING') {
    return { label: '警告' };
  }
  return { label: '提醒' };
};

const getAnomalySeverityMeta = (severity: AnomalyAlert['severity']) => {
  if (severity === 'CRITICAL') {
    return { label: '严重' };
  }
  if (severity === 'HIGH') {
    return { label: '高' };
  }
  if (severity === 'MEDIUM') {
    return { label: '中' };
  }
  return { label: '低' };
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
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
          <span className="text-xs text-slate-500 dark:text-slate-400">{meta.label}</span>
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
      toast.error(getErrorMessage(error, '加载流程监控数据失败'));
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
  const lastUpdateTime = lastUpdate.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (loading && !overview) {
    return (
      <div className="space-y-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            流程监控
          </h1>
        </div>
        <EmptyBlock
          title="正在加载流程监控"
          loading
        />
      </div>
    );
  }

  return (
      <TablePageLayout
        className="gap-3"
        filters={
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">流程监控</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  今日启动 {summary.todayStarted} · 今日完成 {summary.todayCompleted} · 运行中 {overview?.runningCount || 0} · 待办 {overview?.pendingTaskCount || 0}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                  <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
                  刷新
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                自动刷新
              </label>
              <span className="text-xs text-slate-400 dark:text-slate-500">30 秒</span>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                最后更新
                <span className="ml-2 font-medium text-slate-700 dark:text-slate-200">{lastUpdateTime}</span>
              </div>
            </div>
          </div>
        }
        table={
          <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_284px]">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">运行趋势</div>
                  </div>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    最近 7 天
                  </span>
                </div>

                {visibleTrends.length === 0 ? (
                  <EmptyBlock
                    title="暂无趋势数据"
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
                      <span>运行中</span>
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
                        <div className="text-sm text-slate-600 dark:text-slate-300">{item.running}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">超时告警</div>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
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
                      icon={<Clock3 className="h-5 w-5" />}
                    />
                  )}
                </div>
              </section>

              <section className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">异常告警</div>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
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
                      icon={<AlertTriangle className="h-5 w-5" />}
                    />
                  )}
                </div>
              </section>
            </div>

            <aside className="border-t border-slate-200 dark:border-slate-800 xl:border-l xl:border-t-0">
              <section className="p-5 dark:border-slate-800 sm:p-6">
                <DetailRows>
                  <KeyValueRow label="最后更新" value={lastUpdateTime} />
                  <KeyValueRow label="自动刷新" value={autoRefresh ? '开启' : '关闭'} />
                  <KeyValueRow label="运行中 / 待办" value={`${overview?.runningCount || 0} / ${overview?.pendingTaskCount || 0}`} />
                  <KeyValueRow label="严重超时" value={`${overview?.criticalAlertCount || 0} 条`} />
                  <KeyValueRow label="警告提醒" value={`${overview?.warningAlertCount || 0} 条`} />
                  <KeyValueRow label="异常未解决" value={`${overview?.unresolvedAnomalyCount || anomalyAlerts.length} 条`} />
                  <KeyValueRow label="平均完成时间" value={formatDuration(overview?.avgCompletionTimeMs || 0)} />
                  <KeyValueRow label="整体成功率" value={`${(overview?.successRate || 0).toFixed(1)}%`} />
                </DetailRows>

                <div className="mt-4">
                  {[
                    { label: '超时告警', value: summary.timeoutCount },
                    { label: '异常告警', value: summary.anomalyCount },
                    { label: '成功率', value: `${(overview?.successRate || 0).toFixed(1)}%` },
                    { label: '平均时长', value: formatDuration(overview?.avgCompletionTimeMs || 0) },
                  ].length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                      {[
                        { label: '超时告警', value: summary.timeoutCount },
                        { label: '异常告警', value: summary.anomalyCount },
                        { label: '成功率', value: `${(overview?.successRate || 0).toFixed(1)}%` },
                        { label: '平均时长', value: formatDuration(overview?.avgCompletionTimeMs || 0) },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800"
                        >
                          <span className="text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        }
      />
  );
};

export default WorkflowMonitor;
