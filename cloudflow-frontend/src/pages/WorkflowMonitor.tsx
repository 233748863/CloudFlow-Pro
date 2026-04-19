/**
 * 工作流监控大屏
 * Phase 2 新增功能 - 实时监控流程执行状态和告警
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */

import React, { useState, useEffect } from 'react';
import { Button, TableHead, TableHeader } from '@/components/ui';

import { 
  Activity, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Users,
  FileText,
  RefreshCw
} from 'lucide-react';
import { 
  getMonitorOverview, 
  getProcessTrend, 
  getTimeoutAlerts,
  getAnomalyAlerts,
  MonitorOverview,
  ProcessTrend,
  TimeoutAlert,
  AnomalyAlert
} from '@/services/api/monitor';
import {
  WorkspaceEmptyPanel,
  WorkspaceStatusPage,
  WorkspaceBackdrop,
  WorkspacePageContent,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
// import { toast } from 'react-hot-toast';

/**
 * 统计卡片组件
 */
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, trend }) => {
  return (
    <WorkspaceMetricCard
      label={title}
      value={value}
      hint={trend}
      valueClassName={color}
      aside={
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
          {icon}
        </div>
      }
    />
  );
};

/**
 * 告警项组件
 */
interface AlertItemProps {
  alert: TimeoutAlert | AnomalyAlert;
  type: 'timeout' | 'anomaly';
}

