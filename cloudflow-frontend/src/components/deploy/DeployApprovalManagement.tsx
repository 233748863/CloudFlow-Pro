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
import { Button, Textarea } from '@/components/ui';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
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
    className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    icon: Clock3,
  },
  APPROVED: {
    label: '已通过',
    className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    icon: CheckCircle,
  },
  REJECTED: {
    label: '已驳回',
    className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    icon: XCircle,
  },
  CANCELLED: {
    label: '已取消',
    className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
    icon: X,
  },
};

const APPROVER_TYPE_ICONS: Record<string, React.ElementType> = {
  USER: User,
  ROLE: Users,
  DEPT: Building,
};

const APPROVAL_MODE_LABELS: Record<ApprovalStep['approvalMode'], string> = {
  ANY: '任一人',
  ALL: '所有人',
  SEQUENCE: '依次审批',
};

const getStatusMeta = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;

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

  useEffect(() => {
    loadData();
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
      toast.error('加载审批详情失败');
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
      toast.error('审批操作失败');
      console.error(error);
    }
  };

  const handleCancel = async (approvalId: number) => {
    if (!confirm('确定取消这条发布审批吗？')) {
      return;
    }

    try {
      await cancelDeployApproval(approvalId);
      toast.success('审批已取消');
      await loadData();
    } catch (error) {
      toast.error('取消审批失败');
      console.error(error);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-4">
        <WorkspaceMetricCard
          label="待我审批"
          value={summary.pendingCount}
          hint="当前需要我处理的发布审批"
          aside={<ShieldCheck className="h-[18px] w-[18px] text-cyan-700" />}
        />
        <WorkspaceMetricCard
          label="我的提交"
          value={summary.submittedCount}
          hint="我发起过的全部发布审批单"
          aside={<Send className="h-[18px] w-[18px] text-sky-500" />}
        />
        <WorkspaceMetricCard
          label="已通过"
          value={summary.completedCount}
          hint="已完成并通过的发布审批"
          aside={<CheckCircle className="h-[18px] w-[18px] text-emerald-500" />}
        />
        <WorkspaceMetricCard
          label="被驳回"
          value={summary.rejectedCount}
          hint="需要重新提交或补充说明的审批"
          aside={<XCircle className="h-[18px] w-[18px] text-amber-500" />}
        />
      </div>

      <WorkspaceSectionCard
        title="审批列表"
        description="统一查看待处理审批与我提交的审批记录，所有审批动作都在这里完成闭环。"
        eyebrow="Approval Queue"
        headerAside={
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
            {[
              { key: 'pending', label: '待我审批', count: pendingApprovals.length },
              { key: 'submitted', label: '我的提交', count: submittedApprovals.length },
            ].map((item) => {
              const active = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveView(item.key as 'pending' | 'submitted')}
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-cyan-700',
                  )}
                >
                  {item.label}
                  {item.count > 0 ? ` (${item.count})` : ''}
                </button>
              );
            })}
          </div>

          {loading ? (
            <WorkspaceInlineState
              type="loading"
              title="正在同步审批列表..."
              description="请稍候，系统正在读取发布审批状态。"
              className="py-16"
            />
          ) : approvals.length === 0 ? (
            <WorkspaceInlineState
              icon={<CheckCircle className="h-5 w-5" />}
              title={activeView === 'pending' ? '当前没有待审批项目' : '还没有提交记录'}
              description={
                activeView === 'pending'
                  ? '当前没有新的发布审批压到你这里，系统会在有新记录时自动进入待处理队列。'
                  : '你还没有发起过发布审批，后续提交后会在这里追踪状态。'
              }
              className="py-16"
            />
          ) : (
            <div className="space-y-4">
              {approvals.map((approval) => {
                const statusMeta = getStatusMeta(approval.approvalStatus);
                const StatusIcon = statusMeta.icon;

                return (
                  <div
                    key={approval.id}
                    className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900">
                            流程定义：{approval.processDefId}
                          </span>
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

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>审批单号：#{approval.id}</span>
                          {approval.deployId ? <span>部署 ID：{approval.deployId}</span> : null}
                          <span>
                            当前步骤：{approval.currentStep} / {approval.totalSteps}
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">提交时间</div>
                            <div className="mt-1 font-medium">{approval.submitTime}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">完成时间</div>
                            <div className="mt-1 font-medium">{approval.completeTime || '处理中'}</div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            <div className="text-xs text-slate-400">申请人 ID</div>
                            <div className="mt-1 font-medium">{approval.submitterId}</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewDetail(approval)}>
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
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(approval.id)}>
                            <X className="h-4 w-4" />
                            取消审批
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </WorkspaceSectionCard>

      {detailModal ? (
        <WorkspaceDialogShell
          title="审批详情"
          description="查看审批单基础信息和完整步骤流转记录。"
          onClose={() => setDetailModal(null)}
          maxWidthClassName="max-w-4xl"
          bodyClassName="max-h-[82vh] overflow-y-auto"
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <WorkspaceMetricCard
                label="流程"
                value={detailModal.processName || detailModal.approval.processDefId}
                hint="当前审批绑定的流程定义"
              />
              <WorkspaceMetricCard
                label="审批状态"
                value={getStatusMeta(detailModal.approval.approvalStatus).label}
                hint="审批单当前总体状态"
              />
              <WorkspaceMetricCard
                label="当前进度"
                value={`${detailModal.approval.currentStep}/${detailModal.approval.totalSteps}`}
                hint="已经推进到的审批步骤"
              />
              <WorkspaceMetricCard
                label="提交时间"
                value={detailModal.approval.submitTime}
                hint="审批单创建时间"
              />
            </div>

            <WorkspaceSectionCard
              title="审批步骤"
              description="按顺序展示每个审批节点的状态、审批模式和处理意见。"
              bodyClassName="space-y-3"
            >
              {detailModal.steps.length === 0 ? (
                <WorkspaceInlineState
                  icon={<Clock3 className="h-5 w-5" />}
                  title="暂未返回审批步骤"
                  description="当前审批单还没有明细步骤，或后端尚未返回步骤配置。"
                  className="py-14"
                />
              ) : (
                detailModal.steps.map((step) => {
                  const statusMeta = getStatusMeta(step.stepStatus);
                  const StatusIcon = statusMeta.icon;
                  const ApproverIcon = APPROVER_TYPE_ICONS[step.approverType] || User;

                  return (
                    <div
                      key={step.id}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-900">
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

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <ApproverIcon className="h-3.5 w-3.5" />
                              审批对象：{step.approverType}
                            </span>
                            <span>审批模式：{APPROVAL_MODE_LABELS[step.approvalMode]}</span>
                            <span>审批 ID：{step.id}</span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-400">
                          {step.approvalTime ? `处理时间：${step.approvalTime}` : '尚未处理'}
                        </div>
                      </div>

                      {step.approvalComment ? (
                          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          <div className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                            <MessageSquare className="h-3.5 w-3.5" />
                            审批意见
                          </div>
                          <div>{step.approvalComment}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </WorkspaceSectionCard>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      {approveModal ? (
        <WorkspaceDialogShell
          title={approveModal.action === 'APPROVE' ? '确认通过审批' : '确认驳回审批'}
          description="可补充审批意见，帮助后续回看审批结论。"
          onClose={() => {
            setApproveModal(null);
            setComment('');
          }}
          maxWidthClassName="max-w-xl"
        >
          <div className="space-y-5">
            <div
              className={cn(
                'rounded-2xl border px-4 py-4 text-sm',
                approveModal.action === 'APPROVE'
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : 'border-rose-100 bg-rose-50 text-rose-700',
              )}
            >
              {approveModal.action === 'APPROVE'
                ? '审批通过后，发布单会继续流转到下一审批节点或直接进入执行。'
                : '驳回后建议补充原因，方便申请人快速修改并重新提交。'}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                审批意见
                {approveModal.action === 'REJECT' ? <span className="text-rose-500">（建议填写）</span> : null}
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
                variant={approveModal.action === 'APPROVE' ? 'default' : 'destructive'}
                onClick={handleApprove}
              >
                {approveModal.action === 'APPROVE' ? (
                  <>
                    <Send className="h-4 w-4" />
                    确认通过
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    确认驳回
                  </>
                )}
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};
