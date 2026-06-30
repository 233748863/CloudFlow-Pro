import React, { useEffect, useMemo, useState } from 'react';
import {
  Building,
  CheckCircle,
  Clock3,
  Eye,
  MessageSquare,
  RefreshCw,
  Send,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog } from '@/components/common';
import { Button, SegmentedControl, SegmentedControlItem, Textarea } from '@/components/common';
import { InnerTableSurface } from '@/components/layout';
import { cn } from '@/utils/cn';
import { useDict } from '@/hooks/useDict';
import {
  ApprovalStep,
  DeployApproval,
  approveDeployRequest,
  cancelDeployApproval,
  getApprovalDetail,
  listMySubmittedApprovals,
  listPendingApprovals,
} from '@/services/api/deployEnhancement';

const STATUS_CONFIG: Record<
  string,
  {
    className: string;
    icon: React.ElementType;
  }
> = {
  PENDING: {
    className:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    icon: Clock3,
  },
  APPROVED: {
    className:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
    icon: CheckCircle,
  },
  REJECTED: {
    className:
      'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    icon: XCircle,
  },
  CANCELLED: {
    className:
      'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: X,
  },
};

const APPROVER_TYPE_ICONS: Record<string, React.ElementType> = {
  USER: User,
  ROLE: Users,
  DEPT: Building,
};

const getStatusMeta = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 max-w-md text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