const AlertItem: React.FC<AlertItemProps> = ({ alert, type }) => {
  const isTimeout = type === 'timeout';
  const timeoutAlert = alert as TimeoutAlert;
  const anomalyAlert = alert as AnomalyAlert;
  
  const levelColor = isTimeout
    ? (timeoutAlert.timeoutLevel === 'CRITICAL'
        ? 'text-red-600'
        : timeoutAlert.timeoutLevel === 'WARNING'
          ? 'text-yellow-600'
          : 'text-cyan-600')
    : (anomalyAlert.severity === 'CRITICAL' || anomalyAlert.severity === 'HIGH' ? 'text-red-600' : 'text-yellow-600');
  
  const levelIcon = isTimeout
    ? (timeoutAlert.timeoutLevel === 'CRITICAL' ? '\uD83D\uDD34' : timeoutAlert.timeoutLevel === 'WARNING' ? '\uD83D\uDFE1' : '\uD83D\uDD35')
    : (anomalyAlert.severity === 'CRITICAL' || anomalyAlert.severity === 'HIGH' ? '\uD83D\uDD34' : '\uD83D\uDFE1');

  const alertDescription = anomalyAlert.errorMessage || anomalyAlert.description || '\u6682\u65e0\u5f02\u5e38\u8bf4\u660e';
  const alertDisplayTime = isTimeout
    ? (timeoutAlert.alertTime || timeoutAlert.createTime)
    : (anomalyAlert.alertTime || anomalyAlert.createTime);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-transparent p-3 transition hover:border-slate-200 hover:bg-slate-50">
      <span className="text-xl">{levelIcon}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${levelColor}`}>
          {isTimeout ? '超时告警' : '异常告警'}
        </p>
        <p className="text-sm text-gray-900 truncate">
          {isTimeout ? timeoutAlert.targetName : anomalyAlert.processName}
        </p>
        <p className="text-xs text-gray-500">
          {isTimeout 
            ? `已超时 ${Math.max(1, Math.ceil(timeoutAlert.timeoutDuration / (1000 * 60 * 60)))} 小时`
            : alertDescription
          }
        </p>
      </div>
      <span className="text-xs text-gray-400">
        {new Date(alertDisplayTime).toLocaleTimeString('zh-CN', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}
      </span>
    </div>
  );
};

/**
 * 工作流监控大屏主组件
 */
const WorkflowMonitor: React.FC = () => {
  const [overview, setOverview] = useState<MonitorOverview | null>(null);
  const [trend, setTrend] = useState<ProcessTrend[]>([]);
  const [timeoutAlerts, setTimeoutAlerts] = useState<TimeoutAlert[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  /**
   * 加载监控数据
   */
  const loadData = async () => {
    try {
      setLoading(true);
      
      // 并行加载所有数据
      const [overviewData, trendData, timeoutData, anomalyData] = await Promise.all([
        getMonitorOverview(),
        getProcessTrend({ days: 7 }),
        getTimeoutAlerts({ pageNum: 1, pageSize: 10, resolved: false }),
        getAnomalyAlerts({ pageNum: 1, pageSize: 10, resolved: false })
      ]);

      setOverview(overviewData);
      setTrend(trendData);
      setTimeoutAlerts(timeoutData.rows || timeoutData.records || []);
      setAnomalyAlerts(anomalyData.rows || anomalyData.records || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('加载监控数据失败:', error);
      console.error('加载监控数据失败');
      // toast.error('加载监控数据失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 初始加载和自动刷新
   */
  useEffect(() => {
    loadData();

    if (autoRefresh) {
      const interval = setInterval(loadData, 30000); // 每30秒刷新
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  /**
   * 格式化时长
   */
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟`;
    return `${seconds}秒`;
  };

  if (loading && !overview) {
    return (
      <WorkspaceStatusPage
        icon={<RefreshCw className="h-8 w-8 animate-spin text-teal-600" />}
        iconWrapClassName="border border-teal-100 bg-teal-50 text-teal-600"
        title="正在加载流程监控..."
        description="正在同步流程概览、趋势和告警信息，请稍候。"
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent className="space-y-6">
        <WorkspaceHeroCard
          badge={
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <Activity size={14} className="text-teal-600" />
              流程运行洞察
            </div>
          }
          title="工作流监控大屏"
          description="实时查看流程执行、告警变化和整体性能趋势。"
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 shadow-sm">
                <input
                  type="checkbox"
                  id="autoRefresh"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-slate-300 accent-teal-600"
                />
                自动刷新（30秒）
              </label>
              <Button
                onClick={loadData}
                disabled={loading}
                className="rounded-xl"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          }
        >
          <div className="pt-1 text-xs text-slate-400">
            最后更新：{lastUpdate.toLocaleTimeString('zh-CN')}
          </div>
        </WorkspaceHeroCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="今日启动"
            value={overview?.todayStarted || 0}
            icon={<Activity className="h-5 w-5 text-teal-600" />}
            color="text-cyan-700"
          />
          <StatCard
            title="今日完成"
            value={overview?.todayCompleted || 0}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            color="text-emerald-600"
          />
          <StatCard
            title="超时告警"
            value={(overview?.warningAlertCount || 0) + (overview?.criticalAlertCount || 0)}
            icon={<Clock className="h-5 w-5 text-amber-600" />}
            color="text-amber-600"
          />
          <StatCard
            title="异常告警"
            value={overview?.unresolvedAnomalyCount || 0}
            icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}
            color="text-rose-600"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <WorkspaceSectionCard title="当前状态" headerAside={<Activity className="h-5 w-5 text-slate-300" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">运行中流程</span>
                <span className="text-lg font-semibold text-teal-600">{overview?.runningCount || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">待办任务</span>
                <span className="text-lg font-semibold text-orange-600">{overview?.pendingTaskCount || 0}</span>
              </div>
            </div>
          </WorkspaceSectionCard>

          <WorkspaceSectionCard title="告警统计" headerAside={<AlertTriangle className="h-5 w-5 text-slate-300" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">严重告警</span>
                <span className="text-lg font-semibold text-rose-600">{overview?.criticalAlertCount || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">警告提醒</span>
                <span className="text-lg font-semibold text-amber-600">{overview?.warningAlertCount || 0}</span>
              </div>
            </div>
          </WorkspaceSectionCard>

          <WorkspaceSectionCard title="性能指标" headerAside={<TrendingUp className="h-5 w-5 text-slate-300" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">平均完成时间</span>
                <span className="text-lg font-semibold text-violet-600">{formatDuration(overview?.avgCompletionTimeMs || 0)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm text-slate-500">成功率</span>
                <span className="text-lg font-semibold text-emerald-600">{(overview?.successRate || 0).toFixed(1)}%</span>
              </div>
            </div>
          </WorkspaceSectionCard>
        </div>

        <WorkspaceSectionCard
          title="流程趋势（最近 7 天）"
          description="快速查看每日启动、完成、超时和异常变化。"
          headerAside={<TrendingUp className="h-5 w-5 text-slate-300" />}
        >
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100">
              <TableHeader className="bg-slate-50">
                <tr>
                  <TableHead className="px-4 py-2 text-left">日期</TableHead>
                  <TableHead className="px-4 py-2 text-right">启动</TableHead>
                  <TableHead className="px-4 py-2 text-right">完成</TableHead>
                  <TableHead className="px-4 py-2 text-right">超时</TableHead>
                  <TableHead className="px-4 py-2 text-right">异常</TableHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100">
                {trend.map((item, index) => (
                  <tr key={index} className="transition hover:bg-slate-50">
                    <td className="px-4 py-2 text-sm text-slate-900">{item.date}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-teal-600">{item.started}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-emerald-600">{item.completed}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-amber-600">{item.timeout}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-rose-600">{item.anomaly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkspaceSectionCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <WorkspaceSectionCard
            title="超时告警"
            description="优先处理已超时的流程节点与任务。"
            headerAside={
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
                {timeoutAlerts.length} 条
              </span>
            }
          >
            <div className="max-h-96 overflow-y-auto">
              {timeoutAlerts.length > 0 ? (
                <div className="space-y-2">
                  {timeoutAlerts.map((alert) => (
                    <AlertItem key={alert.id} alert={alert} type="timeout" />
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyPanel
                  variant="glass"
                  icon={<Clock className="h-6 w-6 text-slate-300" />}
                  title="暂无超时告警"
                  description="当前没有需要额外关注的超时流程。"
                />
              )}
            </div>
          </WorkspaceSectionCard>

          <WorkspaceSectionCard
            title="异常告警"
            description="统一查看失败、异常和高风险流程。"
            headerAside={
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-100">
                {anomalyAlerts.length} 条
              </span>
            }
          >
            <div className="max-h-96 overflow-y-auto">
              {anomalyAlerts.length > 0 ? (
                <div className="space-y-2">
                  {anomalyAlerts.map((alert) => (
                    <AlertItem key={alert.id} alert={alert} type="anomaly" />
                  ))}
                </div>
              ) : (
                <WorkspaceEmptyPanel
                  variant="glass"
                  icon={<AlertTriangle className="h-6 w-6 text-slate-300" />}
                  title="暂无异常告警"
                  description="当前没有异常流程告警需要处理。"
                />
              )}
            </div>
          </WorkspaceSectionCard>
        </div>
      </WorkspacePageContent>
    </div>
  );
};

export default WorkflowMonitor;
