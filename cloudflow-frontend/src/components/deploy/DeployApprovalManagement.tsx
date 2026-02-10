import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Send,
  X,
  ChevronRight,
  User,
  Users,
  Building,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DeployApproval,
  ApprovalStep,
  listPendingApprovals,
  listMySubmittedApprovals,
  getApprovalDetail,
  approveDeployRequest,
  cancelDeployApproval,
} from '@/services/api/deployEnhancement';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: '待审批', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APPROVED: { label: '已通过', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  REJECTED: { label: '已驳回', color: 'bg-red-100 text-red-700', icon: XCircle },
  CANCELLED: { label: '已取消', color: 'bg-gray-100 text-gray-600', icon: X },
};

const APPROVER_TYPE_ICONS: Record<string, React.ElementType> = {
  USER: User,
  ROLE: Users,
  DEPT: Building,
};

export const DeployApprovalManagement: React.FC = () => {
  const [activeView, setActiveView] = useState<'pending' | 'submitted'>('pending');
  const [pendingApprovals, setPendingApprovals] = useState<DeployApproval[]>([]);
  const [submittedApprovals, setSubmittedApprovals] = useState<DeployApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<{
    approval: DeployApproval;
    steps: ApprovalStep[];
    processName?: string;
  } | null>(null);
  const [approveModal, setApproveModal] = useState<{
    approvalId: number;
    stepId: number;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    loadData();
  }, [activeView]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeView === 'pending') {
        const data = await listPendingApprovals();
        setPendingApprovals(Array.isArray(data) ? data : []);
      } else {
        const data = await listMySubmittedApprovals();
        setSubmittedApprovals(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      toast.error('加载审批数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (approval: DeployApproval) => {
    try {
      const detail = await getApprovalDetail(approval.id) as any;
      setDetailModal({
        approval: detail.approval || approval,
        steps: Array.isArray(detail.steps) ? detail.steps : [],
        processName: detail.processName,
      });
    } catch (error) {
      toast.error('加载审批详情失败');
      console.error(error);
    }
  };

  const handleApprove = async () => {
    if (!approveModal) return;

    try {
      await approveDeployRequest(
        approveModal.approvalId,
        approveModal.stepId,
        approveModal.action,
        comment || undefined
      );
      toast.success(approveModal.action === 'APPROVE' ? '审批通过' : '已驳回');
      setApproveModal(null);
      setComment('');
      loadData();
    } catch (error) {
      toast.error('操作失败');
      console.error(error);
    }
  };

  const handleCancel = async (approvalId: number) => {
    if (!confirm('确定要取消此审批吗？')) return;

    try {
      await cancelDeployApproval(approvalId);
      toast.success('已取消');
      loadData();
    } catch (error) {
      toast.error('取消失败');
      console.error(error);
    }
  };

  const renderStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const approvals = activeView === 'pending' ? pendingApprovals : submittedApprovals;

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">发布审批管理</h2>
          <p className="text-sm text-gray-500 mt-1">管理流程发布的审批请求</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 视图切换 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveView('pending')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeView === 'pending'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          待我审批
          {pendingApprovals.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs bg-red-500 text-white rounded-full">
              {pendingApprovals.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveView('submitted')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeView === 'submitted'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          我的提交
        </button>
      </div>

      {/* 审批列表 */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{activeView === 'pending' ? '暂无待审批项' : '暂无提交记录'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map(approval => (
            <div
              key={approval.id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-gray-800">
                      流程: {approval.processDefId}
                    </span>
                    {renderStatusBadge(approval.approvalStatus)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>步骤: {approval.currentStep}/{approval.totalSteps}</span>
                    <span>提交时间: {approval.submitTime}</span>
                    {approval.completeTime && (
                      <span>完成时间: {approval.completeTime}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewDetail(approval)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    详情
                  </button>

                  {activeView === 'pending' && approval.approvalStatus === 'PENDING' && (
                    <>
                      <button
                        onClick={() =>
                          setApproveModal({
                            approvalId: approval.id,
                            stepId: approval.currentStep,
                            action: 'APPROVE',
                          })
                        }
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 bg-green-50 rounded hover:bg-green-100 transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        通过
                      </button>
                      <button
                        onClick={() =>
                          setApproveModal({
                            approvalId: approval.id,
                            stepId: approval.currentStep,
                            action: 'REJECT',
                          })
                        }
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        驳回
                      </button>
                    </>
                  )}

                  {activeView === 'submitted' && approval.approvalStatus === 'PENDING' && (
                    <button
                      onClick={() => handleCancel(approval.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      取消
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 审批详情模态框 */}
      {detailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800">审批详情</h3>
                <button
                  onClick={() => setDetailModal(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 基本信息 */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">流程定义:</span>
                    <span className="ml-2 font-medium">{detailModal.processName || detailModal.approval.processDefId}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">状态:</span>
                    <span className="ml-2">{renderStatusBadge(detailModal.approval.approvalStatus)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">提交时间:</span>
                    <span className="ml-2">{detailModal.approval.submitTime}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">进度:</span>
                    <span className="ml-2 font-medium">{detailModal.approval.currentStep}/{detailModal.approval.totalSteps}</span>
                  </div>
                </div>
              </div>

              {/* 审批步骤 */}
              <h4 className="font-medium text-gray-700 mb-3">审批步骤</h4>
              <div className="space-y-3">
                {detailModal.steps.map((step, index) => {
                  const TypeIcon = APPROVER_TYPE_ICONS[step.approverType] || User;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        step.stepStatus === 'APPROVED'
                          ? 'border-green-200 bg-green-50'
                          : step.stepStatus === 'REJECTED'
                          ? 'border-red-200 bg-red-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {step.stepStatus === 'APPROVED' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : step.stepStatus === 'REJECTED' ? (
                          <XCircle className="w-5 h-5 text-red-500" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-800">
                            步骤 {step.stepNo}: {step.stepName}
                          </span>
                          {renderStatusBadge(step.stepStatus)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <TypeIcon className="w-3.5 h-3.5" />
                          <span>审批模式: {step.approvalMode === 'ANY' ? '任一人' : step.approvalMode === 'ALL' ? '所有人' : '依次'}</span>
                        </div>
                        {step.approvalComment && (
                          <div className="flex items-start gap-1 mt-2 text-sm text-gray-600">
                            <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>{step.approvalComment}</span>
                          </div>
                        )}
                        {step.approvalTime && (
                          <div className="text-xs text-gray-400 mt-1">
                            审批时间: {step.approvalTime}
                          </div>
                        )}
                      </div>
                      {index < detailModal.steps.length - 1 && (
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => setDetailModal(null)}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 审批操作模态框 */}
      {approveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {approveModal.action === 'APPROVE' ? '确认通过' : '确认驳回'}
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  审批意见
                  {approveModal.action === 'REJECT' && <span className="text-red-500"> *</span>}
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={approveModal.action === 'APPROVE' ? '同意（可选）' : '请填写驳回原因'}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setApproveModal(null);
                    setComment('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleApprove}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors ${
                    approveModal.action === 'APPROVE'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" />
                    {approveModal.action === 'APPROVE' ? '确认通过' : '确认驳回'}
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
