import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  BarChart3,
  Heart,
  AlertTriangle,
  Zap,
  FileText,
} from 'lucide-react';
import request from '@/services/api/request';

interface MetricsData {
  totalInstances: number;
  runningInstances: number;
  completedInstances: number;
  rejectedInstances: number;
  totalTasks: number;
  todayInstances: number;
  todayTasks: number;
  actionCounters: Record<string, number>;
  todayCounters: Record<string, number>;
  health: {
    status: string;
    database?: string;
    redis?: string;
    workflowEngine?: string;
  };
}

interface AnalysisData {
  byProcessKey: Record<string, number>;
  byStatus: Record<string, number>;
  avgDurationHours: number;
  approvalRate?: number;
}

// 移动端统计卡片
function MobileStatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{title}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

// 移动端进度条
function MobileProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={`font-medium ${color}`}>{value}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// 操作名称映射
const ACTION_LABELS: Record<string, string> = {
  PROCESS_START: '启动流程',
  TASK_COMPLETE: '完成任务',
  TASK_REJECT: '驳回任务',
  PROCESS_RECALL: '撤回流程',
  DEFINITION_CREATE: '创建定义',
  DEFINITION_DEPLOY: '发布定义',
};

export const MobileWorkflowMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [metricsRes, analysisRes] = await Promise.all([
        request.get('/workflow/statistics/metrics', { silent: true }).catch(() => null),
        request.get('/workflow/statistics/analysis', { silent: true }).catch(() => null),
      ]);

      if (metricsRes) {
        setMetrics(metricsRes);
      }
      if (analysisRes) {
        setAnalysis(analysisRes);
      }
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      setError('获取监控数据失败');
      console.error('Failed to fetch monitoring data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchData, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-pink-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-pink-400 text-white text-sm rounded-lg active:bg-pink-500"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const m = metrics || {
    totalInstances: 0,
    runningInstances: 0,
    completedInstances: 0,
    rejectedInstances: 0,
    totalTasks: 0,
    todayInstances: 0,
    todayTasks: 0,
    actionCounters: {},
    todayCounters: {},
    health: { status: 'UNKNOWN' },
  };

  const a = analysis || {
    byProcessKey: {},
    byStatus: {},
    avgDurationHours: 0,
    approvalRate: 0,
  };

  const completionRate = a.approvalRate || 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-pink-500" />
              <h1 className="text-lg font-bold text-gray-800">工作流监控</h1>
            </div>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg active:bg-gray-100"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2 py-1 rounded text-xs ${
                autoRefresh ? 'bg-pink-50 text-pink-600' : 'bg-gray-100 text-gray-500'
              }`}
            >
              自动刷新 {autoRefresh ? '开' : '关'}
            </button>
            {lastUpdate && (
              <span className="text-gray-400">更新: {lastUpdate}</span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 核心指标 */}
        <div className="grid grid-cols-2 gap-3">
          <MobileStatCard
            title="流程总数"
            value={m.totalInstances}
            icon={FileText}
            color="text-pink-500"
          />
          <MobileStatCard
            title="运行中"
            value={m.runningInstances}
            icon={Activity}
            color="text-yellow-600"
          />
          <MobileStatCard
            title="已完成"
            value={m.completedInstances}
            icon={CheckCircle}
            color="text-green-600"
          />
          <MobileStatCard
            title="已拒绝"
            value={m.rejectedInstances}
            icon={XCircle}
            color="text-red-600"
          />
        </div>

        {/* 今日统计 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            今日统计
          </h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-gray-500 mb-1">新增实例</div>
              <div className="text-xl font-bold text-pink-500">{m.todayInstances}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">完成任务</div>
              <div className="text-xl font-bold text-green-600">{m.todayTasks}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">待办任务</div>
              <div className="text-xl font-bold text-orange-600">{m.totalTasks}</div>
            </div>
          </div>
        </div>

        {/* 流程状态分布 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">流程状态分布</h2>
          <MobileProgressBar
            label="运行中"
            value={m.runningInstances}
            max={m.totalInstances}
            color="text-yellow-600"
          />
          <MobileProgressBar
            label="已完成"
            value={m.completedInstances}
            max={m.totalInstances}
            color="text-green-600"
          />
          <MobileProgressBar
            label="已拒绝"
            value={m.rejectedInstances}
            max={m.totalInstances}
            color="text-red-600"
          />
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-500">完成率</span>
            <span className={`text-lg font-bold ${completionRate > 80 ? 'text-green-600' : 'text-yellow-600'}`}>
              {completionRate.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* 流程类型统计 */}
        {Object.keys(a.byProcessKey || {}).length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">流程类型统计</h2>
            {Object.entries(a.byProcessKey || {}).map(([type, count]) => (
              <MobileProgressBar
                key={type}
                label={type}
                value={count}
                max={Math.max(...Object.values(a.byProcessKey || {}), 1)}
                color="text-pink-500"
              />
            ))}
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">平均处理时长</span>
              <span className="text-lg font-bold text-pink-500">
                {a.avgDurationHours.toFixed(1)} <span className="text-xs font-normal text-gray-400">小时</span>
              </span>
            </div>
          </div>
        )}

        {/* 系统健康状态 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-500" />
            系统健康状态
          </h2>
          <div className="text-center mb-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                m.health.status === 'UP' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  m.health.status === 'UP' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              {m.health.status === 'UP' ? '系统正常' : '系统异常'}
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">数据库</span>
              <span className={m.health.database === 'UP' ? 'text-green-600' : 'text-red-600'}>
                {m.health.database || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Redis</span>
              <span className={m.health.redis === 'UP' ? 'text-green-600' : 'text-red-600'}>
                {m.health.redis || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">工作流引擎</span>
              <span className={m.health.workflowEngine === 'UP' ? 'text-green-600' : 'text-red-600'}>
                {m.health.workflowEngine || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* 操作统计 */}
        {Object.keys(m.actionCounters).length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-500" />
              操作统计
            </h2>
            <div className="space-y-2">
              {Object.entries(m.actionCounters).slice(0, 5).map(([action, count]) => (
                <div key={action} className="flex justify-between items-center text-xs">
                  <span className="text-gray-600">{ACTION_LABELS[action] || action}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{count}</span>
                    <span className="px-1.5 py-0.5 bg-pink-50 text-pink-600 rounded text-xs">
                      今日 {m.todayCounters[action] || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileWorkflowMonitor;
