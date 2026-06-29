import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Coins, LoaderCircle, RefreshCcw, RotateCcw, Search, Settings2, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
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
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  adjustPoint,
  getEmployeePointAccount,
  getMyPointAccount,
  listPointTransactions,
  type HrPointAccount,
  type HrPointTransaction,
} from '@/services/api/hr';
import { formatDateTimeValue, normalizeRows } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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

  const { getOptions: getDirectionOptions } = useDict('hr_point_direction');
  const directionOptions = getDirectionOptions();

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

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">point account</p>
          <h2>积分账户</h2>
          <span>查看员工积分余额、冻结积分和积分流水，并支持管理员手动调整。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadTxns()} disabled={loading}>
            <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
          </Button>
          <Button size="sm" onClick={() => setAdjustOpen(true)}>
            <Settings2 className="h-4 w-4" />手动调整
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><WalletCards size={18} /></span>
          <div><p>可用积分</p><strong>{Number(account?.availablePoints ?? 0).toLocaleString()}</strong><span>{mode === 'mine' ? '本人账户' : `员工 ${employeeId || '-'}`}</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><TrendingUp size={18} /></span>
          <div><p>累计获得</p><strong>{Number(account?.totalEarned ?? 0).toLocaleString()}</strong><span>历史入账合计</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><TrendingDown size={18} /></span>
          <div><p>累计消费</p><strong>{Number(account?.totalSpent ?? 0).toLocaleString()}</strong><span>历史扣减合计</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><Coins size={18} /></span>
          <div><p>冻结积分</p><strong>{Number(account?.frozenPoints ?? 0).toLocaleString()}</strong><span>审批或锁定中</span></div>
        </article>
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form
        className="admin-users-filter-grid"
        onSubmit={(event) => {
          event.preventDefault();
          handleSearch();
        }}
      >
        <label>
          <span>员工 ID</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="cf-control"
              placeholder="留空查看本人"
            />
          </div>
        </label>
        <label>
          <span>流水方向</span>
          <Select value={direction || '__all'} onValueChange={(v) => { setDirection(v === '__all' ? '' : v); setPageNum(1); }}>
            <SelectTrigger className="cf-control"><SelectValue placeholder="全部方向" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部方向</SelectItem>
              {directionOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button type="submit" size="sm">查询</Button>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={() => { setEmployeeId(''); setDirection(''); setPageNum(1); void loadAccount(); }}>
              <RotateCcw className="h-4 w-4" />查看本人
            </Button>
          ) : null}
          <span className="admin-users-filter-count">共 {total} 条流水</span>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100">
        积分流水{account?.id ? ` · 账户 #${account.id}` : ''}
      </div>
      <table className="unity-data-table admin-source-table min-w-[920px]">
        <thead>
          <tr>
            <th>流水号</th>
            <th>方向</th>
            <th>来源</th>
            <th>积分</th>
            <th>余额</th>
            <th>生效日</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
              </td>
            </tr>
          ) : txns.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无流水</td>
            </tr>
          ) : (
            txns.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">{row.txnNo}</td>
                <td className="text-sm"><span className={row.direction === 'IN' ? 'text-emerald-600' : row.direction === 'OUT' ? 'text-rose-600' : 'text-slate-500'}><DictLabel dictType="hr_point_direction" value={row.direction} fallback="-" /></span></td>
                <td className="text-xs"><DictLabel dictType="hr_point_source" value={row.sourceType} fallback="-" />{row.sourceId ? ` #${row.sourceId}` : ''}</td>
                <td className="text-sm">{row.direction === 'OUT' ? '-' : '+'}{Number(row.points ?? 0).toLocaleString()}</td>
                <td className="text-sm">{Number(row.balanceAfter ?? 0).toLocaleString()}</td>
                <td className="text-xs">{formatDateTimeValue(row.effectiveDate ?? row.createTime)}</td>
                <td className="max-w-[14rem] truncate text-xs">{row.remark ?? '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      page={pageNum}
      pageSize={pageSize}
      total={total}
      onPageChange={setPageNum}
      onPageSizeChange={(size) => { setPageSize(size); setPageNum(1); }}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={adjustOpen}
        title="手动调整积分"
        onClose={() => setAdjustOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>取消</Button>
            <Button onClick={() => void handleAdjust()}>确认调整</Button>
          </div>
        }
      >
        <div className="admin-dialog-field">
            <Label>员工 ID</Label>
            <Input value={adjustForm.employeeId} onChange={(e) => setAdjustForm({ ...adjustForm, employeeId: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>方向</Label>
              <Select value={adjustForm.direction} onValueChange={(v) => setAdjustForm({ ...adjustForm, direction: v as 'IN' | 'OUT' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">入账</SelectItem>
                  <SelectItem value="OUT">扣减</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>积分</Label>
              <Input type="number" value={adjustForm.points} onChange={(e) => setAdjustForm({ ...adjustForm, points: Number(e.target.value) })} />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>备注</Label>
            <Input value={adjustForm.remark} onChange={(e) => setAdjustForm({ ...adjustForm, remark: e.target.value })} placeholder="调整理由" />
          </div>
      </BaseDialog>
    </>
  );
};

export default HrPointAccountPage;
