import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Label, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { licenseBorrowApi, OaLicenseBorrow, OaSealApplication, sealApplicationApi } from '@/services/api/sealLicense';
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

export const BorrowManagementPage: React.FC = () => {
  const [rows, setRows] = useState<UnifiedBorrow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, kind: 'ALL', status: 'APPROVED' });
  const [actionTarget, setActionTarget] = useState<UnifiedBorrow | null>(null);
  const [actionType, setActionType] = useState<'borrow' | 'return' | 'remind'>('borrow');
  const [remark, setRemark] = useState('');

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

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const openAction = (target: UnifiedBorrow, type: 'borrow' | 'return' | 'remind') => {
    setActionTarget(target);
    setActionType(type);
    setRemark('');
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
        await api.confirmBorrow(actionTarget.id, remark);
      } else if (actionType === 'return') {
        await api.confirmReturn(actionTarget.id, remark);
      } else {
        await api.remind(actionTarget.id, remark);
      }
      toast.success(`${actionTitle}成功`);
      setActionTarget(null);
      await fetchRows();
    } catch (error) {
      toast.error(getErrorMessage(error, `${actionTitle}失败`));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return (
    <div className="space-y-4">
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
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
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
                          iconOnly
                          actions={[
                            { label: '借出', icon: <CheckCircle2 size={14} />, onClick: () => openAction(item, 'borrow'), tone: 'success', hidden: item.status !== 'APPROVED' },
                            { label: '归还', icon: <RotateCcw size={14} />, onClick: () => openAction(item, 'return'), tone: 'success', hidden: item.status !== 'BORROWED' && item.status !== 'OVERDUE' },
                            { label: '催还', icon: <Bell size={14} />, onClick: () => openAction(item, 'remind'), tone: 'warning', hidden: item.status !== 'BORROWED' && item.status !== 'OVERDUE' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
            <Button onClick={() => void submitAction()}>{actionTitle}</Button>
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
        </div>
      </BaseDialog>
    </div>
  );
};

export default BorrowManagementPage;
