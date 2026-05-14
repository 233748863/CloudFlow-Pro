import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarClock, CheckCircle2, Clock3, Eye, FileWarning, RotateCcw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatCard, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import FileUpload from '@/components/FileUpload';
import { contractApi, OaRiskAlert } from '@/services/api/contractRisk';
import { borrowManagementApi, BorrowManagementStats, licenseBorrowApi, OaHandoverLog, OaLicenseBorrow, OaReminderLog, OaSealApplication, sealApplicationApi } from '@/services/api/sealLicense';
import { useAuth } from '@/context/AuthContext';
import { PageResult } from '@/types';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

type Kind = 'SEAL' | 'LICENSE';

interface UnifiedBorrow {
  kind: Kind;
  id: number;
  no?: string;
  resourceName?: string;
  applicantName?: string;
  purpose?: string;
  expectedReturnTime?: string;
  actualBorrowTime?: string;
  status?: string;
  contractId?: number;
  contractNo?: string;
}

const STATUS_LABELS: Record<string, string> = {
  APPROVED: '待借出',
  BORROWED: '已借出',
  OVERDUE: '已逾期',
  RETURNED: '已归还',
};

const normalizeRows = <T,>(result: PageResult<T>) => result.rows || result.records || [];

const toSealBorrow = (item: OaSealApplication): UnifiedBorrow => ({
  kind: 'SEAL',
  id: item.id!,
  no: item.applicationNo,
  resourceName: item.sealName,
  applicantName: item.userName,
  purpose: item.purpose,
  expectedReturnTime: item.expectedReturnTime,
  actualBorrowTime: item.actualBorrowTime,
  status: item.status,
  contractId: item.contractId,
  contractNo: item.contractNo,
});

const toLicenseBorrow = (item: OaLicenseBorrow): UnifiedBorrow => ({
  kind: 'LICENSE',
  id: item.id!,
  no: item.borrowNo,
  resourceName: item.licenseName,
  applicantName: item.userName,
  purpose: item.purpose,
  expectedReturnTime: item.expectedReturnTime,
  actualBorrowTime: item.actualBorrowTime,
  status: item.status,
});

