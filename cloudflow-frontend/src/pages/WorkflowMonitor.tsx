import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  BarChart3,
  PieChart,
  Heart,
  AlertTriangle,
  Zap,
  FileText,
  RotateCcw,
  BookOpen,
  Rocket,
  Calendar,
  Award,
} from 'lucide-react';
import request from '@/services/api/request';

// === 类型定义 ===
interface MetricsData {
  totalInstances: number;
  runningInstances: number;
  completedInstances: number;
  rejectedInstances: number;
  revokedInstances: number;
  totalDefinitions: number;
  deployedDefinitions: number;
  totalTasks: number;
  allTaskCount: number;
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
  dailyTrend?: { date: string; count: number }[];
  workloadRank?: { operatorId: number; taskCount: number }[];
}

// === 子组件 ===

// 进度条
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-200 rounded-full h-3">
      <div
        className={`h-3 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// 统计卡片
function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subText,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subText?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
          {subText && <p className="text-xs text-gray-400 mt-1">{subText}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('600', '100').replace('500', '100')}`}>
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
      </div>
    </div>
  );
}

// 健康状态指示器
function HealthIndicator({ label, status }: { label: string; status?: string }) {
  const isHealthy = status === 'UP' || status === 'HEALTHY';
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${isHealthy ? 'text-green-600' : 'text-red-600'}`}>
        {status || 'N/A'}
      </span>
    </div>
  );
}

// 简易柱状图（7天趋势）
function MiniBarChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-medium text-blue-600">{d.count > 0 ? d.count : ''}</span>
          <div
            className="w-full bg-blue-500 rounded-t transition-all duration-500 min-h-[4px]"
            style={{ height: `${Math.max((d.count / maxCount) * 100, 4)}%` }}
          />
          <span className="text-[10px] text-gray-400">{d.date}</span>
        </div>
      ))}
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
  PERMISSION_DENIED: '权限拒绝',
  RATE_LIMIT_HIT: '触发限流',
};

// === 主组件 ===
const WorkflowMonitor: React.FC = () => {
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

      if (metricsRes) setMetrics(metricsRes);
      if (analysisRes) setAnalysis(analysisRes);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      setError('获取监控数据失败，请检查后端服务是否正常运行');
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
    return () => { if (interval) clearInterval(interval); };
  }, [autoRefresh, fetchData]);

  // 加载中
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">加载监控数据中...</p>
        </div>
      </div>
    );
  }

  // 错误
  if (error && !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-500 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
            重试
          </button>
        </div>
      </div>
    );
  }

  // 默认值
  const m: MetricsData = metrics || {
    totalInstances: 0, runningInstances: 0, completedInstances: 0, rejectedInstances: 0,
    revokedInstances: 0, totalDefinitions: 0, deployedDefinitions: 0,
    totalTasks: 0, allTaskCount: 0, todayInstances: 0, todayTasks: 0,
    actionCounters: {}, todayCounters: {},
    health: { status: 'UNKNOWN' },
  };

  const a: AnalysisData = analysis || {
    byProcessKey: {}, byStatus: {}, avgDurationHours: 0, approvalRate: 0,
    dailyTrend: [], workloadRank: [],
  };

  const maxProcessTypeCount = Math.max(...Object.values(a.byProcessKey || {}), 1);
  const completionRate = a.approvalRate || 0;

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">工作流监控大屏</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              autoRefresh ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            自动刷新 {autoRefresh ? '开启' : '关闭'}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            手动刷新
          </button>
          {lastUpdate && <span className="text-xs text-gray-400">最后更新: {lastUpdate}</span>}
        </div>
      </div>

      {/* 第一行：核心实例指标 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="流程实例总数" value={m.totalInstances} icon={FileText} color="text-blue-600" />
        <StatCard title="运行中" value={m.runningInstances} icon={Activity} color="text-yellow-600" />
        <StatCard title="已完成" value={m.completedInstances} icon={CheckCircle} color="text-green-600" />
        <StatCard title="已拒绝" value={m.rejectedInstances} icon={XCircle} color="text-red-600" />
        <StatCard title="已撤回" value={m.revokedInstances} icon={RotateCcw} color="text-purple-600" />
      </div>

      {/* 第二行：今日统计 + 流程定义 + 任务 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="今日新增实例" value={m.todayInstances} icon={TrendingUp} color="text-blue-500" subText="今日" />
        <StatCard title="今日完成任务" value={m.todayTasks} icon={Zap} color="text-green-500" subText="今日" />
        <StatCard title="待办任务" value={m.totalTasks} icon={Clock} color="text-orange-500" />
        <StatCard title="流程定义数" value={m.totalDefinitions} icon={BookOpen} color="text-indigo-600" />
        <StatCard title="已发布定义" value={m.deployedDefinitions} icon={Rocket} color="text-teal-600" />
      </div>

      {/* 第三行：流程状态分布 + 流程类型统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 流程状态分布 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChart className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-700">流程状态分布</h2>
          </div>
          <div className="space-y-4">
            {[
              { label: '运行中', value: m.runningInstances, color: 'bg-yellow-500', textColor: 'text-yellow-600' },
              { label: '已完成', value: m.completedInstances, color: 'bg-green-500', textColor: 'text-green-600' },
              { label: '已拒绝', value: m.rejectedInstances, color: 'bg-red-500', textColor: 'text-red-600' },
              { label: '已撤回', value: m.revokedInstances, color: 'bg-purple-500', textColor: 'text-purple-600' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{item.label}</span>
                  <span className={`font-medium ${item.textColor}`}>{item.value}</span>
                </div>
                <ProgressBar value={item.value} max={m.totalInstances} color={item.color} />
              </div>
            ))}
          </div>

          {/* 完成率 */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-500">完成率</span>
              <span className={`text-2xl font-bold ${completionRate > 50 ? 'text-green-600' : completionRate > 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                {completionRate.toFixed(1)}%
              </span>
            </div>
            <ProgressBar
              value={completionRate}
              max={100}
              color={completionRate > 50 ? 'bg-green-500' : completionRate > 20 ? 'bg-yellow-500' : 'bg-red-500'}
            />
          </div>
        </div>

        {/* 流程类型统计 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-700">流程类型统计</h2>
          </div>
          {Object.keys(a.byProcessKey || {}).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(a.byProcessKey || {}).map(([type, count]) => (
                <div key={type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 truncate max-w-[200px]" title={type}>{type}</span>
                    <span className="font-medium text-blue-600">{count}</span>
                  </div>
                  <ProgressBar value={count} max={maxProcessTypeCount} color="bg-blue-500" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400">暂无数据</div>
          )}

          {/* 平均处理时长 */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">平均处理时长</span>
              <span className="text-2xl font-bold text-blue-600">
                {a.avgDurationHours.toFixed(1)} <span className="text-sm font-normal text-gray-400">小时</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 第四行：7天趋势 + 工作量排行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7天趋势 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Calendar className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-700">近7天流程发起趋势</h2>
          </div>
          {(a.dailyTrend && a.dailyTrend.length > 0) ? (
            <MiniBarChart data={a.dailyTrend} />
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400">暂无趋势数据</div>
          )}
        </div>

        {/* 处理人工作量排行 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-700">处理人工作量排行</h2>
          </div>
          {(a.workloadRank && a.workloadRank.length > 0) ? (
            <div className="space-y-3">
              {a.workloadRank.map((item, idx) => {
                const maxTask = a.workloadRank![0]?.taskCount || 1;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={item.operatorId} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold">
                      {idx < 3 ? medals[idx] : <span className="text-gray-400">{idx + 1}</span>}
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">用户 #{item.operatorId}</span>
                        <span className="font-medium text-amber-600">{item.taskCount} 任务</span>
                      </div>
                      <ProgressBar value={item.taskCount} max={maxTask} color="bg-amber-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400">暂无工作量数据</div>
          )}
        </div>
      </div>

      {/* 第五行：系统健康状态 + 操作统计 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 系统健康状态 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Heart className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-700">系统健康状态</h2>
          </div>
          <div className="space-y-4">
            <div className="text-center mb-4">
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                  m.health.status === 'UP' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${m.health.status === 'UP' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {m.health.status === 'UP' ? '系统正常' : '系统异常'}
              </div>
            </div>
            <HealthIndicator label="数据库" status={m.health.database} />
            <HealthIndicator label="Redis" status={m.health.redis} />
            <HealthIndicator label="工作流引擎" status={m.health.workflowEngine} />

            {/* 额外的系统概要 */}
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">全部任务数</span>
                <span className="font-medium text-gray-700">{m.allTaskCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">流程定义数</span>
                <span className="font-medium text-gray-700">{m.totalDefinitions}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">已发布定义</span>
                <span className="font-medium text-gray-700">{m.deployedDefinitions}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 操作统计表格 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-700">操作统计</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">操作类型</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">总计</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">今日</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(m.actionCounters).length > 0 ? (
                  Object.entries(m.actionCounters).map(([action, count]) => (
                    <tr key={action} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-gray-700">
                        {ACTION_LABELS[action] || action.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-gray-800">{count}</td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {m.todayCounters[action] || 0}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-gray-400">暂无操作记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowMonitor;
