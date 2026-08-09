import React, { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, LoadingSpinner } from '@/components/common';
import { cn } from '@/utils/cn';
import {
  dictDataApi,
  type DictChangeApprovalDetail,
  type DictChangeApprovalSummary,
  type DictChangeResult,
} from '@/services/api/dict';

interface DictApprovalDialogProps {
  open: boolean;
  dictType?: string;
  dictName?: string;
  pendingResult?: DictChangeResult | null;
  initialApprovalId?: number | null;
  onClose: () => void;
}

const getApprovalStatusBadgeClassName = (status: string) => {
  switch (status) {
    case 'APPROVED':
      return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200';
    case 'REJECTED':
      return 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/20 dark:text-rose-200';
    case 'IN_PROGRESS':
      return 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-200';
    default:
      return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200';
  }
};

const getApprovalStatusLabel = (status: string) => {
  switch (status) {
    case 'APPROVED':
      return '已通过';
    case 'REJECTED':
      return '已驳回';
    case 'IN_PROGRESS':
      return '审批中';
    default:
      return '待提交';
  }
};

const getApprovalActionLabel = (actionType?: string) => {
  switch (actionType) {
    case 'ADD':
      return '新增';
    case 'UPDATE':
      return '修改';
    case 'DELETE':
      return '删除';
    default:
      return actionType || '-';
  }
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPayload = (payload: unknown, payloadJson?: string) => {
  if (payload != null) {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }
  return payloadJson?.trim() || '';
};

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
  className?: string;
}> = ({ title, description, loading = false, className }) => (
  <div className={cn('flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center', className)}>
    {loading ? <LoadingSpinner size="lg" className="mb-3" /> : <Eye className="mb-3 h-5 w-5 text-cf-faint" />}
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
    ) : null}
  </div>
);

