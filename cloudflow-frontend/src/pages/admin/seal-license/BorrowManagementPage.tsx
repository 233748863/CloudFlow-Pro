import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Bell, CalendarClock, CheckCircle2, Clock3, Eye, FileWarning, RefreshCw, RotateCcw, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import AttachmentLinks, { getAttachmentList } from '@/components/AttachmentLinks';
import FileUpload from '@/components/FileUpload';
import { contractApi, OaRiskAlert } from '@/services/api/contractRisk';
import { borrowManagementApi, BorrowManagementStats, licenseBorrowApi, OaHandoverLog, OaLicenseBorrow, OaReminderLog, OaSealApplication, sealApplicationApi } from '@/services/api/sealLicense';
import { useAuth } from '@/context/AuthContext';
import { PageResult } from '@/types';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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

const BORROW_STATUS_FALLBACK_OPTIONS = [
  { value: 'APPROVED', label: '待借出' },
  { value: 'BORROWED', label: '借出中' },
  { value: 'RETURNED', label: '已归还' },
  { value: 'OVERDUE', label: '逾期未还' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'CANCELLED', label: '已取消' },
];

const getBorrowStatusFallbackLabel = (status?: string) => {
  const value = String(status || 'APPROVED');
  return BORROW_STATUS_FALLBACK_OPTIONS.find((item) => item.value === value)?.label || value;
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

const getStatusBadge = (status?: string) => (
  <DictBadge dictType="oa_borrow_status" value={String(status || 'APPROVED')} fallback={getBorrowStatusFallbackLabel(status)} />
);

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          <Clock3 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={['table-scroll-container admin-inner-table-surface', className].filter(Boolean).join(' ')}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={['p-4', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
  </section>
);

export const BorrowManagementPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_borrow_status');
  const [rows, setRows] = useState<UnifiedBorrow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), kind: 'ALL', status: 'APPROVED' });
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
  const activeFilterCount = [query.kind !== 'ALL' ? query.kind : '', query.status !== 'APPROVED' ? query.status : ''].filter(Boolean).length;
  const statusOptions = useMemo(() => {
    const dictOptions = statusDict.data?.map((item) => ({ label: item.label, value: item.value })) || [];
    const mergedOptions = [...dictOptions];
    BORROW_STATUS_FALLBACK_OPTIONS.forEach((fallback) => {
      if (!mergedOptions.some((item) => item.value === fallback.value)) {
        mergedOptions.push(fallback);
      }
    });
    return mergedOptions;
  }, [statusDict.data]);
  const metricStats = [
    { label: '行政待处理', value: String(stats?.pendingBorrowCount ?? 0), meta: '审批通过待借出', icon: <CheckCircle2 size={18} />, tone: 'blue' },
    { label: '借出中', value: String(stats?.borrowedCount ?? 0), meta: '印章和证照合计', icon: <Clock3 size={18} />, tone: 'green' },
    { label: '逾期未还', value: String(stats?.overdueCount ?? 0), meta: '需催还处理', icon: <FileWarning size={18} />, tone: 'amber' },
    { label: '证照到期', value: String(stats?.expiringLicenseCount ?? 0), meta: '30 天内到期', icon: <CalendarClock size={18} />, tone: 'violet' },
  ];

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">BORROW OPERATIONS</p>
          <h2>借还管理</h2>
          <span>处理印章和证照借出、归还、催还与关联风险</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => { void fetchRows(); void fetchStats(); }} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metricStats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <DialogPanel
          title="借还趋势"
          description="最近借出和归还节奏"
          actions={<TrendingUp className="h-4 w-4 text-cyan-600" />}
        >
          <div className="flex h-28 items-end gap-2">
            {(stats?.trend || []).map((item) => {
              const totalCount = item.sealCount + item.licenseCount;
              const height = Math.max(8, Math.round((totalCount / maxTrend) * 80));
              return (
                <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-20 w-full items-end justify-center rounded-md bg-[var(--cf-surface-muted)] px-1 dark:bg-slate-900">
                    <div className="w-full max-w-8 rounded-t-md bg-cyan-500" style={{ height }} title={`${item.date} ${totalCount} 次`} />
                  </div>
                  <span className="w-full truncate text-center text-[11px] text-slate-400">{item.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </DialogPanel>
        <DialogPanel title="资源使用排行" description="高频借用资源">
          <div className="grid gap-2.5">
            {(stats?.resourceUsage || []).slice(0, 5).map((item) => (
              <div key={`${item.businessType}-${item.resourceId}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-slate-600 dark:text-slate-300">{item.resourceName || '-'}</span>
                  <span className="text-slate-400">{item.count} 次</span>
                </div>
                <div className="h-2 overflow-hidden rounded-md bg-[var(--cf-surface-muted)] dark:bg-slate-900">
                  <div className="h-full rounded-md bg-emerald-500" style={{ width: `${Math.max(8, (item.count / maxUsage) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!stats?.resourceUsage?.length ? <div className="py-6 text-center text-sm text-slate-400">暂无排行数据</div> : null}
          </div>
        </DialogPanel>
      </div>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-borrow-management-filter-grid">
        <label>
          <span className="input-label">业务类型</span>
          <Select value={query.kind} onValueChange={(kind) => setQuery((prev) => ({ ...prev, pageNum: 1, kind }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="业务类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部类型</SelectItem>
              <SelectItem value="SEAL">用印</SelectItem>
              <SelectItem value="LICENSE">证照</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="input-label">状态</span>
          <Select value={query.status} onValueChange={(status) => setQuery((prev) => ({ ...prev, pageNum: 1, status }))}>
            <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button variant="outline" size="sm" onClick={() => setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), kind: 'ALL', status: 'APPROVED' })} disabled={activeFilterCount === 0}>
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-borrow-management-table-panel">
      <table className="unity-data-table admin-source-table admin-seal-license-table min-w-[1080px]">
          <thead>
            <tr>
              <th>类型 / 编号</th>
              <th>资源</th>
              <th>申请人</th>
              <th>用途</th>
              <th>借出 / 归还</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载借还记录..." loading />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={7} title="暂无借还记录" />
            ) : rows.map((item) => (
              <tr key={`${item.kind}-${item.id}`}>
                <td>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{item.kind === 'SEAL' ? '用印' : '证照'}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.no || '-'}</div>
                  {item.contractNo ? <div className="mt-1 text-xs text-cyan-600 dark:text-cyan-300">{item.contractNo}</div> : null}
                </td>
                <td>{item.resourceName || '-'}</td>
                <td>{item.applicantName || '-'}</td>
                <td className="max-w-xs truncate">{item.purpose || '-'}</td>
                <td>
                  <div>{formatDateTimeDisplay(item.actualBorrowTime)}</div>
                  <div className="mt-1 text-xs text-slate-400">{formatDateTimeDisplay(item.expectedReturnTime)}</div>
                </td>
                <td>{getStatusBadge(item.status)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" title="详情" onClick={() => void openDetail(item)}><Eye size={15} /></button>
                    {item.status === 'APPROVED' && hasPermission('oa:borrow:confirm') ? <button type="button" title="借出" onClick={() => openAction(item, 'borrow')}><CheckCircle2 size={15} /></button> : null}
                    {(item.status === 'BORROWED' || item.status === 'OVERDUE') && hasPermission('oa:borrow:return') ? <button type="button" title="归还" onClick={() => openAction(item, 'return')}><RotateCcw size={15} /></button> : null}
                    {(item.status === 'BORROWED' || item.status === 'OVERDUE') && hasPermission('oa:borrow:remind') ? <button type="button" title="催还" onClick={() => openAction(item, 'remind')}><Bell size={15} /></button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={(pageNum) => setQuery((prev) => ({ ...prev, pageNum }))}
      onPageSizeChange={() => {}}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-seal-license-page admin-borrow-management-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={Boolean(actionTarget)}
        title={actionTitle}
        onClose={() => setActionTarget(null)}
        width="normal"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => setActionTarget(null)}>取消</Button>
            <Button onClick={() => void submitAction()} disabled={!hasPermission(actionType === 'borrow' ? 'oa:borrow:confirm' : actionType === 'return' ? 'oa:borrow:return' : 'oa:borrow:remind')}>{actionTitle}</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            <div className="font-medium text-slate-900 dark:text-slate-100">{actionTarget?.resourceName || '-'}</div>
            <div className="mt-1 text-xs text-slate-400">{actionTarget?.applicantName || '-'} / {actionTarget?.no || '-'}</div>
          </div>
          <div className="admin-dialog-field">
            <Label>备注</Label>
            <Textarea className="min-h-[110px] resize-none" value={remark} onChange={(event) => setRemark(event.target.value)} />
          </div>
          {actionType !== 'remind' ? (
            <div className="admin-dialog-field">
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
        bodyClassName="admin-dialog-stack"
        footer={<Button variant="outline" onClick={() => setDetailTarget(null)}>关闭</Button>}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
            <Clock3 className="mr-2 h-4 w-4 animate-spin" />
            正在加载借还详情...
          </div>
        ) : (
          <div className="admin-dialog-stack">
            <DialogPanel title="交接日志" description="借出和归还操作记录">
              {handoverLogs.length ? (
                <div className="admin-dialog-stack">
                  {handoverLogs.map((log) => (
                    <div key={log.id} className="border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
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
            </DialogPanel>
            <DialogPanel title="催还记录" description="自动和手动提醒记录">
              {reminderLogs.length ? (
                <div className="admin-dialog-stack">
                  {reminderLogs.map((log) => (
                    <div key={log.id} className="border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{log.reminderType === 'AUTO' ? '自动催还' : '手动催还'}</span>
                        <span className="text-xs text-slate-400">{formatDateTimeDisplay(log.reminderTime)}</span>
                      </div>
                      <div className="mt-1 text-slate-600 dark:text-slate-300">{log.reminderContent || '-'}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-sm text-slate-400">暂无催还记录</div>}
            </DialogPanel>
            <DialogPanel title="关联风险" description="合同或业务关联风险">
              {riskLogs.length ? (
                <div className="admin-dialog-stack">
                  {riskLogs.map((risk) => (
                    <div key={risk.id} className="border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-3 text-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{risk.riskName}</span>
                        <span className="text-xs text-slate-400">{risk.riskLevel} / {risk.riskStatus}</span>
                      </div>
                      <div className="mt-1 text-slate-600 dark:text-slate-300">{risk.handleRemark || risk.riskCode || '-'}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="py-6 text-center text-sm text-slate-400">暂无关联风险</div>}
            </DialogPanel>
          </div>
        )}
      </BaseDialog>
    </>
  );
};

export default BorrowManagementPage;

