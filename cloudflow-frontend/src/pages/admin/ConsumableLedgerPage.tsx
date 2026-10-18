import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, DatePicker, Input } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { consumableLedgerApi, type ConsumableCatalogItem, type ConsumableLedgerRow, type ConsumableQuery } from '@/services/api/consumableLedger';
import { purchaseRequestApi, type PurchaseRequest } from '@/services/api/purchase';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConsumableField, ConsumablePagination, ConsumablePicker, ConsumableSelect, ConsumableTableState, dateWindow, moneyText, sourceLabel, transactionLabel, useConsumablePage } from './consumable/consumableUi';
import ConsumableStockDialog, { type ConsumableStockAction } from './consumable/ConsumableStockDialog';
import ConsumableLedgerActionDialog from './consumable/ConsumableLedgerActionDialog';
import ConsumablePurchaseSourceDialog from './consumable/ConsumablePurchaseSourceDialog';

function LedgerWorkspace() {
  const { hasPermission } = useAuth();
  const [search] = useSearchParams();
  const [query, setQuery] = useState<ConsumableQuery>({ consumableId: search.get('consumableId') || undefined, pageNum: 1, pageSize: 10 });
  const [filter, setFilter] = useState({ consumableId: search.get('consumableId') || '', from: '', to: '', transactionType: '', sourceBizType: '', sourceBizId: '' });
  const [material, setMaterial] = useState<ConsumableCatalogItem | null>(null);
  const [detail, setDetail] = useState<ConsumableLedgerRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<'return' | 'reverse' | null>(null);
  const [stockAction, setStockAction] = useState<ConsumableStockAction>('recalculate');
  const [stockPanel, setStockPanel] = useState<{ id: string; action: ConsumableStockAction } | null>(null);
  const [purchase, setPurchase] = useState<{ id: string; detail: PurchaseRequest } | null>(null);
  const [purchaseId, setPurchaseId] = useState('');
  const loader = useCallback(() => consumableLedgerApi.list(query), [query]);
  const { data, loading, error, refresh } = useConsumablePage(loader);
  const cost = hasPermission('oa:consumable-ledger:cost');
  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try { setDetail(await consumableLedgerApi.detail(id)); }
    catch (failure) { toast.error(getErrorMessage(failure, '台账详情加载失败')); }
    finally { setDetailLoading(false); }
  };
  useEffect(() => { const id = search.get('ledgerId'); if (id) void openDetail(id); }, [search]);
  const applyFilters = () => {
    try {
      const dates = filter.from || filter.to ? dateWindow(filter.from, filter.to) : {};
      if (filter.consumableId && !/^[1-9]\d*$/.test(filter.consumableId)) throw new Error('请选择有效耗材');
      if (filter.sourceBizId && !/^[1-9]\d*$/.test(filter.sourceBizId)) throw new Error('来源编号必须为正整数');
      setQuery({ ...dates, consumableId: filter.consumableId || undefined, transactionType: filter.transactionType as ConsumableQuery['transactionType'] || undefined, sourceBizType: filter.sourceBizType as ConsumableQuery['sourceBizType'] || undefined, sourceBizId: filter.sourceBizId || undefined, pageNum: 1, pageSize: 10 });
    } catch (failure) { toast.error(getErrorMessage(failure, '筛选条件无效')); }
  };
  const stockOptions = [
    { value: 'recalculate', label: '核对 / 重算', permission: 'oa:consumable-ledger:recalculate' },
    { value: 'inbound', label: '手工入库', permission: 'oa:consumable:add-stock' },
    { value: 'adjust-in', label: '盘盈调整', permission: 'oa:consumable:adjust' },
    { value: 'adjust-out', label: '盘亏调整', permission: 'oa:consumable:adjust' },
    { value: 'scrap', label: '耗材报废', permission: 'oa:consumable:scrap' },
  ].filter((option) => hasPermission(option.permission));
  const allowedAction = stockOptions.some((option) => option.value === stockAction) ? stockAction : stockOptions[0]?.value as ConsumableStockAction;
  const openPurchase = async (id: string | undefined = detail?.sourceDocumentId) => {
    if (!id || !/^[1-9]\d*$/.test(id)) { toast.error('请输入有效采购编号ID'); return; }
    try { setPurchase({ id, detail: await purchaseRequestApi.getInfo(id) }); }
    catch (failure) { toast.error(getErrorMessage(failure, '来源采购单不可见')); }
  };
  return <section className="admin-source-page consumable-ledger-page">
    <TablePageLayout actions={<header className="admin-source-header"><div><p className="admin-source-kicker">CONSUMABLE LEDGER</p><h2 className="flex items-center gap-2"><BookOpen size={22} />耗材台账</h2><span>数量、成本与来源逐笔留痕；每次记账都可追溯</span></div><Button variant="outline" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} />刷新</Button></header>}
      filters={<section className="card space-y-4 p-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConsumableField label="耗材">{hasPermission('oa:consumable:list') ? <ConsumablePicker management value={material} onSelect={(item) => { setMaterial(item); setFilter((previous) => ({ ...previous, consumableId: item.consumableId })); }} /> : <Input value={filter.consumableId} aria-label="耗材编号" onChange={(event) => setFilter((previous) => ({ ...previous, consumableId: event.target.value }))} placeholder="耗材编号" />}</ConsumableField>
        <ConsumableField label="交易类型"><ConsumableSelect label="交易类型" value={filter.transactionType} onChange={(value) => setFilter((previous) => ({ ...previous, transactionType: value }))} options={[{ value: '', label: '全部交易' }, ...Object.entries(transactionLabel).map(([value, label]) => ({ value, label }))]} /></ConsumableField>
        <ConsumableField label="业务来源"><ConsumableSelect label="业务来源" value={filter.sourceBizType} onChange={(value) => setFilter((previous) => ({ ...previous, sourceBizType: value }))} options={[{ value: '', label: '全部来源' }, ...Object.entries(sourceLabel).map(([value, label]) => ({ value, label }))]} /></ConsumableField>
        <ConsumableField label="开始日期"><DatePicker type="date" value={filter.from} onChange={(event) => setFilter((previous) => ({ ...previous, from: event.target.value }))} /></ConsumableField>
        <ConsumableField label="结束日期（含当日）"><DatePicker type="date" value={filter.to} onChange={(event) => setFilter((previous) => ({ ...previous, to: event.target.value }))} /></ConsumableField>
        <ConsumableField label="来源记录编号"><Input value={filter.sourceBizId} onChange={(event) => setFilter((previous) => ({ ...previous, sourceBizId: event.target.value }))} placeholder="采购填收货记录编号；领用填申请编号ID" /></ConsumableField>
      </div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><Button onClick={applyFilters}><Search size={16} />查询</Button><Button variant="outline" onClick={() => { setFilter({ consumableId: '', from: '', to: '', transactionType: '', sourceBizType: '', sourceBizId: '' }); setMaterial(null); setQuery({ pageNum: 1, pageSize: 10 }); }}>重置</Button><span className="self-center text-sm text-cf-subtle">共 {data.total} 笔{query.consumableId ? ` · 耗材 #${query.consumableId}` : ''}</span></div>{stockOptions.length > 0 && hasPermission('oa:consumable:list') && <div className="flex gap-2"><ConsumableSelect label="库存操作" value={allowedAction} onChange={(value) => setStockAction(value as ConsumableStockAction)} options={stockOptions} /><Button variant="outline" disabled={!filter.consumableId} onClick={() => setStockPanel({ id: filter.consumableId, action: allowedAction })}>办理选中耗材</Button></div>}</div></section>}
      table={<InnerTableSurface><table className="unity-data-table admin-source-table min-w-[1100px]"><thead><tr><th>时间 / 流水</th><th>耗材 / 单位</th><th>交易</th><th>数量增减</th><th>本笔结存</th>{cost && <><th>单价</th><th>成本增减</th><th>结存成本</th></>}<th>来源</th><th>操作人</th><th>操作</th></tr></thead><tbody>
        <ConsumableTableState columns={cost ? 11 : 8} loading={loading} error={error} empty={!data.rows.length} onRetry={() => void refresh()} />
        {!loading && !error && data.rows.map((row) => <tr key={row.ledgerId}><td>{row.operateTime}<div className="text-xs text-cf-subtle">#{row.ledgerId}</div></td><td>{row.consumableName}<div className="text-xs text-cf-subtle">{row.model || '无型号'} · {row.unit}</div></td><td>{row.reversalOfLedgerId ? '冲正 · ' : ''}{transactionLabel[row.transactionType]}{row.reversed && <div className="text-xs text-cf-subtle">原记录已冲正</div>}</td><td className={row.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}>{row.quantity > 0 ? '+' : ''}{row.quantity}</td><td>{row.balanceAfter} {row.unit}</td>{cost && <><td>{row.unitPrice === undefined ? '—' : moneyText(row.unitPrice)}</td><td>{row.amount === undefined ? '—' : moneyText(row.amount)}</td><td>{row.balanceAmountAfter === undefined ? '—' : moneyText(row.balanceAmountAfter)}</td></>}<td>{sourceLabel[row.sourceBizType]}<div className="text-xs text-cf-subtle">{row.sourceBizId ? `#${row.sourceBizId}` : '独立登记'}</div></td><td>{row.operatorName}</td><td><Button size="sm" variant="ghost" disabled={detailLoading} onClick={() => void openDetail(row.ledgerId)}>详情</Button></td></tr>)}
      </tbody></table></InnerTableSurface>}
      pagination={<ConsumablePagination total={data.total} page={query.pageNum ?? 1} onChange={(pageNum) => setQuery((previous) => ({ ...previous, pageNum }))} />} />
    {detail && !action && <BaseDialog open title={`台账 #${detail.ledgerId} · ${detail.consumableName}`} onClose={() => setDetail(null)} width="wide" footer={<><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>{detail.sourceBizType === 'CONSUMABLE_REQUEST' && detail.transactionType === 'OUTBOUND' && !detail.reversed && !detail.reversalOfLedgerId && detail.returnedQuantity < Math.abs(detail.quantity) && hasPermission('oa:consumable:return') && <Button onClick={() => setAction('return')}>登记退回</Button>}{!detail.reversed && !detail.reversalOfLedgerId && hasPermission('oa:consumable-ledger:reverse') && (detail.sourceBizType === 'MANUAL' || hasPermission(detail.sourceBizType === 'PURCHASE_RECEIPT' ? 'oa:purchase:receipt' : 'oa:consumable-request:issue')) && <Button variant="outline" onClick={() => setAction('reverse')}>整笔冲正</Button>}</>}>
      <div className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2">{[['交易类型', `${transactionLabel[detail.transactionType]}${detail.reversalOfLedgerId ? '（冲正）' : ''}`], ['本笔数量 / 结存', `${detail.quantity} / ${detail.balanceAfter} ${detail.unit}`], ['实际操作', `${detail.operatorName} · ${detail.operateTime}`], ['领用人 / 部门', `${detail.beneficiaryName || '—'} / ${detail.deptName || '—'}`], ['来源', `${sourceLabel[detail.sourceBizType]} #${detail.sourceBizId || '—'}`], ['业务原因', detail.remark], ['存放说明', detail.storageLocation || '—'], ['请求键 / 行号', `${detail.operationKey} / ${detail.operationLineNo}`]].map(([label, value]) => <div key={label}><dt className="text-xs text-cf-subtle">{label}</dt><dd className="mt-1 break-words text-sm text-cf-body">{value}</dd></div>)}{cost && detail.amount !== undefined && <div><dt className="text-xs text-cf-subtle">本笔成本 / 本笔后均价</dt><dd>{moneyText(detail.amount)} / {moneyText(detail.avgCostAfter)}</dd></div>}</dl>
        <div className="flex flex-wrap gap-2">{detail.sourceBizType === 'CONSUMABLE_REQUEST' && (hasPermission('oa:consumable-request:query') || hasPermission('oa:consumable-request:dispatch')) && <Link className="text-sm text-[var(--cf-primary)] underline" to={`/admin/consumable-request?requestId=${detail.sourceBizId}${hasPermission('oa:consumable-request:dispatch') ? '&scope=DISPATCH' : ''}`}>打开领用申请 #{detail.sourceBizId}</Link>}{detail.sourceBizType === 'PURCHASE_RECEIPT' && detail.sourceDocumentId && hasPermission('oa:purchase:list') && <Button variant="outline" size="sm" onClick={() => void openPurchase()}>查看来源采购单 #{detail.sourceDocumentId}</Button>}{[detail.sourceLedgerId, detail.reversalOfLedgerId, detail.reversalLedgerId].filter(Boolean).map((id, index) => <Button key={`${id}:${index}`} variant="outline" size="sm" onClick={() => void openDetail(id!)}>关联流水 #{id}</Button>)}</div>
        {detail.assetLog && <section className="rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-4"><h3 className="text-sm font-medium">原库存日志 #{detail.assetLog.logId}</h3><p className="mt-2 text-sm text-cf-body">{detail.assetLog.type} · {detail.assetLog.quantityChange} {detail.unit} · {detail.assetLog.createTime}</p><p className="mt-1 text-sm text-cf-subtle">{detail.assetLog.remark}</p></section>}
      </div>
    </BaseDialog>}
    {detail && action && <ConsumableLedgerActionDialog key={`${detail.ledgerId}:${action}`} row={detail} action={action} onClose={() => { setAction(null); setDetail(null); }} onSaved={() => void refresh()} />}
    {stockPanel && <ConsumableStockDialog key={`${stockPanel.id}:${stockPanel.action}`} {...stockPanel} onClose={() => setStockPanel(null)} onSaved={() => void refresh()} />}
    {hasPermission('oa:purchase:list') && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-3"><label htmlFor="consumable-source-purchase" className="text-sm text-cf-subtle">核对采购收货</label><Input id="consumable-source-purchase" className="max-w-64" inputMode="numeric" value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)} placeholder="采购编号ID" /><Button variant="outline" onClick={() => void openPurchase(purchaseId)}>查询来源与待重试请求</Button></div>}
    {purchase && <ConsumablePurchaseSourceDialog key={purchase.id} purchase={purchase.detail} purchaseId={purchase.id} onClose={() => setPurchase(null)} onChanged={() => void refresh()} onOpenLedger={(id) => { setPurchase(null); void openDetail(id); }} />}
  </section>;
}

export default function ConsumableLedgerPage() {
  const { hasPermission } = useAuth();
  return hasPermission('oa:consumable-ledger:list') ? <LedgerWorkspace /> : <p role="alert" className="p-6 text-cf-subtle">无耗材台账查看权限。</p>;
}
