import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, RefreshCcw, RotateCcw, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  adjustPoint,
  getEmployeePointAccount,
  getMyPointAccount,
  listPointTransactions,
  type HrPointAccount,
  type HrPointTransaction,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, normalizeRows } from '../hrShared';

const directionLabel: Record<string, string> = {
  IN: '入账',
  OUT: '扣减',
  FROZEN: '冻结',
  UNFROZEN: '解冻',
};

const sourceLabel: Record<string, string> = {
  BENEFIT: '福利',
  MALL_ORDER: '商城订单',
  MANUAL_ADJUST: '手动调整',
  EXPIRE: '过期清零',
};

export const HrPointAccountPage: React.FC = () => {
  const [employeeId, setEmployeeId] = useState('');
  const [mode, setMode] = useState<'mine' | 'other'>('mine');
  const [account, setAccount] = useState<HrPointAccount | null>(null);
  const [txns, setTxns] = useState<HrPointTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10));
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    employeeId: '',
    points: 0,
    direction: 'IN' as 'IN' | 'OUT',
    remark: '',
  });

  const loadAccount = useCallback(async (empId?: number) => {
    setLoading(true);
    try {
      const acc = empId ? await getEmployeePointAccount(empId) : await getMyPointAccount();
      setAccount(acc);
      setMode(empId ? 'other' : 'mine');
    } catch (error) {
      toast.error(getErrorMessage(error, '积分账户加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const loadTxns = useCallback(async () => {
    if (!account?.id) {
      setTxns([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum, pageSize };
      if (direction) params.direction = direction;
      const res = await listPointTransactions(account.id, params);
      setTxns(normalizeRows<HrPointTransaction>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '积分流水加载失败'));
    } finally {
      setLoading(false);
    }
  }, [account?.id, direction, pageNum, pageSize]);

  useEffect(() => {
    void loadTxns();
  }, [loadTxns]);

  const handleSearch = () => {
    setPageNum(1);
    if (!employeeId.trim()) {
      void loadAccount();
      return;
    }
    void loadAccount(Number(employeeId));
  };

  const handleAdjust = async () => {
    if (!adjustForm.employeeId || !adjustForm.points) {
      toast.error('请填写员工 ID 与积分');
      return;
    }
    try {
      await adjustPoint(
        Number(adjustForm.employeeId),
        adjustForm.points,
        adjustForm.direction,
        adjustForm.remark || undefined,
      );
      toast.success('已调整');
      setAdjustOpen(false);
      void loadAccount(Number(adjustForm.employeeId));
    } catch (error) {
      toast.error(getErrorMessage(error, '调整失败'));
    }
  };

  const hasFilters = Boolean(employeeId || direction);

  const filters = (
    <FilterBar
      search={{
        value: employeeId,
        onChange: setEmployeeId,
        onSubmit: handleSearch,
        placeholder: '查询员工 ID(留空查看本人)',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="direction" className="w-full sm:w-36">
          <Select value={direction || '__all'} onValueChange={(v) => { setDirection(v === '__all' ? '' : v); setPageNum(1); }}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部方向" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部方向</SelectItem>
              {Object.entries(directionLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条流水` }, { label: '', value: mode === 'mine' ? '本人视图' : '查看他人' }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => { setEmployeeId(''); setDirection(''); setPageNum(1); void loadAccount(); }}>
                <RotateCcw className="mr-1.5 h-4 w-4" />查看本人
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void loadTxns()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="adjust" size="sm" onClick={() => setAdjustOpen(true)}>
          <Settings2 className="mr-1.5 h-4 w-4" />手动调整
        </Button>,
      ]}
    />
  );

  const table = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">可用积分</div><div className="text-2xl font-semibold">{Number(account?.availablePoints ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">累计获得</div><div className="text-2xl font-semibold">{Number(account?.totalEarned ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">累计消费</div><div className="text-2xl font-semibold">{Number(account?.totalSpent ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">冻结积分</div><div className="text-2xl font-semibold">{Number(account?.frozenPoints ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
      </div>

      <TableSurfaceCard>
        <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
          积分流水{account?.id ? ` · 账户 #${account.id}` : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>流水号</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>积分</TableHead>
                <TableHead>余额</TableHead>
                <TableHead>生效日</TableHead>
                <TableHead>备注</TableHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                    <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                  </td>
                </tr>
              ) : txns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">暂无流水</td>
                </tr>
              ) : (
                txns.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 font-mono text-xs">{row.txnNo}</td>
                    <td className="px-4 py-3 text-sm"><span className={row.direction === 'IN' ? 'text-emerald-600' : row.direction === 'OUT' ? 'text-rose-600' : 'text-slate-500'}>{enumLabel(directionLabel, row.direction)}</span></td>
                    <td className="px-4 py-3 text-xs">{enumLabel(sourceLabel, row.sourceType)}{row.sourceId ? ` #${row.sourceId}` : ''}</td>
                    <td className="px-4 py-3 text-sm">{row.direction === 'OUT' ? '-' : '+'}{Number(row.points ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">{Number(row.balanceAfter ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.effectiveDate ?? row.createTime)}</td>
                    <td className="px-4 py-3 max-w-[14rem] truncate text-xs">{row.remark ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>
    </div>
  );

  const pagination = total > 0 ? (
    <Pagination
      page={pageNum}
      pageSize={pageSize}
      total={total}
      onPageChange={setPageNum}
      onPageSizeChange={(size) => { setPageSize(size); setPageNum(1); }}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={adjustOpen}
        title="手动调整积分"
        onClose={() => setAdjustOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>取消</Button>
            <Button onClick={() => void handleAdjust()}>确认调整</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>员工 ID</Label>
            <Input value={adjustForm.employeeId} onChange={(e) => setAdjustForm({ ...adjustForm, employeeId: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>方向</Label>
              <Select value={adjustForm.direction} onValueChange={(v) => setAdjustForm({ ...adjustForm, direction: v as 'IN' | 'OUT' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">入账</SelectItem>
                  <SelectItem value="OUT">扣减</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>积分</Label>
              <Input type="number" value={adjustForm.points} onChange={(e) => setAdjustForm({ ...adjustForm, points: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>备注</Label>
            <Input value={adjustForm.remark} onChange={(e) => setAdjustForm({ ...adjustForm, remark: e.target.value })} placeholder="调整理由" />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrPointAccountPage;
