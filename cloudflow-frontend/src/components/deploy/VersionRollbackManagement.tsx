import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  VersionSnapshot,
  RollbackHistory,
  ImpactAnalysis,
  listRollbackVersions,
  listRollbackHistory,
  getVersionSnapshot,
  rollbackDeploy,
  analyzeDeployImpact,
} from '@/services/api/deployEnhancement';
import { getProcessDefinitions } from '@/services/api/workflow';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';

const IMPACT_LEVEL_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  LOW: { label: '低', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  MEDIUM: { label: '中', color: 'text-yellow-600 bg-yellow-50', icon: AlertTriangle },
  HIGH: { label: '高', color: 'text-orange-600 bg-orange-50', icon: AlertTriangle },
  CRITICAL: { label: '严重', color: 'text-red-600 bg-red-50', icon: XCircle },
};

const ROLLBACK_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  SUCCESS: { label: '成功', color: 'text-green-600 bg-green-50' },
  FAILED: { label: '失败', color: 'text-red-600 bg-red-50' },
  PARTIAL: { label: '部分成功', color: 'text-yellow-600 bg-yellow-50' },
};

/**
 * 将 JSON 字符串格式化展示，解析失败时回退原始文本，避免弹窗崩溃。
 */
const formatJsonSafely = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export const VersionRollbackManagement: React.FC = () => {
  const [activeView, setActiveView] = useState<'versions' | 'history'>('versions');
  const [processes, setProcesses] = useState<any[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [history, setHistory] = useState<RollbackHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [snapshotModal, setSnapshotModal] = useState<VersionSnapshot | null>(null);
  const [rollbackModal, setRollbackModal] = useState<{
    version: VersionSnapshot;
    impact?: ImpactAnalysis;
  } | null>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [forceRollback, setForceRollback] = useState(false);

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    if (selectedProcess) {
      if (activeView === 'versions') {
        loadVersions();
      } else {
        loadHistory();
      }
    }
  }, [selectedProcess, activeView]);

  const loadProcesses = async () => {
    try {
      const data = await getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false });
      const list = Array.isArray(data) ? data : [];
      setProcesses(list);
      if (list.length > 0) {
        const first = list[0] as any;
        setSelectedProcess(first.id || first.definitionId || first.processKey || '');
      }
    } catch (error) {
      toast.error('加载流程列表失败');
      console.error(error);
    }
  };

  const loadVersions = async () => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      const data = await listRollbackVersions(selectedProcess);
      setVersions(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('加载版本列表失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!selectedProcess) return;
    try {
      setLoading(true);
      const data = await listRollbackHistory(selectedProcess);
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('加载回滚历史失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSnapshot = async (version: VersionSnapshot) => {
    try {
      const data: any = await getVersionSnapshot(version.processDefId, version.version);
      setSnapshotModal(data as VersionSnapshot);
    } catch (error) {
      toast.error('加载快照详情失败');
      console.error(error);
    }
  };

  const handlePrepareRollback = async (version: VersionSnapshot) => {
    try {
      const impact: any = await analyzeDeployImpact(version.processDefId);
      setRollbackModal({ version, impact: impact as ImpactAnalysis });
    } catch (error) {
      toast.error('分析影响失败');
      console.error(error);
    }
  };

  const handleRollback = async () => {
    if (!rollbackModal || !rollbackReason.trim()) {
      toast.error('请填写回滚原因');
      return;
    }

    try {
      await rollbackDeploy({
        deployId: rollbackModal.version.deployId,
        targetVersion: rollbackModal.version.version,
        rollbackReason,
        forceRollback,
      });
      toast.success('回滚成功');
      setRollbackModal(null);
      setRollbackReason('');
      setForceRollback(false);
      loadVersions();
      loadHistory();
    } catch (error) {
      toast.error('回滚失败');
      console.error(error);
    }
  };

  const renderImpactBadge = (level: string) => {
    const config = IMPACT_LEVEL_CONFIG[level] || IMPACT_LEVEL_CONFIG.LOW;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">版本回滚管理</h2>
          <p className="text-sm text-gray-500 mt-1">查看版本历史并执行回滚操作</p>
        </div>
        <button
          onClick={() => (activeView === 'versions' ? loadVersions() : loadHistory())}
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
                        <SelectItem key={String(p.id || p.definitionId || p.processKey)} value={String(p.id || p.definitionId || p.processKey)}>{p.name || p.processName || p.processKey}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
      </div>

      {/* 视图切换 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveView('versions')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeView === 'versions'
              ? 'bg-white text-pink-500 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          版本列表
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeView === 'history'
              ? 'bg-white text-pink-500 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          回滚历史
        </button>
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
        </div>
      ) : activeView === 'versions' ? (
        <div className="space-y-3">
          {versions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无版本快照</p>
            </div>
          ) : (
            versions.map(version => (
              <div
                key={version.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-gray-800">版本 {version.version}</span>
                      <span className="text-sm text-gray-500">
                        发布ID: {version.deployId}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {version.createdTime}
                      </span>
                      <span>创建人: {version.createdBy}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewSnapshot(version)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      查看
                    </button>
                    <button
                      onClick={() => handlePrepareRollback(version)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-pink-500 bg-pink-50 rounded hover:bg-pink-50 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      回滚
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无回滚历史</p>
            </div>
          ) : (
            history.map(record => (
              <div
                key={record.id}
                className="bg-white rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-gray-800">
                        版本 {record.fromVersion} → {record.toVersion}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          ROLLBACK_STATUS_CONFIG[record.rollbackStatus]?.color || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {ROLLBACK_STATUS_CONFIG[record.rollbackStatus]?.label || record.rollbackStatus}
                      </span>
                      <span className="text-xs text-gray-500">
                        {record.rollbackType === 'MANUAL' ? '手动' : '自动'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      原因: {record.rollbackReason}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {record.rollbackTime}
                      </span>
                      <span>操作人: {record.rollbackBy}</span>
                    </div>
                    {record.errorMessage && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                        {record.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 快照详情模态框 */}
      {snapshotModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800">
                  版本快照 - v{snapshotModal.version}
                </h3>
                <button
                  onClick={() => setSnapshotModal(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-700 mb-2">基本信息</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">流程定义ID:</span>
                      <span className="ml-2">{snapshotModal.processDefId}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">版本号:</span>
                      <span className="ml-2 font-medium">{snapshotModal.version}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">发布ID:</span>
                      <span className="ml-2">{snapshotModal.deployId}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">创建时间:</span>
                      <span className="ml-2">{snapshotModal.createdTime}</span>
                    </div>
                  </div>
                </div>

                {snapshotModal.bpmnXml && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">BPMN XML</h4>
                    <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-x-auto max-h-60">
                      {snapshotModal.bpmnXml}
                    </pre>
                  </div>
                )}

                {snapshotModal.formConfig && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">表单配置</h4>
                    <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-x-auto max-h-60">
                      {formatJsonSafely(snapshotModal.formConfig)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => setSnapshotModal(null)}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 回滚确认模态框 */}
      {rollbackModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                确认回滚到版本 {rollbackModal.version.version}
              </h3>

              {/* 影响分析 */}
              {rollbackModal.impact && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-medium text-gray-700">影响分析</h4>
                    {renderImpactBadge(rollbackModal.impact.overallLevel)}
                  </div>
                  <div className="space-y-2">
                    {rollbackModal.impact.impacts.map((impact, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">
                            {impact.impactType}
                          </span>
                          {renderImpactBadge(impact.impactLevel)}
                        </div>
                        <div className="text-sm text-gray-600">
                          影响数量: {impact.impactCount}
                        </div>
                        {impact.suggestion && (
                          <div className="text-sm text-pink-500 mt-1">
                            建议: {impact.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {!rollbackModal.impact.allowDeploy && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-600">
                        <div className="font-medium mb-1">警告</div>
                        <div>当前影响级别较高，建议谨慎操作。如需强制回滚，请勾选下方选项。</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 回滚原因 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  回滚原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rollbackReason}
                  onChange={e => setRollbackReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent"
                  placeholder="请详细说明回滚原因..."
                />
              </div>

              {/* 强制回滚选项 */}
              {rollbackModal.impact && !rollbackModal.impact.allowDeploy && (
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="forceRollback"
                    checked={forceRollback}
                    onChange={e => setForceRollback(e.target.checked)}
                    className="w-4 h-4 text-pink-500 border-gray-300 rounded focus:ring-pink-400"
                  />
                  <label htmlFor="forceRollback" className="text-sm text-gray-700">
                    我了解风险，强制执行回滚
                  </label>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setRollbackModal(null);
                    setRollbackReason('');
                    setForceRollback(false);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleRollback}
                  disabled={
                    !rollbackReason.trim() ||
                    (rollbackModal.impact && !rollbackModal.impact.allowDeploy && !forceRollback)
                  }
                  className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center justify-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    确认回滚
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