export const DictApprovalDialog: React.FC<DictApprovalDialogProps> = ({
  open,
  dictType,
  dictName,
  pendingResult,
  initialApprovalId,
  onClose,
}) => {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [approvalList, setApprovalList] = useState<DictChangeApprovalSummary[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<number | null>(initialApprovalId ?? null);
  const [approvalDetail, setApprovalDetail] = useState<DictChangeApprovalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedSummary = useMemo(
    () => approvalList.find((item) => item.approvalId === selectedApprovalId) ?? null,
    [approvalList, selectedApprovalId],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedApprovalId(initialApprovalId ?? null);
  }, [open, initialApprovalId, refreshNonce]);

  useEffect(() => {
    if (!open || !dictType) {
      setApprovalList([]);
      setApprovalError(null);
      return;
    }

    let active = true;
    setApprovalLoading(true);
    setApprovalError(null);
    void dictDataApi.approvalList(dictType)
      .then((response) => {
        if (!active) {
          return;
        }
        const nextApprovals = Array.isArray(response) ? response : [];
        setApprovalList(nextApprovals);
        setSelectedApprovalId((current) => {
          if (initialApprovalId && nextApprovals.some((item) => item.approvalId === initialApprovalId)) {
            return initialApprovalId;
          }
          if (current && nextApprovals.some((item) => item.approvalId === current)) {
            return current;
          }
          return nextApprovals[0]?.approvalId ?? null;
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.error('获取字典审批记录失败:', error);
        setApprovalError('获取字典审批记录失败，请稍后重试');
        setApprovalList([]);
        setSelectedApprovalId(null);
      })
      .finally(() => {
        if (active) {
          setApprovalLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dictType, initialApprovalId, open, refreshNonce]);

  useEffect(() => {
    if (!open || !selectedApprovalId) {
      setApprovalDetail(null);
      setDetailError(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    void dictDataApi.approvalDetail(selectedApprovalId)
      .then((response) => {
        if (active) {
          setApprovalDetail(response || null);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        console.error('获取字典审批详情失败:', error);
        setApprovalDetail(null);
        setDetailError('获取字典审批详情失败，请稍后重试');
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, selectedApprovalId, refreshNonce]);

  const handleRefresh = () => {
    setRefreshNonce((current) => current + 1);
  };

  return (
    <BaseDialog
      open={open}
      title={dictName ? `${dictName} 审批记录` : '字典审批记录'}
      onClose={onClose}
      maxWidthClassName="max-w-6xl"
      footer={(
        <>
          <Button variant="outline" onClick={handleRefresh} disabled={!dictType || approvalLoading || detailLoading}>
            <RefreshCw size={15} className={cn((approvalLoading || detailLoading) && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </>
      )}
    >
      {!dictType ? (
        <InlineState title="请先选择字典类型" />
      ) : (
        <div className="admin-dialog-stack">
          {pendingResult?.approvalRequired ? (
            <div className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
              已提交审批单 {pendingResult.approvalNo || '-'}，可在此查看审批状态。
            </div>
          ) : null}

          <div className="admin-dialog-stack">
            <div className="card admin-source-panel no-padding overflow-hidden">
              <div className="p-4 admin-source-section-head text-sm font-medium text-cf-title">
                审批单列表
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {approvalLoading ? (
                  <InlineState title="正在加载审批记录..." loading className="min-h-[180px]" />
                ) : approvalError ? (
                  <InlineState title="审批记录加载失败" description={approvalError} className="min-h-[180px]" />
                ) : approvalList.length === 0 ? (
                  <InlineState title="暂无审批记录" className="min-h-[180px]" />
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {approvalList.map((item) => {
                      const isSelected = item.approvalId === selectedApprovalId;
                      return (
                        <button
                          key={item.approvalId}
                          type="button"
                          onClick={() => setSelectedApprovalId(item.approvalId)}
                          className={cn(
                            'cf-side-link flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors',
                            isSelected ? 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/70' : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/50',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium text-cf-title">{item.approvalNo}</div>
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 text-xs font-medium',
                                getApprovalStatusBadgeClassName(item.status || 'PENDING'),
                              )}
                            >
                              {getApprovalStatusLabel(item.status || 'PENDING')}
                            </span>
                          </div>
                          <div className="text-xs text-cf-subtle">
                            {getApprovalActionLabel(item.actionType)} · {item.targetSummary || item.dictType}
                          </div>
                          <div className="text-xs text-cf-faint">{formatDateTime(item.createTime)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="card admin-source-panel no-padding overflow-hidden">
              <div className="p-4 admin-source-section-head text-sm font-medium text-cf-title">
                审批单详情
              </div>
              {detailLoading ? (
                <InlineState title="正在加载审批详情..." loading />
              ) : detailError ? (
                <InlineState title="审批详情加载失败" description={detailError} />
              ) : !selectedApprovalId ? (
                <InlineState title="请选择审批单" />
              ) : !approvalDetail ? (
                <InlineState title={selectedSummary ? `未找到审批单 ${selectedSummary.approvalNo}` : '审批单不存在'} />
              ) : (
                <div className="admin-dialog-stack max-h-[560px] overflow-y-auto p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-medium',
                        getApprovalStatusBadgeClassName(approvalDetail.status || 'PENDING'),
                      )}
                    >
                      {getApprovalStatusLabel(approvalDetail.status || 'PENDING')}
                    </span>
                    <span className="badge badge-gray">
                      {getApprovalActionLabel(approvalDetail.actionType)}
                    </span>
                    <span className="badge badge-gray">
                      {approvalDetail.riskLevel || 'LOW'}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoCard label="审批单号" value={approvalDetail.approvalNo || '-'} />
                    <InfoCard label="字典类型" value={approvalDetail.dictType || '-'} mono />
                    <InfoCard label="申请人" value={approvalDetail.applicantName || '-'} />
                    <InfoCard label="申请部门" value={approvalDetail.deptName || '-'} />
                    <InfoCard label="创建时间" value={formatDateTime(approvalDetail.createTime)} />
                    <InfoCard label="流程实例" value={approvalDetail.instanceId || '-'} />
                  </div>

                  <Block title="目标摘要" value={approvalDetail.targetSummary || '-'} />
                  <Block title="审批意见" value={approvalDetail.approvalComment || '-'} />
                  <Block title="备注" value={approvalDetail.remark || '-'} />

                  <div className="px-3 py-3">
                    <div className="text-xs text-cf-faint">载荷概览</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <div className="bg-[var(--cf-surface-muted)] px-3 py-2 text-sm text-cf-body dark:bg-slate-900">
                        旧数据 {approvalDetail.payload?.oldDictDataList?.length || 0} 条
                      </div>
                      <div className="bg-[var(--cf-surface-muted)] px-3 py-2 text-sm text-cf-body dark:bg-slate-900">
                        新数据 {approvalDetail.payload?.newDictDataList?.length || 0} 条
                      </div>
                    </div>
                  </div>

                  <div className="px-3 py-3">
                    <div className="text-xs text-cf-faint">载荷 JSON</div>
                    <pre className="mt-2 overflow-x-auto bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                      {formatPayload(approvalDetail.payload, approvalDetail.payloadJson)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </BaseDialog>
  );
};

const InfoCard: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
}> = ({ label, value, mono = false }) => (
  <div className="px-3 py-2">
    <div className="text-xs text-cf-faint">{label}</div>
    <div className={cn('mt-1 text-sm text-cf-title', mono && 'font-mono')}>{value}</div>
  </div>
);

const Block: React.FC<{
  title: string;
  value: string;
}> = ({ title, value }) => (
  <div className="px-3 py-3">
    <div className="text-xs text-cf-faint">{title}</div>
    <div className="mt-1 text-sm text-cf-title">{value}</div>
  </div>
);

export default DictApprovalDialog;
