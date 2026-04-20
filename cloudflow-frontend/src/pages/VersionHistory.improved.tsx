/**
 * 版本历史页面（改进版）
 * 
 * 集成了统一的错误处理器，展示如何处理：
 * - 运行实例警告
 * - 权限错误
 * - 一般错误
 * 
 * @author CloudFlow
 */

import React, { useState, useEffect } from 'react';
import { Clock, GitBranch, RotateCcw, Eye, AlertTriangle, X } from 'lucide-react';
import { useWorkflowPermission } from '../hooks/useWorkflowPermission';
import { AxiosError } from 'axios';
import request from '@/services/api/request';
import {
  handleApiError,
  showSuccess,
  showWarning,
  ApiErrorResponse,
} from '@/utils/errorHandler';
import { WarningConfirmDialog } from '@/components/ui';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';

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
export const VersionHistory: React.FC<VersionHistoryProps> = ({ 
  workflowId, 
  workflowCreatorId 
}) => {
  // 权限控制
  const { isAdmin, canViewVersionHistory } = useWorkflowPermission();
  
  // 检查是否有查看权限
  const hasViewPermission = workflowCreatorId ? canViewVersionHistory(workflowCreatorId) : true;
  // 回滚权限口径与后端保持一致：流程创建者或管理员
  const canRollbackCurrentWorkflow = workflowCreatorId
    ? canViewVersionHistory(workflowCreatorId)
    : isAdmin;
  
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
  
  // 运行实例警告对话框
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningData, setWarningData] = useState<{
    message: string;
    description?: string;
  } | null>(null);
  const [pendingRollback, setPendingRollback] = useState<{
    versionId: string;
    reason: string;
  } | null>(null);

  // 如果没有查看权限，显示无权限提示
  if (!hasViewPermission) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="text-slate-400" size={24} />
          </div>
          <p className="text-sm text-slate-500">您没有权限查看此流程的版本历史</p>
        </div>
      </div>
    );
  }

  /**
   * 加载版本历史
   * 使用统一的错误处理器
   */
  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await request.get(`/workflow/versions/workflow/${workflowId}`);
      setVersions(data || []);
    } catch (error) {
      // 使用统一的错误处理器
      handleApiError(error as AxiosError<ApiErrorResponse>);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workflowId) {
      loadVersions();
    }
  }, [workflowId]);

  /**
   * 选择版本进行对比
   */
  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      } else if (prev.length < 2) {
        return [...prev, versionId];
      } else {
        showWarning('最多只能选择两个版本进行对比');
        return prev;
      }
    });
  };

  /**
   * 对比版本
   * 使用统一的错误处理器
   */
  const handleCompare = async () => {
    if (selectedVersions.length !== 2) {
      showWarning('请选择两个版本进行对比');
      return;
    }

    setComparing(true);
    try {
      const data = await request.get('/workflow/versions/compare', {
        params: {
          fromVersionId: selectedVersions[0],
          toVersionId: selectedVersions[1],
        },
      });
      
      setComparison(data);
      setShowCompareModal(true);
    } catch (error) {
      // 使用统一的错误处理器
      handleApiError(error as AxiosError<ApiErrorResponse>);
    } finally {
      setComparing(false);
    }
  };

  /**
   * 打开回滚对话框
   */
  const handleOpenRollback = (version: any) => {
    if (!canRollbackCurrentWorkflow) {
      showWarning('您没有权限执行版本回滚操作', '仅流程创建者或管理员可执行回滚');
      return;
    }
    
    setRollbackVersion(version);
    setRollbackReason('');
    setShowRollbackModal(true);
  };

  /**
   * 执行回滚
   * 使用统一的错误处理器，自动处理运行实例警告
   */
  const handleRollback = async () => {
    if (!rollbackReason.trim()) {
      showWarning('请输入回滚原因');
      return;
    }

    try {
      await request.post('/workflow/versions/rollback', {
        workflowId,
        targetVersionId: rollbackVersion.id,
        reason: rollbackReason.trim(),
      });

      showSuccess('版本回滚成功');
      setShowRollbackModal(false);
      loadVersions();
    } catch (error) {
      const axiosError = error as AxiosError<ApiErrorResponse>;
      const errorData = axiosError.response?.data;

      // 检查是否是运行实例警告
      if (errorData?.code === 'RUNNING_INSTANCES_WARNING') {
        // 保存待执行的回滚操作
        setPendingRollback({
          versionId: rollbackVersion.id,
          reason: rollbackReason.trim(),
        });

        // 显示警告确认对话框
        const affectedCount = (errorData.data?.affectedWorkflows as string[])?.length || 0;
        setWarningData({
          message: errorData.message || '该流程有正在运行的实例',
          description: `有 ${affectedCount} 个流程实例正在运行，回滚可能影响这些实例的执行`,
        });
        setShowWarningDialog(true);
      } else {
        // 其他错误使用默认处理
        handleApiError(axiosError);
      }
    }
  };

  /**
   * 确认强制回滚
   */
  const handleConfirmRollback = async () => {
    if (!pendingRollback) return;

    try {
      await request.post('/workflow/versions/rollback', {
        workflowId,
        targetVersionId: pendingRollback.versionId,
        reason: pendingRollback.reason,
        forceRollback: true, // 强制回滚标志
      });

      showSuccess('版本回滚成功');
      setShowRollbackModal(false);
      setShowWarningDialog(false);
      setPendingRollback(null);
      loadVersions();
    } catch (error) {
      // 使用统一的错误处理器
      handleApiError(error as AxiosError<ApiErrorResponse>);
    }
  };

  /**
   * 获取变更类型标签
   */
  const getChangeTypeLabel = (type: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      major: { text: '重大变更', color: 'bg-red-100 text-red-700' },
      minor: { text: '功能变更', color: 'bg-cyan-50 text-cyan-700' },
      patch: { text: '小修复', color: 'bg-green-100 text-green-700' }
    };
    return labels[type] || labels.patch;
  };

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">版本历史</h2>
        {selectedVersions.length === 2 && (
          <button
            onClick={handleCompare}
            disabled={comparing}
            className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50"
          >
            {comparing ? '对比中...' : '对比版本'}
          </button>
        )}
      </div>

      {/* 版本列表 */}
      {loading ? (
        <WorkspaceInlineState
          type="loading"
          title="正在加载版本历史..."
          className="py-12"
        />
      ) : versions.length === 0 ? (
        <WorkspaceInlineState
          icon={<GitBranch size={20} className="text-slate-400" />}
          title="暂无版本历史"
          description="当前流程还没有生成可查看的历史版本。"
          className="py-12"
        />
      ) : (
        <div className="space-y-4">
          {versions.map((version) => {
            const changeType = getChangeTypeLabel(version.changeType);
            const isSelected = selectedVersions.includes(version.id);

            return (
              <div
                key={version.id}
                className={`border rounded-lg p-4 ${
                  isSelected ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {/* 选择框 */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleVersionSelection(version.id)}
                      className="mt-1"
                    />

                    {/* 版本信息 */}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <GitBranch size={16} className="text-gray-400" />
                        <span className="font-semibold">{version.versionNumber}</span>
                        <span className={`px-2 py-0.5 text-xs rounded ${changeType.color}`}>
                          {changeType.text}
                        </span>
                        {version.isRollback && (
                          <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">
                            回滚版本
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 mb-2">{version.changeLog}</p>

                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span className="flex items-center">
                          <Clock size={12} className="mr-1" />
                          {new Date(version.createdAt).toLocaleString('zh-CN')}
                        </span>
                        <span>操作人：{version.createdBy}</span>
                      </div>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {/* 查看详情 */}}
                      className="p-2 text-gray-400 hover:text-gray-600"
                      title="查看详情"
                    >
                      <Eye size={16} />
                    </button>
                    {canRollbackCurrentWorkflow && (
                      <button
                        onClick={() => handleOpenRollback(version)}
                        className="p-2 text-gray-400 hover:text-cyan-600"
                        title="回滚到此版本"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 回滚对话框 */}
      {showRollbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold">版本回滚</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                确定要回滚到版本 <strong>{rollbackVersion?.versionNumber}</strong> 吗？
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  回滚原因 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  placeholder="请输入回滚原因"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                  rows={3}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end space-x-3">
              <button
                onClick={() => setShowRollbackModal(false)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleRollback}
                className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700"
              >
                确认回滚
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 运行实例警告对话框 */}
      {warningData && (
        <WarningConfirmDialog
          open={showWarningDialog}
          onClose={() => {
            setShowWarningDialog(false);
            setPendingRollback(null);
          }}
          title="运行实例警告"
          message={warningData.message}
          description={warningData.description}
          confirmText="强制回滚"
          requireDoubleConfirm={true}
          doubleConfirmText="我已了解风险，确认强制回滚"
          onConfirm={handleConfirmRollback}
          severity="warning"
        />
      )}

      {/* 版本对比模态框（简化版，实际应该更详细） */}
      {showCompareModal && comparison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-auto">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">版本对比</h3>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                对比结果：{comparison.addedNodes?.length || 0} 个新增节点，
                {comparison.removedNodes?.length || 0} 个删除节点，
                {comparison.modifiedNodes?.length || 0} 个修改节点
              </p>
              {/* 这里应该显示详细的对比结果 */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