const getStatusBadge = (status?: string) => {
  const toneMap: Record<string, string> = {
    APPROVED: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    BORROWED: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
    OVERDUE: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    RETURNED: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'APPROVED'] || toneMap.APPROVED}`}>
      {STATUS_LABELS[status || ''] || status || '-'}
    </span>
  );
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          <Clock3 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const metricCardClassName = 'items-center gap-3 rounded-lg p-4';
const metricIconClassName = 'h-9 w-9 rounded-lg';
const metricValueClassName = 'text-xl leading-6';
const metricMetaClassName = 'mt-0.5 truncate text-xs';

export const BorrowManagementPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<UnifiedBorrow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, kind: 'ALL', status: 'APPROVED' });
  const [actionTarget, setActionTarget] = useState<UnifiedBorrow | null>(null);
  const [actionType, setActionType] = useState<'borrow' | 'return' | 'remind'>('borrow');
  const [remark, setRemark] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [stats, setStats] = useState<BorrowManagementStats | null>(null);
  const [detailTarget, setDetailTarget] = useState<UnifiedBorrow | null>(null);
  const [handoverLogs, setHandoverLogs] = useState<OaHandoverLog[]>([]);
  const [reminderLogs, setReminderLogs] = useState<OaReminderLog[]>([]);
  const [riskLogs, setRiskLogs] = useState<OaRiskAlert[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const nextRows: UnifiedBorrow[] = [];
      let nextTotal = 0;

      if (query.kind === 'ALL' || query.kind === 'SEAL') {
        const sealResult = await sealApplicationApi.list({ pageNum: query.pageNum, pageSize: query.pageSize, status: query.status });
        nextRows.push(...normalizeRows(sealResult).map(toSealBorrow));
        nextTotal += sealResult.total || 0;
      }
      if (query.kind === 'ALL' || query.kind === 'LICENSE') {
        const licenseResult = await licenseBorrowApi.list({ pageNum: query.pageNum, pageSize: query.pageSize, status: query.status });
        nextRows.push(...normalizeRows(licenseResult).map(toLicenseBorrow));
        nextTotal += licenseResult.total || 0;
      }

      setRows(nextRows.sort((a, b) => String(b.expectedReturnTime || '').localeCompare(String(a.expectedReturnTime || ''))));
      setTotal(nextTotal);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取借还记录失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchStats = useCallback(async () => {
    try {
      const [summary, statsResult] = await Promise.all([
        borrowManagementApi.summary(),
        borrowManagementApi.stats(),
      ]);
      setStats({
        ...statsResult,
        pendingBorrowCount: summary.pendingBorrowCount,
        overdueCount: summary.overdueCount,
        expiringLicenseCount: summary.expiringLicenseCount,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, '获取借还统计失败'));
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const openAction = (target: UnifiedBorrow, type: 'borrow' | 'return' | 'remind') => {
    setActionTarget(target);
    setActionType(type);
    setRemark('');
    setAttachmentUrl('');
  };

  const openDetail = async (target: UnifiedBorrow) => {
    setDetailTarget(target);
    setRiskLogs([]);
    setDetailLoading(true);
    try {
      const api = target.kind === 'SEAL' ? sealApplicationApi : licenseBorrowApi;
      const [handoverResult, reminderResult, riskResult] = await Promise.all([
        api.handoverLogs(target.id),
        api.reminderLogs(target.id),
        target.contractId ? contractApi.risks(target.contractId) : Promise.resolve([]),
      ]);
      setHandoverLogs(handoverResult);
      setReminderLogs(reminderResult);
      setRiskLogs(riskResult);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取借还详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const actionTitle = useMemo(() => {
    if (actionType === 'borrow') return '确认借出';
    if (actionType === 'return') return '确认归还';
    return '发送催还';
  }, [actionType]);

  const submitAction = async () => {
    if (!actionTarget) return;
    try {
      const api = actionTarget.kind === 'SEAL' ? sealApplicationApi : licenseBorrowApi;
      if (actionType === 'borrow') {
        await api.confirmBorrow(actionTarget.id, remark, attachmentUrl);
      } else if (actionType === 'return') {
        await api.confirmReturn(actionTarget.id, remark, attachmentUrl);
      } else {
        await api.remind(actionTarget.id, remark);
      }
      toast.success(`${actionTitle}成功`);
      setActionTarget(null);
      setAttachmentUrl('');
      await fetchRows();
      await fetchStats();
    } catch (error) {
      toast.error(getErrorMessage(error, `${actionTitle}失败`));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const maxTrend = Math.max(...(stats?.trend || []).map((item) => item.sealCount + item.licenseCount), 1);
  const maxUsage = Math.max(...(stats?.resourceUsage || []).map((item) => item.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard title="行政待处理" value={stats?.pendingBorrowCount ?? 0} icon={<CheckCircle2 size={18} />} iconVariant="primary" meta="审批通过待借出" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
        <StatCard title="借出中" value={stats?.borrowedCount ?? 0} icon={<Clock3 size={18} />} iconVariant="success" meta="印章和证照合计" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
        <StatCard title="逾期未还" value={stats?.overdueCount ?? 0} icon={<FileWarning size={18} />} iconVariant="danger" meta="需催还处理" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
        <StatCard title="证照到期" value={stats?.expiringLicenseCount ?? 0} icon={<CalendarClock size={18} />} iconVariant="warning" meta="30 天内到期" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
        <StatCard title="合同未用印" value={stats?.contractUnsealedRiskCount ?? 0} icon={<FileWarning size={18} />} iconVariant="warning" meta="审批通过超过3天" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
        <StatCard title="逾期归还风险" value={stats?.overdueReturnRiskCount ?? 0} icon={<Bell size={18} />} iconVariant="danger" meta="合同关联用印" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
        <StatCard title="未归档风险" value={stats?.unarchivedRiskCount ?? 0} icon={<Clock3 size={18} />} iconVariant="primary" meta="已用印未归档附件" className={metricCardClassName} iconClassName={metricIconClassName} valueClassName={metricValueClassName} metaClassName={metricMetaClassName} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            <TrendingUp className="h-4 w-4 text-cyan-600" />
            借还趋势
          </div>
          <div className="flex h-28 items-end gap-2">
            {(stats?.trend || []).map((item) => {
              const totalCount = item.sealCount + item.licenseCount;
              const height = Math.max(8, Math.round((totalCount / maxTrend) * 80));
              return (
                <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-20 w-full items-end justify-center rounded-lg bg-slate-50 px-1 dark:bg-slate-900">
                    <div className="w-full max-w-8 rounded-t-md bg-cyan-500" style={{ height }} title={`${item.date} ${totalCount} 次`} />
                  </div>
                  <span className="w-full truncate text-center text-[11px] text-slate-400">{item.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="mb-2.5 text-sm font-medium text-slate-900 dark:text-slate-100">资源使用排行</div>
          <div className="space-y-2.5">
            {(stats?.resourceUsage || []).slice(0, 5).map((item) => (
              <div key={`${item.businessType}-${item.resourceId}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-slate-600 dark:text-slate-300">{item.resourceName || '-'}</span>
                  <span className="text-slate-400">{item.count} 次</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(8, (item.count / maxUsage) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!stats?.resourceUsage?.length ? <div className="py-8 text-center text-sm text-slate-400">暂无排行数据</div> : null}
          </div>
        </div>
      </div>

      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[160px]">
                <Select value={query.kind} onValueChange={(kind) => setQuery((prev) => ({ ...prev, pageNum: 1, kind }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="业务类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部类型</SelectItem>
                    <SelectItem value="SEAL">用印</SelectItem>
                    <SelectItem value="LICENSE">证照</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[160px]">
                <Select value={query.status} onValueChange={(status) => setQuery((prev) => ({ ...prev, pageNum: 1, status }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPROVED">待借出</SelectItem>
                    <SelectItem value="BORROWED">已借出</SelectItem>
                    <SelectItem value="OVERDUE">已逾期</SelectItem>
                    <SelectItem value="RETURNED">已归还</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>第 {query.pageNum} / {totalPages} 页</span>
                <span>共 {total} 条</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: 10, kind: 'ALL', status: 'APPROVED' })}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <TableHeader className="sticky top-0 z-10">
                  <tr>
                    <TableHead className="px-4 py-3 text-left">类型 / 编号</TableHead>
                    <TableHead className="px-4 py-3 text-left">资源</TableHead>
                    <TableHead className="px-4 py-3 text-left">申请人</TableHead>
                    <TableHead className="px-4 py-3 text-left">用途</TableHead>
                    <TableHead className="px-4 py-3 text-left">借出 / 归还</TableHead>
                    <TableHead className="px-4 py-3 text-left">状态</TableHead>
                    <TableActionHead className="w-40 px-4 py-3 text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载借还记录..." loading />
                  ) : rows.length === 0 ? (
                    <TableStateRow colSpan={7} title="暂无借还记录" />
                  ) : rows.map((item) => (
                    <tr key={`${item.kind}-${item.id}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.kind === 'SEAL' ? '用印' : '证照'}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.no || '-'}</div>
                        {item.contractNo ? <div className="mt-1 text-xs text-cyan-600 dark:text-cyan-300">{item.contractNo}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{item.resourceName || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.applicantName || '-'}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{item.purpose || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div>{formatDateTimeDisplay(item.actualBorrowTime)}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.expectedReturnTime)}</div>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { label: '详情', icon: <Eye size={14} />, onClick: () => void openDetail(item), tone: 'neutral' },
                            { label: '借出', icon: <CheckCircle2 size={14} />, onClick: () => openAction(item, 'borrow'), tone: 'success', hidden: item.status !== 'APPROVED', permissionKey: 'admin:borrow:confirm' },
                            { label: '归还', icon: <RotateCcw size={14} />, onClick: () => openAction(item, 'return'), tone: 'success', hidden: item.status !== 'BORROWED' && item.status !== 'OVERDUE', permissionKey: 'admin:borrow:return' },
                            { label: '催还', icon: <Bell size={14} />, onClick: () => openAction(item, 'remind'), tone: 'warning', hidden: item.status !== 'BORROWED' && item.status !== 'OVERDUE', permissionKey: 'admin:borrow:remind' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} showPageSizeSelector={false} showJump={false} onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))} onPageSizeChange={() => {}} />
        ) : null}
      />

      <BaseDialog
        open={Boolean(actionTarget)}
        title={actionTitle}
        onClose={() => setActionTarget(null)}
        width="normal"
        footer={(
          <>
            <Button variant="outline" onClick={() => setActionTarget(null)}>取消</Button>
            <Button onClick={() => void submitAction()} disabled={!hasPermission(actionType === 'borrow' ? 'admin:borrow:confirm' : actionType === 'return' ? 'admin:borrow:return' : 'admin:borrow:remind')}>{actionTitle}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            <div className="font-medium text-slate-900 dark:text-slate-100">{actionTarget?.resourceName || '-'}</div>
            <div className="mt-1 text-xs text-slate-400">{actionTarget?.applicantName || '-'} / {actionTarget?.no || '-'}</div>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea className="min-h-[110px] resize-none" value={remark} onChange={(event) => setRemark(event.target.value)} />
          </div>
          {actionType !== 'remind' ? (
            <div className="space-y-2">
              <Label>交接附件</Label>
              <FileUpload value={attachmentUrl} onChange={setAttachmentUrl} maxCount={5} />
            </div>
          ) : null}
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailTarget)}
        title={detailTarget?.no || '借还详情'}
        onClose={() => setDetailTarget(null)}
        width="wide"
        headerAside={detailTarget ? getStatusBadge(detailTarget.status) : null}
        footer={<Button variant="outline" onClick={() => setDetailTarget(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载借还详情...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">交接日志</div>
              {handoverLogs.length ? (
                <div className="space-y-3">
                  {handoverLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{log.actionType === 'BORROW' ? '借出' : '归还'}</span>
                        <span className="text-xs text-slate-400">{formatDateTimeDisplay(log.actionTime)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{log.operatorName || '-'} / {log.remark || '-'}</div>
                      {getAttachmentList(log.attachmentUrl).length ? <div className="mt-3"><AttachmentLinks value={log.attachmentUrl} compact /></div> : null}
                    </div>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-sm text-slate-400">暂无交接日志</div>}
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">催还记录</div>
              {reminderLogs.length ? (
                <div className="space-y-3">
                  {reminderLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-100 px-3 py-3 text-sm dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{log.reminderType === 'AUTO' ? '自动催还' : '手动催还'}</span>
                        <span className="text-xs text-slate-400">{formatDateTimeDisplay(log.reminderTime)}</span>
                      </div>
                      <div className="mt-1 text-slate-600 dark:text-slate-300">{log.reminderContent || '-'}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-sm text-slate-400">暂无催还记录</div>}
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">关联风险</div>
              {riskLogs.length ? (
                <div className="space-y-3">
                  {riskLogs.map((risk) => (
                    <div key={risk.id} className="rounded-lg border border-slate-100 px-3 py-3 text-sm dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{risk.riskName}</span>
                        <span className="text-xs text-slate-400">{risk.riskLevel} / {risk.riskStatus}</span>
                      </div>
                      <div className="mt-1 text-slate-600 dark:text-slate-300">{risk.handleRemark || risk.riskCode || '-'}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-sm text-slate-400">暂无关联风险</div>}
            </div>
          </div>
        )}
      </BaseDialog>
    </div>
  );
};

export default BorrowManagementPage;

