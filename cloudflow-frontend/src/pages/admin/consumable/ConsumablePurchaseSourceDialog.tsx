import { useCallback, useState } from 'react';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { useAuth } from '@/context/AuthContext';
import { clearConsumableReceiptAfterVerification, getPendingConsumableReceipt, purchaseRequestApi, type PurchaseRequest } from '@/services/api/purchase';
import type { ConsumablePosting } from '@/services/api/consumableLedger';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConsumableMutationNotice, ConsumablePagination, ConsumableTableState, useConsumablePage } from './consumableUi';

export default function ConsumablePurchaseSourceDialog({ purchase, purchaseId, onClose, onChanged, onOpenLedger }: {
  purchase: PurchaseRequest;
  purchaseId: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenLedger: (id: string) => void;
}) {
  const { hasPermission } = useAuth();
  const [source, setSource] = useState(purchase);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(() => getPendingConsumableReceipt(purchaseId));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [result, setResult] = useState<ConsumablePosting | null>(null);
  const loader = useCallback(() => purchaseRequestApi.receipts(purchaseId, { pageNum: page, pageSize: 10 }), [page, purchaseId]);
  const { data, loading, error, refresh } = useConsumablePage(loader);
  const refreshSource = async () => {
    try { setSource(await purchaseRequestApi.getInfo(purchaseId)); await refresh(); }
    catch (exception) { setFailure(getErrorMessage(exception, '采购收货核对失败')); }
  };
  const retry = async () => {
    if (!pending || busy) return;
    setBusy(true); setFailure('');
    try {
      setResult(await purchaseRequestApi.receipt(purchaseId, pending));
      setPending(null);
      onChanged();
      await refreshSource();
    } catch (exception) { setFailure(getErrorMessage(exception, '收货结果仍未确认，请保留原请求重试')); }
    finally { setBusy(false); }
  };
  const discard = () => {
    clearConsumableReceiptAfterVerification(purchaseId);
    setPending(null); setFailure('');
  };
  return <BaseDialog open title={`采购收货核对 · ${source.purchaseNo || purchaseId}`} width="wide" onClose={() => { if (!busy) onClose(); }} footer={<>
    <Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button>
    <Button variant="outline" disabled={busy || loading} onClick={() => void refreshSource()}>刷新来源与收货</Button>
    {pending && hasPermission('oa:purchase:receipt') && <Button disabled={busy} onClick={() => void retry()}>{busy ? '重试中…' : '按原收货请求重试'}</Button>}
  </>}>
    <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2">{[['供应商', source.supplierName], ['采购状态', source.status], ['采购事由', source.reason], ['创建人', source.userName]].map(([label, value]) => <div key={label}><dt className="text-xs text-cf-subtle">{label}</dt><dd className="mt-1 break-words text-sm">{value || '—'}</dd></div>)}</dl>
      <div className="overflow-x-auto"><table className="unity-data-table min-w-[500px]"><thead><tr><th>采购耗材</th><th>采购量</th><th>有效已收量</th></tr></thead><tbody>{source.items?.map((item) => <tr key={item.id}><td>{item.consumableName}</td><td>{item.quantity} {item.unit}</td><td>{item.receivedQuantity ?? 0} {item.unit}</td></tr>)}</tbody></table></div>
      <ConsumableMutationNotice error={failure} pending={!!pending} operationKey={pending?.operationKey} onDiscard={discard} busy={busy} />
      {pending && <p className="text-sm text-cf-subtle">待确认原明细：{pending.items.map((item) => `#${item.itemId} 数量 ${item.quantity}`).join('、')}；原版本 {pending.purchaseVersion}。</p>}
      {result && <p role="status" className="text-sm">{result.replayed ? '已恢复首次收货结果。' : '收货已记账。'}台账：{result.ledgerIds.join('、')}。</p>}
      <section><h3 className="mb-2 text-sm font-medium">真实收货记录</h3><p className="mb-3 text-xs text-cf-subtle">原记录始终保留；已冲正记录通过关联台账识别，不再计入有效已收量。</p>
        <div className="overflow-x-auto"><table className="unity-data-table min-w-[700px]"><thead><tr><th>收货编号 / 时间</th><th>耗材</th><th>本笔数量</th><th>有效状态</th><th>关联台账</th></tr></thead><tbody>
          <ConsumableTableState columns={5} loading={loading} error={error} empty={!data.rows.length} onRetry={() => void refresh()} />
          {!loading && !error && data.rows.map((row) => <tr key={row.id}><td>#{row.id}<div className="text-xs text-cf-subtle">{row.receiptTime}</div></td><td>{row.consumableName}</td><td>{row.receivedQuantity} {source.items?.find((item) => String(item.id) === String(row.itemId))?.unit}</td><td>{row.reversed ? '已冲正' : '有效收货'}</td><td><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => onOpenLedger(row.ledgerId)}>原流水 #{row.ledgerId}</Button>{row.reversalLedgerId && <Button size="sm" variant="ghost" onClick={() => onOpenLedger(row.reversalLedgerId!)}>冲正 #{row.reversalLedgerId}</Button>}</div></td></tr>)}
        </tbody></table></div>
        <ConsumablePagination total={data.total} page={page} onChange={setPage} />
      </section>
    </div>
  </BaseDialog>;
}
