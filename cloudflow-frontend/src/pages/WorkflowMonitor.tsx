import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ListChecks,
  RefreshCw,
  TimerReset,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { LoadingSpinner, Switch } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
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
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';
import './WorkflowMonitor.css';

const EmptyBlock: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="workflow-monitor-empty">
    {loading ? <LoadingSpinner size="lg" /> : icon ? <span>{icon}</span> : null}
    <strong>{title}</strong>
    {description ? <p>{description}</p> : null}
  </div>
);

const PanelShell: React.FC<{
  title: string;
  description?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, meta, children, className }) => (
  <InnerTableSurface className={cn('workflow-monitor-panel', className)} wrapperClassName="p-0">
    <div className="workflow-monitor-panel-head">
      <div>
        <h3>{title}</h3>
        {description ? <span>{description}</span> : null}
      </div>
      {meta ? <div className="workflow-monitor-panel-meta">{meta}</div> : null}
    </div>
    {children}
  </InnerTableSurface>
);

const getTimeoutLevelMeta = (level: TimeoutAlert['timeoutLevel']) => {
  if (level === 'CRITICAL') {
    return { label: '严重', className: 'workflow-monitor-badge-danger' };
  }
  if (level === 'WARNING') {
    return { label: '警告', className: 'badge-warning' };
  }
  return { label: '提醒', className: 'badge-gray' };
};

