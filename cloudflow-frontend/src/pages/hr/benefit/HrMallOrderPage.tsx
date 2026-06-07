import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, RefreshCcw, RotateCcw } from 'lucide-react';
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
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ orderNo: '', status: '', scope: 'all' as 'all' | 'mine', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [detail, setDetail] = useState<HrMallOrder | null>(null);
  const [shipOpen, setShipOpen] = useState<HrMallOrder | null>(null);
  const [expressNo, setExpressNo] = useState('');
  const [cancelTarget, setCancelTarget] = useState<HrMallOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('不需要了');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.orderNo) params.orderNo = query.orderNo;
      if (query.status) params.status = query.status;
      const res = query.scope === 'mine' ? await listMyOrders(params) : await listAllOrders(params);
      setRows(normalizeRows<HrMallOrder>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载订单失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelOrder(cancelTarget.id, cancelReason.trim() || undefined);
      toast.success('已取消,积分与库存已退回');
      setCancelTarget(null);
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

  const hasFilters = Boolean(query.orderNo || query.status || query.scope !== 'all');

  const filters = (
    <FilterBar
      search={{
        value: query.orderNo,
        onChange: (value) => setQuery((q) => ({ ...q, orderNo: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索订单号',
        widthClassName: 'w-full sm:w-[200px]',
      }}
      filters={[
        <div key="scope" className="w-full sm:w-32">
          <Select value={query.scope} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, scope: v as 'all' | 'mine' }))}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="mine">我的</SelectItem>
            </SelectContent>
          </Select>
        </div>,
        <div key="status" className="w-full sm:w-36">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, orderNo: '', status: '', scope: 'all' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>订单号</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>收件人</TableHead>
              <TableHead>物流号</TableHead>
              <TableHead>下单时间</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">暂无订单</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">
                    <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                      {row.orderNo}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">{row.employeeId}</td>
                  <td className="px-4 py-3 text-sm">{Number(row.totalPoints ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(statusLabel, row.status)}</td>
                  <td className="px-4 py-3 text-xs">{row.receiverName ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.expressNo ?? '-'}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.createTime)}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'detail', label: '详情', semantic: 'view', onClick: () => void openDetail(row) },
                        { key: 'ship', label: '发货', semantic: 'submit', onClick: () => setShipOpen(row), hidden: !hasWorkflowStatus(row.status, 'APPROVED') },
                        { key: 'complete', label: '确认收货', semantic: 'confirm', onClick: () => void handleComplete(row), hidden: !(hasWorkflowStatus(row.status, 'SHIPPED') && query.scope === 'mine') },
                        { key: 'cancel', label: '取消', semantic: 'void', onClick: () => { setCancelTarget(row); setCancelReason('不需要了'); }, hidden: !hasWorkflowStatus(row.status, 'PENDING', 'APPROVED') },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

  const pagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <TableHeader>
                    <tr>
                      <TableHead>商品</TableHead>
                      <TableHead>单价</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>小计</TableHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(detail.items ?? []).map((it, idx) => (
                      <tr key={String(it.id ?? idx)}>
                        <td className="px-4 py-2 text-sm">{it.itemName}</td>
                        <td className="px-4 py-2 text-sm">{it.pointPrice}</td>
                        <td className="px-4 py-2 text-sm">{it.quantity}</td>
                        <td className="px-4 py-2 text-sm">{it.subtotal ?? (Number(it.pointPrice ?? 0) * Number(it.quantity ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </BaseDialog>
      )}

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

      <BaseDialog
        open={cancelTarget !== null}
        title={`取消订单 · ${cancelTarget?.orderNo ?? ''}`}
        onClose={() => setCancelTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>关闭</Button>
            <Button onClick={() => void handleCancel()}>确认取消</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-xs text-slate-500">取消后积分与库存将自动退回。</div>
          <Label>取消理由</Label>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="请输入取消理由" />
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrMallOrderPage;