export const DeployApprovalManagement: React.FC = () => {
  const statusDict = useDict('oa_deploy_approval_status');
  const approverTypeDict = useDict('oa_approver_type');
  const approvalModeDict = useDict('oa_approval_mode');
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
  const [cancelTarget, setCancelTarget] = useState<DeployApproval | null>(null);

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
      toast.error(getErrorMessage(error, '加载审批数据失败'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeView]);

  const approvals = activeView === 'pending' ? pendingApprovals : submittedApprovals;

  const summary = useMemo(() => {
    const completedCount = submittedApprovals.filter((item) => item.approvalStatus === 'APPROVED').length;
    const rejectedCount = submittedApprovals.filter((item) => item.approvalStatus === 'REJECTED').length;

    return {
      pendingCount: pendingApprovals.length,
      submittedCount: submittedApprovals.length,
      completedCount,
      rejectedCount,
    };
  }, [pendingApprovals, submittedApprovals]);

  const handleViewDetail = async (approval: DeployApproval) => {
    try {
      const detail = await getApprovalDetail(approval.id);
      setDetailModal({
        approval: detail.approval || approval,
        steps: Array.isArray(detail.steps) ? detail.steps : [],
        processName: detail.processName || detail.processKey,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, '加载审批详情失败'));
      console.error(error);
    }
  };

  const handleApprove = async () => {
    if (!approveModal) {
      return;
    }

    try {
      await approveDeployRequest(
        approveModal.approvalId,
        approveModal.stepId,
        approveModal.action,
        comment || undefined,
      );
      toast.success(approveModal.action === 'APPROVE' ? '审批已通过' : '审批已驳回');
      setApproveModal(null);
      setComment('');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审批操作失败'));
      console.error(error);
    }
  };

  const handleCancel = async (approval: DeployApproval | null) => {
    if (!approval) {
      return;
    }

    try {
      await cancelDeployApproval(approval.id);
      toast.success('审批已取消');
      setCancelTarget(null);
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消审批失败'));
      console.error(error);
    }
  };

  return (
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-toolbar-filter-grid admin-deploy-toolbar-grid [--admin-toolbar-filter-count:1]">
          <div className="admin-toolbar-field admin-deploy-toolbar-switch">
            <SegmentedControl className="min-h-9">
              {[
                { key: 'pending', label: '待我审批', count: pendingApprovals.length },
                { key: 'submitted', label: '我的提交', count: submittedApprovals.length },
              ].map((item) => (
                <SegmentedControlItem
                  key={item.key}
                  size="sm"
                  active={activeView === item.key}
                  count={item.count}
                  onClick={() => setActiveView(item.key as 'pending' | 'submitted')}
                >
                  {item.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>

          <div className="admin-users-toolbar-actions">
            <span className="badge badge-gray">待我审批 {summary.pendingCount}</span>
            <span className="badge badge-gray">我的提交 {summary.submittedCount}</span>
            <span className="badge badge-gray">已通过 {summary.completedCount}</span>
            <Button variant="outline" size="sm" onClick={() => void loadData()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>
      </section>

      {loading ? (
        <InnerTableSurface className="min-h-[28rem]" wrapperClassName="flex min-h-[28rem] flex-col">
        <InlineState
          title="正在同步审批列表..."
          description="请稍候，系统正在读取发布审批状态。"
          loading
        />
        </InnerTableSurface>
      ) : approvals.length === 0 ? (
        <InnerTableSurface className="min-h-[28rem]" wrapperClassName="flex min-h-[28rem] flex-col">
        <InlineState
          icon={<CheckCircle className="h-5 w-5" />}
          title={activeView === 'pending' ? '当前没有待审批项目' : '还没有提交记录'}
          description={
            activeView === 'pending'
              ? '当前没有新的发布审批压到你这里，系统会在有新记录时自动进入待处理队列。'
              : '你还没有发起过发布审批，后续提交后会在这里追踪状态。'
          }
        />
        </InnerTableSurface>
      ) : (
        <InnerTableSurface className="min-h-[28rem]">
          <table className="unity-data-table admin-source-table min-w-[980px]">
            <thead>
              <tr>
                <th>审批单</th>
                <th>状态与进度</th>
                <th>时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) => {
                const statusMeta = getStatusMeta(approval.approvalStatus);
                const StatusIcon = statusMeta.icon;
                const progressPercent =
                  approval.totalSteps > 0
                    ? Math.min((approval.currentStep / approval.totalSteps) * 100, 100)
                    : 0;

                return (
                  <tr key={approval.id}>
                    <td className="align-top">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {activeView === 'pending' ? '待处理审批' : '已提交审批'} · {approval.processDefId}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">#{approval.id}</span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {approval.deployId ? `部署 ID ${approval.deployId}` : '未绑定部署 ID'}
                          <span className="mx-2 text-slate-300 dark:text-slate-700">/</span>
                          申请人 ID {approval.submitterId}
                        </div>
                      </div>
                    </td>
                    <td className="align-top">
                      <div className="min-w-[160px]">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold',
                            statusMeta.className,
                          )}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {statusDict.getLabel(approval.approvalStatus)}
                        </span>
                        <div className="mt-2">
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-500">
                            <span>步骤进度</span>
                            <span>
                              {approval.currentStep} / {approval.totalSteps}
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-md bg-[var(--cf-surface-muted)] dark:bg-slate-900">
                            <div
                              className="h-full rounded-md bg-cyan-500 transition-all duration-300 dark:bg-cyan-400"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="align-top text-sm text-slate-600 dark:text-slate-300">
                      <div>提交时间 · {approval.submitTime}</div>
                      <div className="mt-1">完成时间 · {approval.completeTime || '处理中'}</div>
                    </td>
                    <td className="align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => void handleViewDetail(approval)}>
                          <Eye className="h-4 w-4" />
                          查看详情
                        </Button>

                        {activeView === 'pending' && approval.approvalStatus === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              className="bg-emerald-600 shadow-none hover:bg-emerald-700"
                              onClick={() =>
                                setApproveModal({
                                  approvalId: approval.id,
                                  stepId: approval.currentStep,
                                  action: 'APPROVE',
                                })
                              }
                            >
                              <CheckCircle className="h-4 w-4" />
                              通过
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setApproveModal({
                                  approvalId: approval.id,
                                  stepId: approval.currentStep,
                                  action: 'REJECT',
                                })
                              }
                            >
                              <XCircle className="h-4 w-4" />
                              驳回
                            </Button>
                          </>
                        ) : null}

                        {activeView === 'submitted' && approval.approvalStatus === 'PENDING' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-200"
                            onClick={() => setCancelTarget(approval)}
                          >
                            <X className="h-4 w-4" />
                            取消审批
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </InnerTableSurface>
      )}

      <BaseDialog
        open={Boolean(detailModal)}
        title="审批详情"
        description="查看审批单基础信息和完整步骤流转记录。"
        onClose={() => setDetailModal(null)}
        maxWidthClassName="max-w-5xl"
      >
        {detailModal ? (
          <div className="admin-dialog-stack max-h-[72vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <span className="badge badge-gray">流程 · {detailModal.processName || detailModal.approval.processDefId}</span>
              <span className="badge badge-gray">状态 · {statusDict.getLabel(detailModal.approval.approvalStatus)}</span>
              <span className="badge badge-gray">进度 · {detailModal.approval.currentStep}/{detailModal.approval.totalSteps}</span>
              <span className="badge badge-gray">提交时间 · {detailModal.approval.submitTime}</span>
            </div>

            <InnerTableSurface wrapperClassName="p-0">
              <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">审批步骤</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  按顺序展示每个审批节点的状态、审批模式和处理意见。
                </div>
              </div>

              <div className="p-4">
                {detailModal.steps.length === 0 ? (
                  <InlineState
                    icon={<Clock3 className="h-5 w-5" />}
                    title="暂未返回审批步骤"
                    description="当前审批单还没有明细步骤，或后端尚未返回步骤配置。"
                  />
                ) : (
                  <div className="grid gap-3">
                    {detailModal.steps.map((step) => {
                      const statusMeta = getStatusMeta(step.stepStatus);
                      const StatusIcon = statusMeta.icon;
                      const ApproverIcon = APPROVER_TYPE_ICONS[step.approverType] || User;

                      return (
                        <div
                          key={step.id}
                          className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-4 dark:border-slate-800 dark:bg-slate-950"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="grid gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                                  步骤 {step.stepNo} · {step.stepName}
                                </div>
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold',
                                    statusMeta.className,
                                  )}
                                >
                                  <StatusIcon className="h-3.5 w-3.5" />
                                  {statusDict.getLabel(step.stepStatus)}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <ApproverIcon className="h-3.5 w-3.5" />
                                  {approverTypeDict.getLabel(step.approverType)}
                                </span>
                                <span>审批模式：{approvalModeDict.getLabel(step.approvalMode)}</span>
                                <span>审批 ID：{step.id}</span>
                              </div>
                            </div>

                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {step.approvalTime ? `处理时间：${step.approvalTime}` : '尚未处理'}
                            </div>
                          </div>

                          {step.approvalComment ? (
                            <div className="mt-4 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                              <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                <MessageSquare className="h-3.5 w-3.5" />
                                审批意见
                              </div>
                              <div>{step.approvalComment}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </InnerTableSurface>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(approveModal)}
        title={approveModal?.action === 'APPROVE' ? '确认通过审批' : '确认驳回审批'}
        description="可补充审批意见，帮助后续回看审批结论。"
        onClose={() => {
          setApproveModal(null);
          setComment('');
        }}
        maxWidthClassName="max-w-xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setApproveModal(null);
                setComment('');
              }}
            >
              取消
            </Button>
            <Button
              variant={approveModal?.action === 'APPROVE' ? 'default' : 'destructive'}
              onClick={handleApprove}
            >
              <Send className="h-4 w-4" />
              {approveModal?.action === 'APPROVE' ? '确认通过' : '确认驳回'}
            </Button>
          </div>
        }
      >
        {approveModal ? (
          <div className="admin-dialog-stack">
            <div
              className={cn(
                'rounded-md border px-4 py-3 text-sm leading-6',
                approveModal.action === 'APPROVE'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
              )}
            >
              {approveModal.action === 'APPROVE'
                ? '审批通过后，发布单会继续流转到下一审批节点或直接进入执行。'
                : '驳回后建议补充原因，方便申请人快速修改并重新提交。'}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                审批意见
                {approveModal.action === 'REJECT' ? (
                  <span className="text-rose-500">（建议填写）</span>
                ) : null}
              </label>
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={4}
                placeholder={
                  approveModal.action === 'APPROVE'
                    ? '例如：部署窗口、审批材料和回滚方案均已确认。'
                    : '例如：回滚预案不完整，请补充风险说明后重新提交。'
                }
              />
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="确认取消审批"
        message={
          cancelTarget
            ? `取消后，这条发布审批单 #${cancelTarget.id} 将结束流转，需要重新提交后才能再次进入审批。`
            : '取消后需要重新发起审批。'
        }
        confirmText="取消审批"
        cancelText="继续保留"
        danger
        onConfirm={() => void handleCancel(cancelTarget)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
};
