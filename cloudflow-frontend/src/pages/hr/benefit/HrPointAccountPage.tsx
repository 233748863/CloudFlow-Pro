import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
  const [loading, setLoading] = useState(false);
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
      if (acc?.id) {
        const txnRes = await listPointTransactions(acc.id);
        setTxns(normalizeRows<HrPointTransaction>(txnRes));
      } else {
        setTxns([]);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '积分账户加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const handleSearch = () => {
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">积分账户</div>
          <div className="mt-1 text-xs text-slate-500">查看积分余额与流水,HR 可手动调整</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">查询员工 ID</Label>
            <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="留空查看本人" />
          </div>
          <Button onClick={handleSearch} disabled={loading}>查询</Button>
          <Button variant="outline" onClick={() => { setEmployeeId(''); void loadAccount(); }}>查看本人</Button>
          <Button onClick={() => setAdjustOpen(true)}>手动调整</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">可用积分</div><div className="text-2xl font-semibold">{Number(account?.availablePoints ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">累计获得</div><div className="text-2xl font-semibold">{Number(account?.totalEarned ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">累计消费</div><div className="text-2xl font-semibold">{Number(account?.totalSpent ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
        <TableSurfaceCard><div className="p-4"><div className="text-xs text-slate-500">冻结积分</div><div className="text-2xl font-semibold">{Number(account?.frozenPoints ?? 0).toLocaleString()}</div></div></TableSurfaceCard>
      </div>

      <TableSurfaceCard>
        <div className="px-4 py-3 text-sm font-semibold text-slate-800">
          积分流水{account?.id ? ` · 账户 #${account.id}` : ''} · 共 {txns.length} 条
          <span className="ml-2 text-xs font-normal text-slate-500">{mode === 'mine' ? '本人视图' : '查看他人'}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>流水号</TableHead>
              <TableHead>方向</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>积分</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>生效日</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : txns.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">暂无流水</TableCell></TableRow>
            ) : (
              txns.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.txnNo}</TableCell>
                  <TableCell><span className={row.direction === 'IN' ? 'text-emerald-600' : row.direction === 'OUT' ? 'text-rose-600' : 'text-slate-500'}>{enumLabel(directionLabel, row.direction)}</span></TableCell>
                  <TableCell className="text-xs">{enumLabel(sourceLabel, row.sourceType)}{row.sourceId ? ` #${row.sourceId}` : ''}</TableCell>
                  <TableCell>{row.direction === 'OUT' ? '-' : '+'}{Number(row.points ?? 0).toLocaleString()}</TableCell>
                  <TableCell>{Number(row.balanceAfter ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.effectiveDate ?? row.createTime)}</TableCell>
                  <TableCell className="max-w-[14rem] truncate text-xs">{row.remark ?? '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

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
