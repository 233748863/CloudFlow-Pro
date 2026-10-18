import { useState } from 'react';
import { Button, Input, Switch, Textarea } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { consumableRequestApi, type ConsumableIssueCommand, type ConsumableIssueResult, type ConsumableRequestView } from '@/services/api/consumableLedger';
import { ConsumableField, ConsumableMutationNotice, positiveQuantity, useConsumableMutation } from './consumableUi';

export default function ConsumableIssueDialog({ request, onClose, onSaved }: { request: ConsumableRequestView; onClose: () => void; onSaved: () => void }) {
  const mutation = useConsumableMutation<ConsumableIssueCommand, ConsumableIssueResult>(`request:issue:${request.requestId}`, (body) => consumableRequestApi.issue(request.requestId, body));
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(request.items.map((item) => [item.itemId, String(mutation.frozen ? mutation.frozen.items.find((line) => line.itemId === item.itemId)?.quantity ?? 0 : item.approvedQuantity - item.issuedQuantity)])));
  const [partial, setPartial] = useState(mutation.frozen?.allowPartial ?? false);
  const [remark, setRemark] = useState(mutation.frozen?.remark ?? '');
  const locked = mutation.busy || !!mutation.frozen || !!mutation.result;
  const issue = async () => {
    const response = await mutation.run((operationKey) => {
      if (!remark.trim()) throw new Error('请填写发料原因');
      const items = request.items.map((item) => ({ itemId: item.itemId, quantity: positiveQuantity(quantities[item.itemId], true) })).filter((item) => item.quantity > 0);
      if (!items.length) throw new Error('至少一项本次发料数量大于0');
      return { operationKey, version: request.version, allowPartial: partial, remark: remark.trim(), items };
    });
    if (response) onSaved();
  };
  return <BaseDialog open title={`分批发料 · ${request.requestNo}`} description={`${request.applicantName} · ${request.deptName}；用途：${request.purpose}`} onClose={() => { if (!mutation.busy) onClose(); }} width="extra-wide"
    footer={<><Button variant="outline" onClick={onClose} disabled={mutation.busy}>{mutation.result ? '完成' : '关闭'}</Button>{!mutation.result && <Button onClick={() => void issue()} disabled={mutation.busy}>{mutation.busy ? '记账中…' : mutation.frozen ? '按原请求重试' : '确认本批发料'}</Button>}</>}>
    <div className="space-y-4"><ConsumableMutationNotice error={mutation.error} pending={!!mutation.frozen} operationKey={mutation.frozen?.operationKey} busy={mutation.busy} onDiscard={() => { mutation.discard(); onClose(); }} />
      {mutation.result ? <div role="status" className="space-y-3"><p>{mutation.result.replayed ? '本次重试返回首次发料结果，未重新分配库存。' : '本批发料已记账。'}</p><table className="unity-data-table"><thead><tr><th>耗材</th><th>本次请求</th><th>实发</th><th>本次未满足</th><th>台账</th></tr></thead><tbody>{mutation.result.rows.map((row) => <tr key={row.itemId}><td>{request.items.find((item) => item.itemId === row.itemId)?.consumableName ?? `明细#${row.itemId}`}</td><td>{row.requestedQuantity}</td><td>{row.issuedQuantity}</td><td>{row.shortageQuantity}</td><td>{row.ledgerId ? `#${row.ledgerId}` : '本行未发料'}</td></tr>)}</tbody></table><p className="text-sm text-cf-subtle">零实发行也保留原结果；下一批须关闭后刷新申请再发料。</p></div> : <fieldset disabled={locked} className="space-y-4"><div className="overflow-x-auto"><table className="unity-data-table min-w-[780px]"><thead><tr><th>耗材</th><th>单位</th><th>申请</th><th>批准</th><th>累计已发</th><th>累计已退</th><th>待发</th><th>本批发料</th></tr></thead><tbody>{request.items.map((item) => <tr key={item.itemId}><td>{item.consumableName}<div className="text-xs text-cf-subtle">{item.model || '—'}</div></td><td>{item.unit}</td><td>{item.applyQuantity}</td><td>{item.approvedQuantity}</td><td>{item.issuedQuantity}</td><td>{item.returnedQuantity}</td><td>{item.approvedQuantity - item.issuedQuantity}</td><td><Input aria-label={`${item.consumableName}本批发料量`} type="number" step="1" min="0" max="2147483647" value={quantities[item.itemId]} onChange={(event) => setQuantities((previous) => ({ ...previous, [item.itemId]: event.target.value }))} /></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between gap-4 rounded-md bg-[var(--cf-surface-muted)] p-3"><div><p className="text-sm font-medium">允许部分发料</p><p className="mt-1 text-xs text-cf-subtle">关闭时，任一行库存或批准额度不足即整批失败；开启后按实际可发数量记账，整批零实发仍失败。</p></div><Switch aria-label="允许部分发料" checked={partial} disabled={locked} onCheckedChange={setPartial} /></div><ConsumableField label="发料原因"><Textarea value={remark} onChange={(event) => setRemark(event.target.value)} maxLength={255} rows={3} /></ConsumableField>
      </fieldset>}
    </div>
  </BaseDialog>;
}
