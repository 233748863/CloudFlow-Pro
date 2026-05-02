import React, { useEffect, useMemo, useState } from 'react';
import {
  Building,
  CheckCircle,
  Clock3,
  Eye,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog } from '@/components/common';
import { Button, SegmentedControl, SegmentedControlItem, Textarea } from '@/components/common';
import { cn } from '@/utils/cn';
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
    label: string;
    className: string;
    icon: React.ElementType;
  }
> = {
  PENDING: {
    label: '待审批',
    className:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200',
    icon: Clock3,
  },
  APPROVED: {
    label: '已通过',
    className:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200',
    icon: CheckCircle,
  },
  REJECTED: {
    label: '已驳回',
    className:
      'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    icon: XCircle,
  },
  CANCELLED: {
    label: '已取消',
    className:
      'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: X,
  },
};

const APPROVER_TYPE_ICONS: Record<string, React.ElementType> = {
  USER: User,
  ROLE: Users,
  DEPT: Building,
};

const APPROVER_TYPE_LABELS: Record<string, string> = {
  USER: '指定成员',
  ROLE: '角色审批',
  DEPT: '部门审批',
};

const APPROVAL_MODE_LABELS: Record<ApprovalStep['approvalMode'], string> = {
  ANY: '任一人',
  ALL: '所有人',
  SEQUENCE: '依次审批',
};

const getStatusMeta = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;

const PanelCard: React.FC<{
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, aside, children }) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
      {aside ? <div className="flex items-center gap-2">{aside}</div> : null}
    </div>
    {children}
  </section>
);

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
        {icon}
      </div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
    </div>
    <div className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
  </div>
);

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? (
      <RefreshCw className="mb-3 h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
    ) : icon ? (
      <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>
    ) : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

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

  const activeViewSummary = useMemo(() => {
    if (activeView === 'pending') {
      return '当前视图聚焦需要立即处理的发布审批，优先帮助审批人快速完成闭环。';
    }

    return '当前视图展示我发起的审批记录，用于跟踪发布申请是否通过、驳回或已取消。';
  }, [activeView]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            待我审批 {summary.pendingCount}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            我的提交 {summary.submittedCount}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            已通过 {summary.completedCount}
          </span>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {loading ? (
        <InlineState
          title="正在同步审批列表..."
          description="请稍候，系统正在读取发布审批状态。"
          loading
        />
      ) : approvals.length === 0 ? (
        <InlineState
          icon={<CheckCircle className="h-5 w-5" />}
          title={activeView === 'pending' ? '当前没有待审批项目' : '还没有提交记录'}
          description={
            activeView === 'pending'
              ? '当前没有新的发布审批压到你这里，系统会在有新记录时自动进入待处理队列。'
              : '你还没有发起过发布审批，后续提交后会在这里追踪状态。'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="hidden bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 dark:bg-slate-900/70 dark:text-slate-400 lg:grid lg:grid-cols-[minmax(0,1.2fr)_180px_220px_220px] lg:items-center">
            <span>审批单</span>
            <span>状态与进度</span>
            <span>时间</span>
            <span>操作</span>
          </div>

          {approvals.map((approval) => {
            const statusMeta = getStatusMeta(approval.approvalStatus);
            const StatusIcon = statusMeta.icon;
            const progressPercent =
              approval.totalSteps > 0
                ? Math.min((approval.currentStep / approval.totalSteps) * 100, 100)
                : 0;

            return (
              <div
                key={approval.id}
                className="grid gap-4 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-slate-800 lg:grid-cols-[minmax(0,1.2fr)_180px_220px_220px] lg:items-center"
              >
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

                <div className="min-w-0">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      statusMeta.className,
                    )}
                  >
                    <StatusIcon className="h-3.5 w-3.5" />
                    {statusMeta.label}
                  </span>
                  <div className="mt-2">
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-400 dark:text-slate-500">
                      <span>步骤进度</span>
                      <span>
                        {approval.currentStep} / {approval.totalSteps}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all duration-300 dark:bg-cyan-400"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
                  <div>提交时间 · {approval.submitTime}</div>
                  <div className="mt-1">完成时间 · {approval.completeTime || '处理中'}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
              </div>
            );
          })}
        </div>
      )}

      <BaseDialog
        open={Boolean(detailModal)}
        title="审批详情"
        description="查看审批单基础信息和完整步骤流转记录。"
        onClose={() => setDetailModal(null)}
        maxWidthClassName="max-w-5xl"
      >
        {detailModal ? (
          <div className="max-h-[72vh] space-y-5 overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                流程 · {detailModal.processName || detailModal.approval.processDefId}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                状态 · {getStatusMeta(detailModal.approval.approvalStatus).label}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                进度 · {detailModal.approval.currentStep}/{detailModal.approval.totalSteps}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                提交时间 · {detailModal.approval.submitTime}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
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
                  <div className="space-y-3">
                    {detailModal.steps.map((step) => {
                      const statusMeta = getStatusMeta(step.stepStatus);
                      const StatusIcon = statusMeta.icon;
                      const ApproverIcon = APPROVER_TYPE_ICONS[step.approverType] || User;

                      return (
                        <div
                          key={step.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                                  步骤 {step.stepNo} · {step.stepName}
                                </div>
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                    statusMeta.className,
                                  )}
                                >
                                  <StatusIcon className="h-3.5 w-3.5" />
                                  {statusMeta.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <ApproverIcon className="h-3.5 w-3.5" />
                                  {APPROVER_TYPE_LABELS[step.approverType] || step.approverType}
                                </span>
                                <span>审批模式：{APPROVAL_MODE_LABELS[step.approvalMode]}</span>
                                <span>审批 ID：{step.id}</span>
                              </div>
                            </div>

                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {step.approvalTime ? `处理时间：${step.approvalTime}` : '尚未处理'}
                            </div>
                          </div>

                          {step.approvalComment ? (
                            <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
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
            </div>
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
          <div className="space-y-5">
            <div
              className={cn(
                'rounded-2xl border px-4 py-4 text-sm leading-6',
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
