import { useState } from 'react';
import { Button, Input, Textarea } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { consumableLedgerApi, type ConsumableLedgerRow, type ConsumablePosting, type ConsumableReturnCommand, type ConsumableReverseCommand } from '@/services/api/consumableLedger';
import { ConsumableField, ConsumableMutationNotice, positiveQuantity, useConsumableMutation } from './consumableUi';
import { ConsumablePostingResult } from './ConsumableStockDialog';

export default function ConsumableLedgerActionDialog({ row, action, onClose, onSaved }: { row: ConsumableLedgerRow; action: 'return' | 'reverse'; onClose: () => void; onSaved: () => void }) {
  type Command = ConsumableReturnCommand | ConsumableReverseCommand;
  const mutation = useConsumableMutation<Command, ConsumablePosting>(`ledger:${row.ledgerId}:${action}`, (body) => action === 'return' ? consumableLedgerApi.returnStock(row.consumableId, body as ConsumableReturnCommand) : consumableLedgerApi.reverse(row.ledgerId, body));
  const [quantity, setQuantity] = useState(mutation.frozen && 'quantity' in mutation.frozen ? String(mutation.frozen.quantity) : '1');
  const [remark, setRemark] = useState(mutation.frozen?.remark ?? '');
  const locked = mutation.busy || !!mutation.frozen || !!mutation.result;
  const submit = async () => {
    const result = await mutation.run((operationKey) => {
      if (!remark.trim() || remark.trim().length > 255) throw new Error('请填写1至255字的业务原因');
      if (row.sourceBizType !== 'MANUAL' && row.sourceVersion == null) throw new Error('来源单据版本缺失，请重新打开台账详情');
      const operation = { operationKey, remark: remark.trim() };
      if (action === 'return') return { ...operation, quantity: positiveQuantity(quantity), sourceLedgerId: row.ledgerId, requestVersion: row.sourceVersion! };
      return { ...operation, ...(row.sourceBizType === 'PURCHASE_RECEIPT' ? { purchaseVersion: row.sourceVersion } : row.sourceBizType === 'CONSUMABLE_REQUEST' ? { requestVersion: row.sourceVersion } : {}) };
    });
    if (result) onSaved();
  };
  return <BaseDialog open title={`${action === 'return' ? '登记实物退回' : '整笔冲正'} · ${row.consumableName}`} description={`原台账 #${row.ledgerId} · ${row.quantity} ${row.unit}`} onClose={() => { if (!mutation.busy) onClose(); }} width="wide"
    footer={<><Button variant="outline" onClick={onClose} disabled={mutation.busy}>{mutation.result ? '完成' : '关闭'}</Button>{!mutation.result && <Button onClick={() => void submit()} disabled={mutation.busy}>{mutation.busy ? '处理中…' : mutation.frozen ? '按原请求重试' : action === 'return' ? '确认收到实物并记账' : '确认整笔冲正'}</Button>}</>}>
    <div className="space-y-4"><ConsumableMutationNotice error={mutation.error} pending={!!mutation.frozen} operationKey={mutation.frozen?.operationKey} busy={mutation.busy} onDiscard={() => { mutation.discard(); onClose(); }} />
      {mutation.result ? <ConsumablePostingResult result={mutation.result} /> : <fieldset disabled={locked} className="space-y-4">
        <p className="rounded-md bg-[var(--cf-surface-muted)] p-3 text-sm text-cf-body">{action === 'return' ? `原发料 ${Math.abs(row.quantity)} ${row.unit}，累计已退 ${row.returnedQuantity} ${row.unit}。退回成本从原发料分摊，退回不恢复批准发料额度。` : '仅允许冲正本耗材紧邻最新的一笔原流水；已冲正、有后续流水、已有退回引用或已关联付款的采购收货均拒绝。整笔反向记账同时更新来源单据累计，历史流水保留。'}</p>
        {action === 'return' && <ConsumableField label={`本次退回数量（${row.unit}）`}><Input type="number" min="1" step="1" max={Math.abs(row.quantity) - row.returnedQuantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></ConsumableField>}
        <ConsumableField label="业务原因"><Textarea value={remark} onChange={(event) => setRemark(event.target.value)} maxLength={255} rows={3} /></ConsumableField>
      </fieldset>}
    </div>
  </BaseDialog>;
}
