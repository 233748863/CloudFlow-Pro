import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  GitBranch,
  CheckCircle,
  RotateCcw,
  RefreshCw,
  Calendar,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { getDeployStatistics } from '@/services/api/deployEnhancement';
import { getProcessDefinitions } from '@/services/api/workflow';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';

interface DeployStats {
  totalDeploys: number;
  successCount: number;
  rollbackCount: number;
  snapshotCount: number;
  latestVersion: number;
}

export const DeployStatistics: React.FC = () => {
  const [processes, setProcesses] = useState<any[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [stats, setStats] = useState<DeployStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcess) {
      loadStatistics();
    }
  }, [selectedProcess]);

  const loadProcesses = async () => {
    try {
      const data = await getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false });
      const list = Array.isArray(data) ? data : [];
      setProcesses(list);
      if (list.length > 0) {
        const first = list[0] as any;
        setSelectedProcess(String(first.definitionId || ''));
      }
    } catch (error) {
      toast.error('加载流程列表失败');
      console.error(error);
    }
  };

  const loadStatistics = async () => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      const data: any = await getDeployStatistics(selectedProcess);
      setStats(data as DeployStats);
    } catch (error) {
      toast.error('加载统计数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSuccessRate = (): string => {
    if (!stats || stats.totalDeploys === 0) return '0.0';
    return ((stats.successCount / stats.totalDeploys) * 100).toFixed(1);
  };

  const calculateRollbackRate = (): string => {
    if (!stats || stats.totalDeploys === 0) return '0.0';
    return ((stats.rollbackCount / stats.totalDeploys) * 100).toFixed(1);
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">发布统计</h2>
          <p className="text-sm text-gray-500 mt-1">查看流程发布的统计信息</p>
        </div>
        <button
          onClick={loadStatistics}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 流程选择 */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">选择流程:</label>
        <Select value={selectedProcess} onValueChange={v => setSelectedProcess(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {processes.map(p => (
                        <SelectItem key={String((p as any).definitionId)} value={String((p as any).definitionId)}>
                          {(p as any).processName || (p as any).processKey}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
      </div>

      {/* 统计卡片 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
        </div>
      ) : stats ? (
        <>
          {/* 核心指标 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">总发布次数</p>
                  <p className="text-3xl font-bold text-pink-500">{stats.totalDeploys}</p>
                </div>
                <div className="p-3 rounded-xl bg-pink-50">
                  <Package className="w-6 h-6 text-pink-500" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">成功发布</p>
                  <p className="text-3xl font-bold text-green-600">{stats.successCount}</p>
                  <p className="text-xs text-gray-400 mt-1">成功率: {calculateSuccessRate()}%</p>
                </div>
                <div className="p-3 rounded-xl bg-green-100">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">回滚次数</p>
                  <p className="text-3xl font-bold text-orange-600">{stats.rollbackCount}</p>
                  <p className="text-xs text-gray-400 mt-1">回滚率: {calculateRollbackRate()}%</p>
                </div>
                <div className="p-3 rounded-xl bg-orange-100">
                  <RotateCcw className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">当前版本</p>
                  <p className="text-3xl font-bold text-purple-600">v{stats.latestVersion}</p>
                  <p className="text-xs text-gray-400 mt-1">快照数: {stats.snapshotCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-100">
                  <GitBranch className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 发布成功率 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-700">发布成功率</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">成功发布</span>
                    <span className="font-medium text-green-600">
                      {stats.successCount} ({calculateSuccessRate()}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-green-500 transition-all duration-500"
                      style={{ width: `${calculateSuccessRate()}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">回滚发布</span>
                    <span className="font-medium text-orange-600">
                      {stats.rollbackCount} ({calculateRollbackRate()}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-orange-500 transition-all duration-500"
                      style={{ width: `${calculateRollbackRate()}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 健康度评估 */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">发布健康度</span>
                  <span
                    className={`text-2xl font-bold ${
                      parseFloat(calculateSuccessRate()) >= 90
                        ? 'text-green-600'
                        : parseFloat(calculateSuccessRate()) >= 70
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {parseFloat(calculateSuccessRate()) >= 90
                      ? '优秀'
                      : parseFloat(calculateSuccessRate()) >= 70
                      ? '良好'
                      : '需改进'}
                  </span>
                </div>
              </div>
            </div>

            {/* 版本信息 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold text-gray-700">版本信息</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">当前版本</span>
                    <span className="text-2xl font-bold text-purple-600">v{stats.latestVersion}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    已创建 {stats.snapshotCount} 个版本快照
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500">总发布</span>
                    </div>
                    <span className="text-xl font-bold text-gray-800">{stats.totalDeploys}</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-500">快照</span>
                    </div>
                    <span className="text-xl font-bold text-gray-800">{stats.snapshotCount}</span>
                  </div>
                </div>

                {/* 平均版本寿命 */}
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">平均版本寿命</span>
                    <span className="font-medium text-gray-700">
                      {stats.totalDeploys > 0
                        ? `${(stats.totalDeploys / Math.max(stats.latestVersion, 1)).toFixed(1)} 次发布/版本`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 建议和提示 */}
          <div className="bg-gradient-to-r from-pink-50 to-pink-50 rounded-xl border border-pink-50 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">发布建议</h3>
            <div className="space-y-2 text-sm text-gray-600">
              {parseFloat(calculateSuccessRate()) < 70 && (
                <div className="flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  <span>发布成功率较低，建议加强发布前的测试和审查流程</span>
                </div>
              )}
              {parseFloat(calculateRollbackRate()) > 20 && (
                <div className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>回滚率较高，建议优化发布流程并增加影响分析</span>
                </div>
              )}
              {stats.snapshotCount < stats.latestVersion && (
                <div className="flex items-start gap-2">
                  <span className="text-yellow-500">•</span>
                  <span>部分版本缺少快照，建议确保每次发布都创建版本快照</span>
                </div>
              )}
              {parseFloat(calculateSuccessRate()) >= 90 && parseFloat(calculateRollbackRate()) < 10 && (
                <div className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  <span>发布质量优秀，继续保持当前的发布流程和标准</span>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>请选择流程查看统计信息</p>
        </div>
      )}
    </div>
  );
};
