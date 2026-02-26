/**
 * 告警列表页面
 * Phase 2 新增功能 - 管理超时和异常告警
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  Filter,
  Search,
  X
} from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { 
  getTimeoutAlerts,
  getAnomalyAlerts,
  handleTimeoutAlert,
  resolveAnomalyAlert,
  TimeoutAlert,
  AnomalyAlert
} from '@/services/api/monitor';

/**
 * 告警类型标签
 */
type AlertType = 'timeout' | 'anomaly';

/**
 * 告警列表主组件
 */
const AlertList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AlertType>('timeout');
  const [timeoutAlerts, setTimeoutAlerts] = useState<TimeoutAlert[]>([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<TimeoutAlert | AnomalyAlert | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  
  // 筛选条件
  const [filters, setFilters] = useState({
    alertLevel: '',
    severity: '',
    resolved: ''
  });

  /**
   * 加载告警数据
   */
  const loadAlerts = async () => {
    try {
      setLoading(true);
      
      if (activeTab === 'timeout') {
        const params: any = { pageNum: 1, pageSize: 100 };
        if (filters.alertLevel) params.alertLevel = filters.alertLevel;
        if (filters.resolved) params.resolved = filters.resolved === 'true';
        
        const data = await getTimeoutAlerts(params);
        setTimeoutAlerts(data.rows || data.records || []);
      } else {
        const params: any = { pageNum: 1, pageSize: 100 };
        if (filters.severity) params.severity = filters.severity;
        if (filters.resolved) params.resolved = filters.resolved === 'true';
        
        const data = await getAnomalyAlerts(params);
        setAnomalyAlerts(data.rows || data.records || []);
      }
    } catch (error) {
      console.error('加载告警数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [activeTab, filters]);

  /**
   * 处理超时告警
   */
  const handleTimeout = async (alertId: number, action: string) => {
    try {
      await handleTimeoutAlert(alertId, action);
      loadAlerts();
    } catch (error) {
      console.error('处理告警失败:', error);
    }
  };

  /**
   * 解决异常告警
   */
  const handleResolve = async () => {
    if (!selectedAlert || !resolveNote.trim()) {
      return;
    }

    try {
      await resolveAnomalyAlert(selectedAlert.id, resolveNote);
      setShowResolveModal(false);
      setResolveNote('');
      setSelectedAlert(null);
      loadAlerts();
    } catch (error) {
      console.error('解决告警失败:', error);
    }
  };

  /**
   * 获取告警级别颜色
   */
  const getLevelColor = (alert: TimeoutAlert | AnomalyAlert, type: AlertType) => {
    if (type === 'timeout') {
      const timeoutAlert = alert as TimeoutAlert;
      return timeoutAlert.alertLevel === 'CRITICAL' ? 'text-red-600' : 'text-yellow-600';
    } else {
      const anomalyAlert = alert as AnomalyAlert;
      return anomalyAlert.severity === 'CRITICAL' || anomalyAlert.severity === 'HIGH' 
        ? 'text-red-600' 
        : 'text-yellow-600';
    }
  };

  /**
   * 获取告警级别标签
   */
  const getLevelBadge = (alert: TimeoutAlert | AnomalyAlert, type: AlertType) => {
    if (type === 'timeout') {
      const timeoutAlert = alert as TimeoutAlert;
      return timeoutAlert.alertLevel === 'CRITICAL' 
        ? <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">严重</span>
        : <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">警告</span>;
    } else {
      const anomalyAlert = alert as AnomalyAlert;
      const severityMap: Record<string, { bg: string; text: string; label: string }> = {
        CRITICAL: { bg: 'bg-red-100', text: 'text-red-800', label: '严重' },
        HIGH: { bg: 'bg-orange-100', text: 'text-orange-800', label: '高' },
        MEDIUM: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '中' },
        LOW: { bg: 'bg-pink-50', text: 'text-pink-700', label: '低' }
      };
      const severity = severityMap[anomalyAlert.severity] || severityMap.MEDIUM;
      return <span className={`px-2 py-1 text-xs font-medium ${severity.bg} ${severity.text} rounded`}>{severity.label}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">告警管理</h1>
        <p className="text-sm text-gray-600 mt-1">
          查看和处理超时告警和异常告警
        </p>
      </div>

      {/* 标签页 */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('timeout')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'timeout'
                  ? 'border-pink-400 text-pink-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>超时告警</span>
                <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  {timeoutAlerts.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('anomaly')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'anomaly'
                  ? 'border-pink-400 text-pink-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>异常告警</span>
                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">
                  {anomalyAlerts.length}
                </span>
              </div>
            </button>
          </nav>
        </div>

        {/* 筛选栏 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">筛选:</span>
            
            {activeTab === 'timeout' ? (
              <Select value={filters.alertLevel} onValueChange={v => setFilters({...filters, alertLevel: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">所有级别</SelectItem>
                      <SelectItem value="WARNING">警告</SelectItem>
                      <SelectItem value="CRITICAL">严重</SelectItem>
                    </SelectContent>
                  </Select>
            ) : (
              <Select value={filters.severity} onValueChange={v => setFilters({...filters, severity: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">所有严重程度</SelectItem>
                      <SelectItem value="LOW">低</SelectItem>
                      <SelectItem value="MEDIUM">中</SelectItem>
                      <SelectItem value="HIGH">高</SelectItem>
                      <SelectItem value="CRITICAL">严重</SelectItem>
                    </SelectContent>
                  </Select>
            )}
            
            <Select value={filters.resolved} onValueChange={v => setFilters({...filters, resolved: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">所有状态</SelectItem>
                      <SelectItem value="false">未处理</SelectItem>
                      <SelectItem value="true">已处理</SelectItem>
                    </SelectContent>
                  </Select>
          </div>
        </div>

        {/* 告警列表 */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
              <p className="mt-2 text-sm text-gray-600">加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeTab === 'timeout' ? (
                timeoutAlerts.length > 0 ? (
                  timeoutAlerts.map((alert) => (
                    <div key={alert.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            {getLevelBadge(alert, 'timeout')}
                            <span className="text-sm text-gray-500">
                              {alert.alertType === 'TASK' ? '任务超时' : '流程超时'}
                            </span>
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-1">
                            {alert.relatedTitle}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            已超时 <span className="font-semibold text-red-600">{alert.timeoutHours}</span> 小时
                          </p>
                          {alert.assigneeName && (
                            <p className="text-sm text-gray-500">
                              处理人: {alert.assigneeName}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            告警时间: {new Date(alert.createTime).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <div className="flex flex-col space-y-2">
                          {!alert.notificationSent && (
                            <button
                              onClick={() => handleTimeout(alert.id, 'notify')}
                              className="px-3 py-1 text-sm bg-pink-500 text-white rounded hover:bg-pink-600"
                            >
                              发送通知
                            </button>
                          )}
                          {!alert.escalated && alert.alertLevel === 'CRITICAL' && (
                            <button
                              onClick={() => handleTimeout(alert.id, 'escalate')}
                              className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700"
                            >
                              升级处理
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Clock className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>暂无超时告警</p>
                  </div>
                )
              ) : (
                anomalyAlerts.length > 0 ? (
                  anomalyAlerts.map((alert) => (
                    <div key={alert.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            {getLevelBadge(alert, 'anomaly')}
                            <span className="text-sm text-gray-500">{alert.anomalyType}</span>
                            {alert.resolved && (
                              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                已解决
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-medium text-gray-900 mb-1">
                            {alert.processName}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {alert.description}
                          </p>
                          {alert.errorDetails && (
                            <details className="text-xs text-gray-500 mb-2">
                              <summary className="cursor-pointer hover:text-gray-700">错误详情</summary>
                              <pre className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto">
                                {alert.errorDetails}
                              </pre>
                            </details>
                          )}
                          {alert.resolveNote && (
                            <p className="text-sm text-green-600 mb-2">
                              解决说明: {alert.resolveNote}
                            </p>
                          )}
                          <p className="text-xs text-gray-400">
                            告警时间: {new Date(alert.createTime).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        {!alert.resolved && (
                          <button
                            onClick={() => {
                              setSelectedAlert(alert);
                              setShowResolveModal(true);
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            标记已解决
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>暂无异常告警</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 解决告警模态框 */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">解决异常告警</h3>
              <button
                onClick={() => {
                  setShowResolveModal(false);
                  setResolveNote('');
                  setSelectedAlert(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                解决说明 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                placeholder="请输入解决方案和处理说明..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowResolveModal(false);
                  setResolveNote('');
                  setSelectedAlert(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleResolve}
                disabled={!resolveNote.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认解决
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertList;
