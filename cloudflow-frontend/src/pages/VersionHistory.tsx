import React, { useState, useEffect } from 'react';
import { Clock, GitBranch, RotateCcw, Eye, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowPermission } from '../hooks/useWorkflowPermission';

interface VersionHistoryProps {
  workflowId: string;
  workflowCreatorId?: string; // 流程创建者ID，用于权限判断
}

/**
 * 版本历史页面
 * 展示流程的版本历史，支持版本对比和回滚
 * 权限控制：
 * - 流程创建者和管理员可以查看版本历史
 * - 仅管理员可以执行版本回滚
 */
export const VersionHistory: React.FC<VersionHistoryProps> = ({ workflowId, workflowCreatorId }) => {
  // 权限控制
  const { canViewVersionHistory, canRollbackVersion } = useWorkflowPermission();
  
  // 检查是否有查看权限
  const hasViewPermission = workflowCreatorId ? canViewVersionHistory(workflowCreatorId) : true;
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  
  // 对比模态框
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [comparison, setComparison] = useState<any>(null);
  const [comparing, setComparing] = useState(false);
  
  // 回滚模态框
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState<any>(null);
  const [rollbackReason, setRollbackReason] = useState('');
  const [forceRollback, setForceRollback] = useState(false);
  const [hasRunningInstances, setHasRunningInstances] = useState(false);

  // 如果没有查看权限，显示无权限提示
  if (!hasViewPermission) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="text-slate-400" size={24} />
          </div>
          <p className="text-sm text-slate-500">您没有权限查看此流程的版本历史</p>
        </div>
      </div>
    );
  }

  // 加载版本历史
  const loadVersions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/workflow/versions/workflow/${workflowId}`);
      const result = await response.json();
      
      if (result.code === 200) {
        setVersions(result.data || []);
      } else {
        toast.error(result.msg || '加载版本历史失败');
      }
    } catch (error) {
      console.error('加载版本历史失败:', error);
      toast.error('加载版本历史失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workflowId) {
      loadVersions();
    }
  }, [workflowId]);

  // 选择版本进行对比
  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      } else if (prev.length < 2) {
        return [...prev, versionId];
      } else {
        toast.warning('最多只能选择两个版本进行对比');
        return prev;
      }
    });
  };

  // 对比版本
  const handleCompare = async () => {
    if (selectedVersions.length !== 2) {
      toast.error('请选择两个版本进行对比');
      return;
    }

    setComparing(true);
    try {
      const response = await fetch(
        `/api/workflow/versions/compare?fromVersionId=${selectedVersions[0]}&toVersionId=${selectedVersions[1]}`
      );
      const result = await response.json();
      
      if (result.code === 200) {
        setComparison(result.data);
        setShowCompareModal(true);
      } else {
        toast.error(result.msg || '版本对比失败');
      }
    } catch (error) {
      console.error('版本对比失败:', error);
      toast.error('版本对比失败');
    } finally {
      setComparing(false);
    }
  };

  // 打开回滚对话框
  const handleOpenRollback = async (version: any) => {
    setRollbackVersion(version);
    setRollbackReason('');
    setForceRollback(false);
    
    // 检查是否有运行中的实例
    try {
      const response = await fetch(`/api/workflow/versions/check-running/${workflowId}`);
      const result = await response.json();
      
      if (result.code === 200) {
        setHasRunningInstances(result.data.hasRunningInstances);
      }
    } catch (error) {
      console.error('检查运行实例失败:', error);
    }
    
    setShowRollbackModal(true);
  };

  // 执行回滚
  const handleRollback = async () => {
    if (!rollbackReason.trim()) {
      toast.error('请输入回滚原因');
      return;
    }

    if (hasRunningInstances && !forceRollback) {
      toast.error('该流程有正在运行的实例，请勾选强制回滚或等待实例完成');
      return;
    }

    try {
      const response = await fetch('/api/workflow/versions/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          targetVersionId: rollbackVersion.id,
          reason: rollbackReason.trim(),
          forceRollback
        })
      });

      const result = await response.json();
      
      if (result.code === 200) {
        toast.success('版本回滚成功');
        setShowRollbackModal(false);
        loadVersions();
      } else {
        toast.error(result.msg || '版本回滚失败');
      }
    } catch (error) {
      console.error('版本回滚失败:', error);
      toast.error('版本回滚失败');
    }
  };

  // 获取变更类型标签
  const getChangeTypeLabel = (type: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      major: { text: '重大变更', color: 'bg-red-100 text-red-700' },
      minor: { text: '功能变更', color: 'bg-blue-100 text-blue-700' },
      patch: { text: '小修复', color: 'bg-green-100 text-green-700' }
    };
    return labels[type] || labels.patch;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">版本历史</h2>
        {selectedVersions.length === 2 && (
          <button
            onClick={handleCompare}
            disabled={comparing}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {comparing ? '对比中...' : '对比选中版本'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">加载中...</div>
      ) : versions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无版本历史</div>
      ) : (
        <div className="space-y-4">
          {versions.map((version, index) => (
            <div
              key={version.id}
              className={`border rounded-lg p-4 ${
                selectedVersions.includes(version.id) ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedVersions.includes(version.id)}
                    onChange={() => toggleVersionSelection(version.id)}
                    className="mt-1"
                  />
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-lg">v{version.versionNumber}</span>
                      {index === 0 && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                          当前版本
                        </span>
                      )}
                      {version.isRollback && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" />
                          回滚版本
                        </span>
                      )}
                      <span className={`px-2 py-1 text-xs rounded ${getChangeTypeLabel(version.changeType).color}`}>
                        {getChangeTypeLabel(version.changeType).text}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">{version.changeLog}</p>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(version.createdAt).toLocaleString('zh-CN')}
                      </span>
                      <span>操作人：{version.createdByName || version.createdBy}</span>
                      {version.rollbackFromVersion && (
                        <span className="text-orange-600">
                          回滚自版本 {version.rollbackFromVersion}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 回滚按钮 - 仅管理员可见 */}
                {index !== 0 && canRollbackVersion && (
                  <button
                    onClick={() => handleOpenRollback(version)}
                    className="px-3 py-1 border rounded hover:bg-gray-50 text-sm flex items-center gap-1"
                    title="仅管理员可执行版本回滚"
                  >
                    <RotateCcw className="w-4 h-4" />
                    回滚
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 版本对比模态框 */}
      {showCompareModal && comparison && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                版本对比：v{comparison.fromVersion} → v{comparison.toVersion}
              </h2>
              <button onClick={() => setShowCompareModal(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* 新增节点 */}
              {comparison.addedNodes && comparison.addedNodes.length > 0 && (
                <div>
                  <h3 className="font-semibold text-green-700 mb-2">新增节点 ({comparison.addedNodes.length})</h3>
                  <div className="space-y-2">
                    {comparison.addedNodes.map((node: any) => (
                      <div key={node.nodeId} className="p-3 bg-green-50 border border-green-200 rounded">
                        <div className="font-medium">{node.nodeName}</div>
                        <div className="text-sm text-gray-600">类型：{node.nodeType}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 删除节点 */}
              {comparison.removedNodes && comparison.removedNodes.length > 0 && (
                <div>
                  <h3 className="font-semibold text-red-700 mb-2">删除节点 ({comparison.removedNodes.length})</h3>
                  <div className="space-y-2">
                    {comparison.removedNodes.map((node: any) => (
                      <div key={node.nodeId} className="p-3 bg-red-50 border border-red-200 rounded">
                        <div className="font-medium">{node.nodeName}</div>
                        <div className="text-sm text-gray-600">类型：{node.nodeType}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 修改节点 */}
              {comparison.modifiedNodes && comparison.modifiedNodes.length > 0 && (
                <div>
                  <h3 className="font-semibold text-blue-700 mb-2">修改节点 ({comparison.modifiedNodes.length})</h3>
                  <div className="space-y-2">
                    {comparison.modifiedNodes.map((node: any) => (
                      <div key={node.nodeId} className="p-3 bg-blue-50 border border-blue-200 rounded">
                        <div className="font-medium">{node.nodeName}</div>
                        <div className="text-sm text-gray-600">类型：{node.nodeType}</div>
                        {node.changes && node.changes.length > 0 && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium">属性变更：</div>
                            {node.changes.map((change: any, idx: number) => (
                              <div key={idx} className="ml-4 text-gray-600">
                                {change.path}: {change.oldValue} → {change.newValue}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 连接变更 */}
              {((comparison.addedEdges && comparison.addedEdges.length > 0) ||
                (comparison.removedEdges && comparison.removedEdges.length > 0)) && (
                <div>
                  <h3 className="font-semibold mb-2">连接变更</h3>
                  {comparison.addedEdges && comparison.addedEdges.length > 0 && (
                    <div className="mb-2">
                      <div className="text-sm text-green-700">新增连接：</div>
                      {comparison.addedEdges.map((edge: any, idx: number) => (
                        <div key={idx} className="ml-4 text-sm text-gray-600">
                          {edge.sourceId} → {edge.targetId}
                        </div>
                      ))}
                    </div>
                  )}
                  {comparison.removedEdges && comparison.removedEdges.length > 0 && (
                    <div>
                      <div className="text-sm text-red-700">删除连接：</div>
                      {comparison.removedEdges.map((edge: any, idx: number) => (
                        <div key={idx} className="ml-4 text-sm text-gray-600">
                          {edge.sourceId} → {edge.targetId}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 无变更 */}
              {(!comparison.addedNodes || comparison.addedNodes.length === 0) &&
               (!comparison.removedNodes || comparison.removedNodes.length === 0) &&
               (!comparison.modifiedNodes || comparison.modifiedNodes.length === 0) &&
               (!comparison.addedEdges || comparison.addedEdges.length === 0) &&
               (!comparison.removedEdges || comparison.removedEdges.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  两个版本没有差异
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 回滚确认模态框 */}
      {showRollbackModal && rollbackVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">确认回滚</h2>
              <button onClick={() => setShowRollbackModal(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <div className="font-medium mb-1">警告</div>
                    <div>回滚将恢复到版本 v{rollbackVersion.versionNumber}，当前版本的更改将被覆盖。</div>
                  </div>
                </div>
              </div>

              {hasRunningInstances && (
                <div className="p-4 bg-red-50 border border-red-200 rounded">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <div className="font-medium mb-1">运行实例警告</div>
                      <div>该流程有正在运行的实例，回滚可能影响运行中的流程。</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">回滚原因 *</label>
                <textarea
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  placeholder="请输入回滚原因"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              {hasRunningInstances && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="forceRollback"
                    checked={forceRollback}
                    onChange={(e) => setForceRollback(e.target.checked)}
                  />
                  <label htmlFor="forceRollback" className="text-sm">
                    强制回滚（即使有运行中的实例）
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowRollbackModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRollback}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                确认回滚
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
