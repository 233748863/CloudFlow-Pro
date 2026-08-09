import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Ban, Check, Eye, LoaderCircle, RefreshCcw, RotateCcw, Search, Send } from 'lucide-react';
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
  cancelOrder,
  completeOrder,
  getMallOrder,
  listAllOrders,
  listMyOrders,
  shipOrder,
  type HrMallOrder,
} from '@/services/api/hr';
import { formatDateTimeValue, hasWorkflowStatus, normalizeRows } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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

  const { getOptions: getStatusOptions } = useDict('hr_mall_order_status');
  const statusOptions = getStatusOptions();

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

  const pendingCount = rows.filter((row) => hasWorkflowStatus(row.status, 'PENDING', 'APPROVED')).length;
  const shippedCount = rows.filter((row) => hasWorkflowStatus(row.status, 'SHIPPED')).length;
  const completedCount = rows.filter((row) => hasWorkflowStatus(row.status, 'COMPLETED')).length;

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">mall orders</p>
          <h2>积分商城订单</h2>
          <span>跟踪积分兑换订单、发货、确认收货和取消。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Eye size={18} /></span>
          <div><p>订单总数</p><strong>{total}</strong><span>当前查询范围</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><Send size={18} /></span>
          <div><p>待处理</p><strong>{pendingCount}</strong><span>待审批或待发货</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><RefreshCcw size={18} /></span>
          <div><p>已发货</p><strong>{shippedCount}</strong><span>等待确认收货</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><Check size={18} /></span>
          <div><p>已完成</p><strong>{completedCount}</strong><span>当前页完成记录</span></div>
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
          setQuery((q) => ({ ...q, pageNum: 1 }));
        }}
      >
        <label>
          <span>订单号</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input value={query.orderNo} onChange={(event) => setQuery((q) => ({ ...q, orderNo: event.target.value }))} className="cf-control" placeholder="搜索订单号" />
          </div>
        </label>
        <label>
          <span>范围</span>
          <Select value={query.scope} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, scope: v as 'all' | 'mine' }))}>
            <SelectTrigger className="cf-control"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="mine">我的</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>状态</span>
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button type="submit" size="sm">查询</Button>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, orderNo: '', status: '', scope: 'all' }))}>
              <RotateCcw className="h-4 w-4" />清空条件
            </Button>
          ) : null}
          <span className="admin-users-filter-count">共 {total} 条</span>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
      <table className="unity-data-table admin-source-table min-w-[1080px]">
        <thead>
          <tr>
            <th>订单号</th>
            <th>员工 ID</th>
            <th>积分</th>
            <th>状态</th>
            <th>收件人</th>
            <th>物流号</th>
            <th>下单时间</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-sm text-cf-faint">
                <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-10 text-center text-sm text-cf-faint">暂无订单</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">
                  <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                    {row.orderNo}
                  </button>
                </td>
                <td className="text-sm">{row.employeeId}</td>
                <td className="text-sm">{Number(row.totalPoints ?? 0).toLocaleString()}</td>
                <td className="text-sm"><DictLabel dictType="hr_mall_order_status" value={row.status} fallback="-" /></td>
                <td className="text-xs">{row.receiverName ?? '-'}</td>
                <td className="font-mono text-xs">{row.expressNo ?? '-'}</td>
                <td className="text-xs">{formatDateTimeValue(row.createTime)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void openDetail(row)}><Eye size={15} /></button>
                    {hasWorkflowStatus(row.status, 'APPROVED') ? (
                      <button type="button" data-tooltip="发货" aria-label="发货" onClick={() => setShipOpen(row)}><Send size={15} /></button>
                    ) : null}
                    {hasWorkflowStatus(row.status, 'SHIPPED') && query.scope === 'mine' ? (
                      <button type="button" data-tooltip="确认收货" aria-label="确认收货" onClick={() => void handleComplete(row)}><Check size={15} /></button>
                    ) : null}
                    {hasWorkflowStatus(row.status, 'PENDING', 'APPROVED') ? (
                      <button type="button" className="danger" data-tooltip="取消" aria-label="取消" onClick={() => { setCancelTarget(row); setCancelReason('不需要了'); }}><Ban size={15} /></button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
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

      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={`订单详情 · ${detail.orderNo}`}
          width="wide"
          onClose={() => setDetail(null)}
          bodyClassName="admin-dialog-stack"
          footer={
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
            </div>
          }
        >
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-cf-subtle">状态:</span> <DictLabel dictType="hr_mall_order_status" value={detail.status} fallback="-" /></div>
              <div><span className="text-cf-subtle">积分合计:</span> {detail.totalPoints}</div>
              <div><span className="text-cf-subtle">收件人:</span> {detail.receiverName ?? '-'}</div>
              <div><span className="text-cf-subtle">联系电话:</span> {detail.receiverPhone ?? '-'}</div>
              <div className="col-span-2"><span className="text-cf-subtle">收货地址:</span> {detail.receiverAddress ?? '-'}</div>
              <div><span className="text-cf-subtle">下单时间:</span> {formatDateTimeValue(detail.createTime)}</div>
              <div><span className="text-cf-subtle">物流单号:</span> {detail.expressNo ?? '-'}</div>
              <div><span className="text-cf-subtle">发货时间:</span> {formatDateTimeValue(detail.shippedAt)}</div>
              <div><span className="text-cf-subtle">完成时间:</span> {formatDateTimeValue(detail.completedAt)}</div>
              {detail.remark && <div className="col-span-2"><span className="text-cf-subtle">备注:</span> {detail.remark}</div>}
            </div>
            <div>
              <div className="mb-2 font-semibold">商品明细</div>
              <InnerTableSurface className="admin-inner-table-flush">
                <table className="unity-data-table admin-source-table min-w-[480px]">
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>单价</th>
                      <th>数量</th>
                      <th>小计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items ?? []).map((it, idx) => (
                      <tr key={String(it.id ?? idx)}>
                        <td className="text-sm">{it.itemName}</td>
                        <td className="text-sm">{it.pointPrice}</td>
                        <td className="text-sm">{it.quantity}</td>
                        <td className="text-sm">{it.subtotal ?? (Number(it.pointPrice ?? 0) * Number(it.quantity ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            </div>
          </div>
        </BaseDialog>
      )}

      {shipOpen && (
        <BaseDialog
          open={Boolean(shipOpen)}
          title={`录入物流 · ${shipOpen.orderNo}`}
          onClose={() => { setShipOpen(null); setExpressNo(''); }}
          bodyClassName="admin-dialog-stack"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShipOpen(null); setExpressNo(''); }}>取消</Button>
              <Button onClick={() => void handleShip()}>确认发货</Button>
            </div>
          }
        >
          <div className="admin-dialog-field">
            <Label>物流单号</Label>
            <Input value={expressNo} onChange={(e) => setExpressNo(e.target.value)} placeholder="例如 SF1234567890" />
          </div>
          <div className="text-xs text-cf-subtle">
            收件人:{shipOpen.receiverName ?? '-'} {shipOpen.receiverPhone ?? ''}<br />
            地址:{shipOpen.receiverAddress ?? '-'}
          </div>
        </BaseDialog>
      )}

      <BaseDialog
        open={cancelTarget !== null}
        title={`取消订单 · ${cancelTarget?.orderNo ?? ''}`}
        onClose={() => setCancelTarget(null)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>关闭</Button>
            <Button onClick={() => void handleCancel()}>确认取消</Button>
          </div>
        }
      >
        <div className="admin-dialog-field">
          <div className="text-xs text-cf-subtle">取消后积分与库存将自动退回。</div>
          <Label>取消理由</Label>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="请输入取消理由" />
        </div>
      </BaseDialog>
    </>
  );
};

export default HrMallOrderPage;
