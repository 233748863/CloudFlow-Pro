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
  cancelOrder,
  completeOrder,
  getMallOrder,
  listAllOrders,
  listMyOrders,
  shipOrder,
  type HrMallOrder,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, hasWorkflowStatus, normalizeRows } from '../hrShared';

const statusLabel: Record<string, string> = {
  PENDING: '待处理',
  APPROVING: '审批中',
  APPROVED: '已通过',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

export const HrMallOrderPage: React.FC = () => {
  const [rows, setRows] = useState<HrMallOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [detail, setDetail] = useState<HrMallOrder | null>(null);
  const [shipOpen, setShipOpen] = useState<HrMallOrder | null>(null);
  const [expressNo, setExpressNo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = scope === 'mine' ? await listMyOrders(params) : await listAllOrders(params);
      setRows(normalizeRows<HrMallOrder>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载订单失败'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: HrMallOrder) => {
    try {
      const full = await getMallOrder(row.id);
      setDetail(full);
    } catch (error) {
      toast.error(getErrorMessage(error, '订单详情加载失败'));
    }
  };

  const handleShip = async () => {
    if (!shipOpen) return;
    if (!expressNo.trim()) {
      toast.error('请填写物流单号');
      return;
    }
    try {
      await shipOrder(shipOpen.id, expressNo.trim());
      toast.success('已发货');
      setShipOpen(null);
      setExpressNo('');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发货失败'));
    }
  };

  const handleCancel = async (row: HrMallOrder) => {
    const reason = window.prompt('取消理由', '不需要了');
    if (reason === null) return;
    try {
      await cancelOrder(row.id, reason || undefined);
      toast.success('已取消,积分与库存已退回');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const handleComplete = async (row: HrMallOrder) => {
    try {
      await completeOrder(row.id);
      toast.success('已确认收货');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '确认失败'));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">兑换订单</div>
          <div className="mt-1 text-xs text-slate-500">订单状态机 · 发货 · 确认收货 · 取消退回</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32">
            <Label className="text-xs text-slate-500">视图</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'mine')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="mine">我的</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Label className="text-xs text-slate-500">状态</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>刷新</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>订单号</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>收件人</TableHead>
              <TableHead>物流号</TableHead>
              <TableHead>下单时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400">暂无订单</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                      {row.orderNo}
                    </button>
                  </TableCell>
                  <TableCell>{row.employeeId}</TableCell>
                  <TableCell>{Number(row.totalPoints ?? 0).toLocaleString()}</TableCell>
                  <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                  <TableCell className="text-xs">{row.receiverName ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.expressNo ?? '-'}</TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.createTime)}</TableCell>
                  <TableCell className="space-x-2 text-xs">
                    {hasWorkflowStatus(row.status, 'APPROVED') && (
                      <Button size="sm" onClick={() => setShipOpen(row)}>发货</Button>
                    )}
                    {hasWorkflowStatus(row.status, 'SHIPPED') && scope === 'mine' && (
                      <Button size="sm" onClick={() => void handleComplete(row)}>确认收货</Button>
                    )}
                    {hasWorkflowStatus(row.status, 'PENDING', 'APPROVED') && (
                      <Button size="sm" variant="outline" onClick={() => void handleCancel(row)}>取消</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      {/* 订单详情 */}
      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={`订单详情 · ${detail.orderNo}`}
          width="wide"
          onClose={() => setDetail(null)}
          footer={
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-500">状态:</span> {enumLabel(statusLabel, detail.status)}</div>
              <div><span className="text-slate-500">积分合计:</span> {detail.totalPoints}</div>
              <div><span className="text-slate-500">收件人:</span> {detail.receiverName ?? '-'}</div>
              <div><span className="text-slate-500">联系电话:</span> {detail.receiverPhone ?? '-'}</div>
              <div className="col-span-2"><span className="text-slate-500">收货地址:</span> {detail.receiverAddress ?? '-'}</div>
              <div><span className="text-slate-500">下单时间:</span> {formatDateTimeValue(detail.createTime)}</div>
              <div><span className="text-slate-500">物流单号:</span> {detail.expressNo ?? '-'}</div>
              <div><span className="text-slate-500">发货时间:</span> {formatDateTimeValue(detail.shippedAt)}</div>
              <div><span className="text-slate-500">完成时间:</span> {formatDateTimeValue(detail.completedAt)}</div>
              {detail.remark && <div className="col-span-2"><span className="text-slate-500">备注:</span> {detail.remark}</div>}
            </div>
            <div>
              <div className="mb-2 font-semibold">商品明细</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>单价</TableHead>
                    <TableHead>数量</TableHead>
                    <TableHead>小计</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detail.items ?? []).map((it, idx) => (
                    <TableRow key={String(it.id ?? idx)}>
                      <TableCell>{it.itemName}</TableCell>
                      <TableCell>{it.pointPrice}</TableCell>
                      <TableCell>{it.quantity}</TableCell>
                      <TableCell>{it.subtotal ?? (Number(it.pointPrice ?? 0) * Number(it.quantity ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </BaseDialog>
      )}

      {/* 发货录入 */}
      {shipOpen && (
        <BaseDialog
          open={Boolean(shipOpen)}
          title={`录入物流 · ${shipOpen.orderNo}`}
          onClose={() => { setShipOpen(null); setExpressNo(''); }}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShipOpen(null); setExpressNo(''); }}>取消</Button>
              <Button onClick={() => void handleShip()}>确认发货</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <Label>物流单号</Label>
              <Input value={expressNo} onChange={(e) => setExpressNo(e.target.value)} placeholder="例如 SF1234567890" />
            </div>
            <div className="text-xs text-slate-500">
              收件人:{shipOpen.receiverName ?? '-'} {shipOpen.receiverPhone ?? ''}<br />
              地址:{shipOpen.receiverAddress ?? '-'}
            </div>
          </div>
        </BaseDialog>
      )}
    </div>
  );
};

export default HrMallOrderPage;
