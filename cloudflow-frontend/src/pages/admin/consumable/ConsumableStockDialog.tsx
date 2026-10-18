import { useEffect, useState } from 'react';
import { Button, Input, Textarea } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { consumableApi, type Consumable } from '@/services/api/consumable';
import { consumableLedgerApi, type ConsumableAdjustCommand, type ConsumablePosting, type ConsumableRecalculateCommand, type ConsumableRecalculation, type ConsumableStockCommand } from '@/services/api/consumableLedger';
import { ConsumableField, ConsumableMutationNotice, ConsumableSelect, moneyText, positiveQuantity, priceInput, useConsumableMutation } from './consumableUi';
import { getErrorMessage } from '@/utils/errorMessage';

export type ConsumableStockAction = 'inbound' | 'loss' | 'adjust-in' | 'adjust-out' | 'scrap' | 'recalculate';
const actionLabels: Record<ConsumableStockAction, string> = { inbound: '手工入库', loss: '盘亏出库', 'adjust-in': '盘盈调整', 'adjust-out': '盘亏调整', scrap: '耗材报废', recalculate: '库存核对 / 重算' };
type Command = ConsumableStockCommand | ConsumableAdjustCommand | ConsumableRecalculateCommand;

export function ConsumablePostingResult({ result }: { result: ConsumablePosting }) {
  return <div className="space-y-3" role="status"><p className="font-medium text-cf-title">{result.replayed ? '已返回首次成功记账结果' : '记账成功'}</p>
    <div className="overflow-x-auto"><table className="unity-data-table min-w-[520px]"><thead><tr><th>台账</th><th>本次增减</th><th>记账后库存</th>{result.rows.some((row) => row.amount !== undefined) && <th>本次成本</th>}</tr></thead><tbody>
      {result.rows.map((row) => <tr key={row.ledgerId}><td>#{row.ledgerId}</td><td>{row.quantity > 0 ? '+' : ''}{row.quantity} {row.unit}</td><td>{row.balanceAfter} {row.unit}</td>{row.amount !== undefined && <td>{moneyText(row.amount)}</td>}</tr>)}
    </tbody></table></div><p className="text-xs text-cf-subtle">以上为本次成功时的结果，当前结存请刷新台账确认。</p>
  </div>;
}

export default function ConsumableStockDialog({ id, action, onClose, onSaved }: { id: string; action: ConsumableStockAction; onClose: () => void; onSaved: () => void }) {
  const [material, setMaterial] = useState<Consumable | null>(null);
  const [loadError, setLoadError] = useState('');
  const send = (body: Command): Promise<ConsumablePosting | ConsumableRecalculation> => {
    if (action === 'recalculate') return consumableLedgerApi.recalculate(id, body as ConsumableRecalculateCommand);
    if (action === 'inbound') return consumableLedgerApi.inbound(id, body as ConsumableStockCommand);
    if (action === 'loss') return consumableApi.reduceStock(id, { ...body, stockOutType: 'LOSS' } as ConsumableStockCommand & { stockOutType: 'LOSS' }) as Promise<ConsumablePosting>;
    if (action === 'scrap') return consumableLedgerApi.scrap(id, body as ConsumableStockCommand);
    return consumableLedgerApi.adjust(id, body as ConsumableAdjustCommand);
  };
  const mutation = useConsumableMutation<Command, ConsumablePosting | ConsumableRecalculation>(`stock:${id}:${action}`, send);
  const [quantity, setQuantity] = useState(() => mutation.frozen && 'quantity' in mutation.frozen ? String(mutation.frozen.quantity) : '1');
  const [unitPrice, setUnitPrice] = useState(() => mutation.frozen && 'unitPrice' in mutation.frozen ? mutation.frozen.unitPrice ?? '' : '');
  const [remark, setRemark] = useState(mutation.frozen?.remark ?? '');
  const [mode, setMode] = useState<'CHECK' | 'REBUILD'>(mutation.frozen && 'mode' in mutation.frozen ? mutation.frozen.mode : 'CHECK');
  const locked = mutation.busy || !!mutation.frozen || !!mutation.result;
  const needsPrice = action === 'inbound' || action === 'adjust-in';
  const load = async () => {
    setLoadError('');
    try { setMaterial(await consumableApi.getInfo(id)); }
    catch (failure) { setLoadError(getErrorMessage(failure, '耗材详情加载失败')); }
  };
  useEffect(() => { void load(); }, [id]);
  const submit = async () => {
    const response = await mutation.run((operationKey) => {
      if (!remark.trim() || remark.trim().length > 255) throw new Error('请填写1至255字的业务原因');
      const operation = { operationKey, remark: remark.trim() };
      if (action === 'recalculate') {
        if (material?.version == null) throw new Error('缺少库存版本，请重新加载耗材');
        return { ...operation, version: material.version, mode };
      }
      return { ...operation, quantity: positiveQuantity(quantity), ...(needsPrice ? { unitPrice: priceInput(unitPrice.trim()) } : {}), ...(action.startsWith('adjust-') ? { direction: action === 'adjust-in' ? 'IN' as const : 'OUT' as const } : {}) };
    });
    if (response) onSaved();
  };
  return <BaseDialog open title={`${actionLabels[action]} · ${material?.name ?? `#${id}`}`} description={`当前库存 ${material?.quantity ?? '—'} ${material?.unit ?? ''}；库存和成本在同一次记账中更新。`} onClose={() => { if (!mutation.busy) onClose(); }} width="wide"
    footer={<><Button variant="outline" onClick={onClose} disabled={mutation.busy}>{mutation.result ? '完成' : '关闭'}</Button>{!mutation.result && <Button onClick={() => void submit()} disabled={mutation.busy || (!material && !mutation.frozen)}>{mutation.busy ? '处理中…' : mutation.frozen ? '按原请求重试' : action === 'recalculate' ? (mode === 'CHECK' ? '执行只读核对' : '确认重建缓存') : '确认记账'}</Button>}</>}>
    <div className="space-y-4">
      {loadError && <p role="alert" className="text-rose-600">{loadError} <Button variant="ghost" onClick={() => void load()}>重新加载</Button></p>}
      <ConsumableMutationNotice error={mutation.error} pending={!!mutation.frozen} operationKey={mutation.frozen?.operationKey} busy={mutation.busy} onDiscard={() => { mutation.discard(); onClose(); }} />
      {mutation.result ? 'rows' in mutation.result ? <ConsumablePostingResult result={mutation.result} /> : <div role="status" className="space-y-3"><p>{mutation.result.reason}</p><p>{mutation.result.consistent ? '缓存与台账一致' : '发现缓存差异'} · {mutation.result.changed ? '已按完整台账重建' : '未修改库存'}</p><table className="unity-data-table"><thead><tr><th>核对项</th><th>操作前</th><th>台账应有值</th><th>操作后</th></tr></thead><tbody><tr><td>库存数量</td><td>{mutation.result.before.quantity}</td><td>{mutation.result.expected.quantity}</td><td>{mutation.result.after?.quantity ?? mutation.result.before.quantity}</td></tr>{mutation.result.before.stockAmount !== undefined && <tr><td>库存成本</td><td>{moneyText(mutation.result.before.stockAmount)}</td><td>{moneyText(mutation.result.expected.stockAmount)}</td><td>{moneyText(mutation.result.after?.stockAmount ?? mutation.result.before.stockAmount)}</td></tr>}</tbody></table></div> : <fieldset disabled={locked} className="space-y-4">
        {action === 'recalculate' ? <><ConsumableField label="核对方式"><ConsumableSelect label="核对方式" value={mode} onChange={(value) => setMode(value as 'CHECK' | 'REBUILD')} options={[{ value: 'CHECK', label: 'CHECK · 只核对，不改库存' }, { value: 'REBUILD', label: 'REBUILD · 验证台账后重建缓存' }]} disabled={locked} /></ConsumableField><p className="text-sm text-cf-subtle">重建只修复缓存；台账历史不改写。发现来源或成本链不合法时停止处理。</p></> : <div className="grid gap-4 sm:grid-cols-2"><ConsumableField label={`本次数量（${material?.unit ?? '计量单位'}）`}><Input type="number" step="1" min="1" max="2147483647" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></ConsumableField>{needsPrice && <ConsumableField label="单价（元/计量单位）"><Input inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="必填；免费须填写0" /></ConsumableField>}</div>}
        <ConsumableField label="业务原因"><Textarea maxLength={255} value={remark} onChange={(event) => setRemark(event.target.value)} rows={3} /></ConsumableField>
      </fieldset>}
    </div>
  </BaseDialog>;
}
