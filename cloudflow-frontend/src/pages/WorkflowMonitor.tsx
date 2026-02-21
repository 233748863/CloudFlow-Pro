/**
 * 工作流监控大屏
 * Phase 2 新增功能 - 实时监控流程执行状态和告警
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */

import React, { useState, useEffect } from 'react';
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
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
          {trend && (
            <p className="text-xs text-gray-500 mt-1">{trend}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${color.replace('text-', 'bg-').replace('-600', '-100')}`}>
          {icon}
        </div>
      </div>
    </div>
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
    ? (timeoutAlert.alertLevel === 'CRITICAL' ? 'text-red-600' : 'text-yellow-600')
    : (anomalyAlert.severity === 'CRITICAL' || anomalyAlert.severity === 'HIGH' ? 'text-red-600' : 'text-yellow-600');
  
  const levelIcon = isTimeout
    ? (timeoutAlert.alertLevel === 'CRITICAL' ? '🔴' : '🟡')
    : (anomalyAlert.severity === 'CRITICAL' || anomalyAlert.severity === 'HIGH' ? '🔴' : '🟡');

  return (
    <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <span className="text-xl">{levelIcon}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${levelColor}`}>
          {isTimeout ? '超时告警' : '异常告警'}
        </p>
        <p className="text-sm text-gray-900 truncate">
          {isTimeout ? timeoutAlert.relatedTitle : anomalyAlert.processName}
        </p>
        <p className="text-xs text-gray-500">
          {isTimeout 
            ? `已超时 ${timeoutAlert.timeoutHours} 小时`
            : anomalyAlert.description
          }
        </p>
      </div>
      <span className="text-xs text-gray-400">
        {new Date(alert.createTime).toLocaleTimeString('zh-CN', { 
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
        getTimeoutAlerts({ pageNum: 1, pageSize: 10 }),
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
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">加载监控数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 页面标题和控制栏 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工作流监控大屏</h1>
          <p className="text-sm text-gray-600 mt-1">
            实时监控流程执行状态和告警信息
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="autoRefresh" className="text-sm text-gray-700">
              自动刷新 (30秒)
            </label>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>
          <span className="text-xs text-gray-500">
            最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
          </span>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard
          title="今日启动"
          value={overview?.todayStarted || 0}
          icon={<Activity className="w-6 h-6 text-blue-600" />}
          color="text-blue-600"
        />
        <StatCard
          title="今日完成"
          value={overview?.todayCompleted || 0}
          icon={<CheckCircle2 className="w-6 h-6 text-green-600" />}
          color="text-green-600"
        />
        <StatCard
          title="超时告警"
          value={(overview?.warningAlertCount || 0) + (overview?.criticalAlertCount || 0)}
          icon={<Clock className="w-6 h-6 text-yellow-600" />}
          color="text-yellow-600"
        />
        <StatCard
          title="异常告警"
          value={overview?.unresolvedAnomalyCount || 0}
          icon={<AlertTriangle className="w-6 h-6 text-red-600" />}
          color="text-red-600"
        />
      </div>

      {/* 当前状态和性能指标 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">当前状态</h3>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">运行中流程</span>
              <span className="text-lg font-semibold text-blue-600">
                {overview?.runningCount || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">待办任务</span>
              <span className="text-lg font-semibold text-orange-600">
                {overview?.pendingTaskCount || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">告警统计</h3>
            <AlertTriangle className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">严重告警</span>
              <span className="text-lg font-semibold text-red-600">
                {overview?.criticalAlertCount || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">警告提醒</span>
              <span className="text-lg font-semibold text-yellow-600">
                {overview?.warningAlertCount || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">性能指标</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">平均完成时间</span>
              <span className="text-lg font-semibold text-purple-600">
                {formatDuration(overview?.avgCompletionTimeMs || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">成功率</span>
              <span className="text-lg font-semibold text-green-600">
                {((overview?.successRate || 0) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 流程趋势图表（简化版，使用文本展示） */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">流程趋势（最近7天）</h3>
          <TrendingUp className="w-5 h-5 text-gray-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">启动</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">完成</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">超时</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">异常</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {trend.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">{item.date}</td>
                  <td className="px-4 py-2 text-sm text-right text-blue-600">{item.started}</td>
                  <td className="px-4 py-2 text-sm text-right text-green-600">{item.completed}</td>
                  <td className="px-4 py-2 text-sm text-right text-yellow-600">{item.timeout}</td>
                  <td className="px-4 py-2 text-sm text-right text-red-600">{item.anomaly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 告警列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 超时告警 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">超时告警</h3>
              <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                {timeoutAlerts.length} 条
              </span>
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {timeoutAlerts.length > 0 ? (
              <div className="space-y-2">
                {timeoutAlerts.map((alert) => (
                  <AlertItem key={alert.id} alert={alert} type="timeout" />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂无超时告警</p>
              </div>
            )}
          </div>
        </div>

        {/* 异常告警 */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">异常告警</h3>
              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                {anomalyAlerts.length} 条
              </span>
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {anomalyAlerts.length > 0 ? (
              <div className="space-y-2">
                {anomalyAlerts.map((alert) => (
                  <AlertItem key={alert.id} alert={alert} type="anomaly" />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>暂无异常告警</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowMonitor;