const getAnomalySeverityMeta = (severity: AnomalyAlert['severity']) => {
  if (severity === 'CRITICAL') {
    return { label: '严重', className: 'workflow-monitor-badge-danger' };
  }
  if (severity === 'HIGH') {
    return { label: '高', className: 'badge-warning' };
  }
  if (severity === 'MEDIUM') {
    return { label: '中', className: 'badge-primary' };
  }
  return { label: '低', className: 'badge-gray' };
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟`;
  return `${seconds}秒`;
};

const formatAlertTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTrendDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(-5) || value;
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const percentOf = (value: number, total: number) => {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
};

const getAnomalyMessage = (alert: AnomalyAlert) =>
  alert.errorMessage || alert.description || '暂无异常说明';

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

      const pageSize = getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10);
      const [overviewData, trendData, timeoutData, anomalyData] = await Promise.all([
        getMonitorOverview(),
        getProcessTrend({ days: 7 }),
        getTimeoutAlerts({ pageNum: 1, pageSize, resolved: false }),
        getAnomalyAlerts({ pageNum: 1, pageSize, resolved: false }),
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
    const timeoutCount = warningTimeouts + criticalTimeouts;
    const anomalyCount = overview?.unresolvedAnomalyCount || anomalyAlerts.length;
    const todayStarted = overview?.todayStarted || 0;
    const todayCompleted = overview?.todayCompleted || 0;

    return {
      todayStarted,
      todayCompleted,
      completionRate: todayStarted > 0 ? percentOf(todayCompleted, todayStarted) : overview?.successRate || 0,
      runningCount: overview?.runningCount || 0,
      pendingTaskCount: overview?.pendingTaskCount || 0,
      warningTimeouts,
      criticalTimeouts,
      timeoutCount,
      anomalyCount,
      avgCompletionTimeMs: overview?.avgCompletionTimeMs || 0,
      successRate: overview?.successRate || 0,
    };
  }, [anomalyAlerts.length, overview]);

  const visibleTrends = useMemo(() => trend.slice(-7), [trend]);
  const trendPeak = useMemo(() => {
    const peak = visibleTrends.reduce((max, item) => {
      return Math.max(max, item.started, item.completed, item.timeout, item.anomaly, item.running || 0);
    }, 0);
    return Math.max(peak, 1);
  }, [visibleTrends]);

  const lastUpdateTime = lastUpdate.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const statusLevel = summary.criticalTimeouts > 0 || summary.anomalyCount > 0
    ? { label: '需处理', className: 'workflow-monitor-badge-danger' }
    : summary.warningTimeouts > 0
      ? { label: '需关注', className: 'badge-warning' }
      : { label: '正常', className: 'badge-success' };

  const signalCards = [
    {
      label: '今日启动',
      value: String(summary.todayStarted),
      detail: `完成 ${summary.todayCompleted}`,
      icon: Activity,
      tone: 'blue',
    },
    {
      label: '运行中',
      value: String(summary.runningCount),
      detail: `待办 ${summary.pendingTaskCount}`,
      icon: TrendingUp,
      tone: 'green',
    },
    {
      label: '超时告警',
      value: String(summary.timeoutCount),
      detail: `严重 ${summary.criticalTimeouts}`,
      icon: Clock3,
      tone: 'amber',
    },
    {
      label: '异常未解',
      value: String(summary.anomalyCount),
      detail: `成功率 ${summary.successRate.toFixed(1)}%`,
      icon: AlertTriangle,
      tone: 'violet',
    },
  ];

  const healthRows = [
    { label: '今日完成率', value: `${summary.completionRate.toFixed(1)}%`, percent: summary.completionRate, tone: 'success' },
    { label: '整体成功率', value: `${summary.successRate.toFixed(1)}%`, percent: summary.successRate, tone: 'primary' },
    {
      label: '待办压力',
      value: `${summary.pendingTaskCount} / ${Math.max(summary.runningCount, 1)}`,
      percent: percentOf(summary.pendingTaskCount, Math.max(summary.runningCount + summary.pendingTaskCount, 1)),
      tone: 'warning',
    },
    {
      label: '告警密度',
      value: `${summary.timeoutCount + summary.anomalyCount} 条`,
      percent: percentOf(summary.timeoutCount + summary.anomalyCount, Math.max(summary.todayStarted + summary.runningCount, 1)),
      tone: 'danger',
    },
  ];

  const header = (
    <header className="admin-source-header workflow-monitor-header">
      <div>
        <p className="admin-source-kicker">WORKFLOW MONITORING</p>
        <h2>流程监控</h2>
        <span>查看流程运行趋势、超时告警、异常告警和实时处理状态</span>
      </div>
      <div className="admin-source-controls workflow-monitor-header-actions">
        <div className="workflow-monitor-switch" aria-label="自动刷新">
          <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} disabled={loading && !overview} />
          <span>自动刷新</span>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading ? 'animate-spin' : '')} />
          刷新
        </button>
      </div>
    </header>
  );

  const stats = (
    <section className="admin-source-stat-grid workflow-monitor-stat-grid">
      {signalCards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.label} className={`card admin-source-stat admin-source-tone-${card.tone}`}>
            <div className="admin-source-stat-icon">
              <Icon size={18} />
            </div>
            <div>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.detail}</span>
            </div>
          </article>
        );
      })}
    </section>
  );

  if (loading && !overview) {
    return (
      <section className="admin-source-page workflow-monitor-page">
        <TablePageLayout
          className="workflow-monitor-layout"
          actions={(
            <div className="workflow-monitor-top">
              {header}
              {stats}
            </div>
          )}
          table={(
            <InnerTableSurface className="workflow-monitor-loading-panel" wrapperClassName="p-0">
              <EmptyBlock title="正在加载流程监控" loading />
            </InnerTableSurface>
          )}
        />
      </section>
    );
  }

  const filters = (
    <div className="card workflow-monitor-statusbar">
      <div className="workflow-monitor-statusbar-main">
        <span className={cn('badge', statusLevel.className)}>{statusLevel.label}</span>
        <span>最后更新 <strong>{lastUpdateTime}</strong></span>
        <span>刷新间隔 <strong>{autoRefresh ? '30秒' : '手动'}</strong></span>
      </div>
      <div className="workflow-monitor-statusbar-meta">
        <span>平均完成 <strong>{formatDuration(summary.avgCompletionTimeMs)}</strong></span>
        <span>今日超时 <strong>{overview?.todayTimeout || 0}</strong></span>
        <span>今日异常 <strong>{overview?.todayAnomaly || 0}</strong></span>
      </div>
    </div>
  );

  const trendPanel = (
    <PanelShell
      className="workflow-monitor-trend-panel"
      title="运行趋势"
      description="最近 7 天"
      meta={<span className="badge badge-primary">趋势</span>}
    >
      {visibleTrends.length === 0 ? (
        <EmptyBlock title="暂无趋势数据" icon={<TrendingUp size={22} />} />
      ) : (
        <div className="workflow-monitor-trend-grid">
          {visibleTrends.map((item) => {
            const bars = [
              { key: 'started', label: '启动', value: item.started },
              { key: 'completed', label: '完成', value: item.completed },
              { key: 'timeout', label: '超时', value: item.timeout },
              { key: 'anomaly', label: '异常', value: item.anomaly },
            ];

            return (
              <article key={item.date} className="workflow-monitor-trend-day">
                <div className="workflow-monitor-trend-bars">
                  {bars.map((bar) => (
                    <span
                      key={bar.key}
                      className={`workflow-monitor-trend-bar is-${bar.key}`}
                      style={{ height: `${Math.max(8, percentOf(bar.value, trendPeak))}%` }}
                      data-tooltip={`${bar.label} ${bar.value}`}
                    />
                  ))}
                </div>
                <div className="workflow-monitor-trend-date">{formatTrendDate(item.date)}</div>
                <div className="workflow-monitor-trend-count">{item.started}/{item.completed}</div>
              </article>
            );
          })}
        </div>
      )}
      <div className="workflow-monitor-trend-legend">
        <span><i className="is-started" />启动</span>
        <span><i className="is-completed" />完成</span>
        <span><i className="is-timeout" />超时</span>
        <span><i className="is-anomaly" />异常</span>
      </div>
    </PanelShell>
  );

  const healthPanel = (
    <PanelShell
      className="workflow-monitor-health-panel"
      title="运行状态"
      description="关键健康指标"
      meta={<span className={cn('badge', statusLevel.className)}>{statusLevel.label}</span>}
    >
      <div className="workflow-monitor-health-list">
        {healthRows.map((item) => (
          <article key={item.label} className={`workflow-monitor-health-row is-${item.tone}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
            </div>
            <div className="workflow-monitor-progress">
              <i style={{ width: `${Math.max(2, Math.min(100, item.percent))}%` }} />
            </div>
          </article>
        ))}
      </div>
      <div className="workflow-monitor-health-footer">
        <div>
          <ListChecks size={16} />
          <span>待办任务</span>
          <strong>{summary.pendingTaskCount}</strong>
        </div>
        <div>
          <TimerReset size={16} />
          <span>平均时长</span>
          <strong>{formatDuration(summary.avgCompletionTimeMs)}</strong>
        </div>
      </div>
    </PanelShell>
  );

  const timeoutTable = (
    <PanelShell
      className="workflow-monitor-alert-panel"
      title="超时告警"
      description="未处理的流程和任务超时"
      meta={<span className="badge badge-warning">{timeoutAlerts.length} 条</span>}
    >
      {timeoutAlerts.length === 0 ? (
        <EmptyBlock title="暂无超时告警" icon={<CheckCircle2 size={22} />} />
      ) : (
        <div className="workflow-monitor-table-wrap">
          <table className="unity-data-table workflow-monitor-alert-table">
            <thead>
              <tr>
                <th>对象</th>
                <th>类型</th>
                <th>级别</th>
                <th>处理人</th>
                <th>超时</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {timeoutAlerts.map((alert) => {
                const meta = getTimeoutLevelMeta(alert.timeoutLevel);
                return (
                  <tr key={alert.id}>
                    <td>
                      <div className="workflow-monitor-name-cell">
                        <strong>{alert.targetName}</strong>
                        <span>{alert.targetId || '-'}</span>
                      </div>
                    </td>
                    <td>{alert.alertType === 'TASK' ? '任务' : '流程'}</td>
                    <td><span className={cn('badge', meta.className)}>{meta.label}</span></td>
                    <td>{alert.assigneeName || '未分配'}</td>
                    <td>{formatDuration(alert.timeoutDuration)}</td>
                    <td>{formatAlertTime(alert.alertTime || alert.createTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );

  const anomalyTable = (
    <PanelShell
      className="workflow-monitor-alert-panel"
      title="异常告警"
      description="流程执行异常和待处理问题"
      meta={<span className="badge workflow-monitor-badge-danger">{anomalyAlerts.length} 条</span>}
    >
      {anomalyAlerts.length === 0 ? (
        <EmptyBlock title="暂无异常告警" icon={<CheckCircle2 size={22} />} />
      ) : (
        <div className="workflow-monitor-table-wrap">
          <table className="unity-data-table workflow-monitor-alert-table">
            <thead>
              <tr>
                <th>流程</th>
                <th>类型</th>
                <th>级别</th>
                <th>状态</th>
                <th>说明</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {anomalyAlerts.map((alert) => {
                const meta = getAnomalySeverityMeta(alert.severity);
                return (
                  <tr key={alert.id}>
                    <td>
                      <div className="workflow-monitor-name-cell">
                        <strong>{alert.processName}</strong>
                        <span>{alert.processDefKey || '-'}</span>
                      </div>
                    </td>
                    <td>{alert.anomalyType || '-'}</td>
                    <td><span className={cn('badge', meta.className)}>{meta.label}</span></td>
                    <td>{alert.resolved === 'Y' ? '已解决' : '待处理'}</td>
                    <td>
                      <span className="workflow-monitor-clamp">{getAnomalyMessage(alert)}</span>
                    </td>
                    <td>{formatAlertTime(alert.alertTime || alert.createTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );

  const content = (
    <section className="workflow-monitor-workbench">
      <div className="workflow-monitor-overview-grid">
        {trendPanel}
        {healthPanel}
      </div>
      <div className="workflow-monitor-alert-grid">
        {timeoutTable}
        {anomalyTable}
      </div>
    </section>
  );

  return (
    <section className="admin-source-page workflow-monitor-page">
      <TablePageLayout
        className="workflow-monitor-layout"
        actions={(
          <div className="workflow-monitor-top">
            {header}
            {stats}
          </div>
        )}
        filters={filters}
        table={content}
      />
    </section>
  );
};

export default WorkflowMonitor;
