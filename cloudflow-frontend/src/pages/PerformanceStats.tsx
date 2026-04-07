/**
 * 性能统计页面
 * Phase 2 新增功能 - 流程性能统计和分析
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp,
  Calendar,
  Download,
  Filter
} from 'lucide-react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableHead, TableHeader } from '@/components/ui';
import { 
  getPerformanceStats,
  PerformanceStats as PerformanceStatsType
} from '@/services/api/monitor';
import { toast } from 'sonner';
import { downloadBlob } from '@/utils/download';

/**
 * 性能统计主组件
 */
const PerformanceStats: React.FC = () => {
  const [stats, setStats] = useState<PerformanceStatsType[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [selectedProcess, setSelectedProcess] = useState('');

  /**
   * 加载性能统计数据
   */
  const loadStats = async () => {
    try {
      setLoading(true);
      const params: any = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      };
      if (selectedProcess) {
        params.processDefKey = selectedProcess;
      }
      
      const data = await getPerformanceStats(params);
      setStats(data);
    } catch (error) {
      console.error('加载性能统计失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [dateRange, selectedProcess]);

  /**
   * 格式化时长
   */
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  /**
   * 导出统计数据
   */
  const exportStats = () => {
    const csv = [
      ['日期', '流程类型', '总数', '完成数', '平均时长', '最大时长', '最小时长', '成功率', '超时率', '异常率'].join(','),
      ...stats.map(stat => [
        stat.statDate,
        stat.processName,
        stat.totalCount,
        stat.completedCount,
        formatDuration(stat.avgDurationMs),
        formatDuration(stat.maxDurationMs),
        formatDuration(stat.minDurationMs),
        `${stat.successRate.toFixed(1)}%`,
        `${stat.timeoutRate.toFixed(1)}%`,
        `${stat.anomalyRate.toFixed(1)}%`
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const fileName = downloadBlob(blob, `performance_stats_${dateRange.startDate}_${dateRange.endDate}.csv`);

    toast.success(
      stats.length > 0
        ? `已导出 ${stats.length} 条性能统计，下载文件：${fileName}`
        : `已导出空结果，下载文件：${fileName}`,
    );
  };

  /**
   * 获取唯一的流程类型列表
   */
  const processTypes = Array.from(new Set(stats.map(s => s.processDefKey)));

  /**
   * 计算汇总统计
   */
  const summary = stats.reduce((acc, stat) => {
    acc.totalCount += stat.totalCount;
    acc.completedCount += stat.completedCount;
    acc.avgDuration += stat.avgDurationMs * stat.totalCount;
    acc.successRate += stat.successRate * stat.totalCount;
    acc.timeoutRate += stat.timeoutRate * stat.totalCount;
    acc.anomalyRate += stat.anomalyRate * stat.totalCount;
    return acc;
  }, {
    totalCount: 0,
    completedCount: 0,
    avgDuration: 0,
    successRate: 0,
    timeoutRate: 0,
    anomalyRate: 0
  });

  if (summary.totalCount > 0) {
    summary.avgDuration /= summary.totalCount;
    summary.successRate /= summary.totalCount;
    summary.timeoutRate /= summary.totalCount;
    summary.anomalyRate /= summary.totalCount;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">性能统计</h1>
        <p className="text-sm text-gray-600 mt-1">
          查看流程执行性能统计和趋势分析
        </p>
      </div>

      {/* 筛选和导出栏 */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">时间范围:</span>
          </div>
          
          <DatePicker
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
          />
          
          <span className="text-gray-500">至</span>
          
          <DatePicker
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
          />

          <div className="flex items-center space-x-2 ml-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <Select value={selectedProcess} onValueChange={v => setSelectedProcess(v)}>
              <SelectTrigger>
                <SelectValue placeholder="所有流程类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">所有流程类型</SelectItem>
                {processTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={exportStats}
            disabled={stats.length === 0}
            className="ml-auto flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>导出CSV</span>
          </button>
        </div>
      </div>

      {/* 汇总统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">总流程数</span>
            <BarChart3 className="w-5 h-5 text-pink-500" />
          </div>
          <p className="text-3xl font-bold text-pink-500">{summary.totalCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            完成 {summary.completedCount} 个
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">平均完成时间</span>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-3xl font-bold text-purple-600">
            {formatDuration(summary.avgDuration)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">成功率</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-600">
            {summary.successRate.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">超时率</span>
            <TrendingUp className="w-5 h-5 text-yellow-600" />
          </div>
          <p className="text-3xl font-bold text-yellow-600">
            {summary.timeoutRate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* 详细统计表格 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">详细统计</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
              <p className="mt-2 text-sm text-gray-600">加载中...</p>
            </div>
          ) : stats.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <TableHeader>
                <tr>
                  <TableHead className="px-6 py-3 text-left">
                    日期
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left">
                    流程类型
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    总数
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    完成数
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    平均时长
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    最大时长
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    最小时长
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    成功率
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    超时率
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right">
                    异常率
                  </TableHead>
                </tr>
              </TableHeader>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.map((stat, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {stat.statDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {stat.processName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-pink-500 font-medium">
                      {stat.totalCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                      {stat.completedCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatDuration(stat.avgDurationMs)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                      {formatDuration(stat.maxDurationMs)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                      {formatDuration(stat.minDurationMs)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${
                        stat.successRate >= 95 ? 'text-green-600' :
                        stat.successRate >= 80 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {stat.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${
                        stat.timeoutRate <= 5 ? 'text-green-600' :
                        stat.timeoutRate <= 20 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {stat.timeoutRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={`font-medium ${
                        stat.anomalyRate <= 5 ? 'text-green-600' :
                        stat.anomalyRate <= 20 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {stat.anomalyRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>暂无统计数据</p>
              <p className="text-sm mt-2">请选择不同的时间范围或流程类型</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformanceStats;
