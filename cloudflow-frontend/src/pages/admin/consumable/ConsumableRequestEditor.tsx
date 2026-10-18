import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, DatePicker, Input, Textarea } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { useAuth } from '@/context/AuthContext';
import { consumableRequestApi, type ConsumableCatalogItem, type ConsumableCreateRequest, type ConsumableRequestInput, type ConsumableRequestResult, type ConsumableRequestView } from '@/services/api/consumableLedger';
import { ConsumableField, ConsumableMutationNotice, ConsumablePicker, positiveQuantity, today, useConsumableMutation } from './consumableUi';
import { getErrorMessage } from '@/utils/errorMessage';

interface DraftLine { material: Pick<ConsumableCatalogItem, 'consumableId' | 'name' | 'model' | 'unit'>; quantity: string; remark: string }

export default function ConsumableRequestEditor({ initial, onClose, onSaved }: { initial?: ConsumableRequestView; onClose: () => void; onSaved: (result: ConsumableRequestResult) => void }) {
  const { user } = useAuth();
  const creation = useConsumableMutation<ConsumableCreateRequest, ConsumableRequestResult>(`request:create:${initial?.requestId ?? 'new'}`, consumableRequestApi.create);
  const [purpose, setPurpose] = useState(creation.frozen?.purpose ?? initial?.purpose ?? '');
  const [applyDate, setApplyDate] = useState(creation.frozen?.applyDate ?? initial?.applyDate ?? today());
  const [expectDate, setExpectDate] = useState(creation.frozen?.expectDate ?? initial?.expectDate ?? '');
  const [selected, setSelected] = useState<ConsumableCatalogItem | null>(null);
  const [lines, setLines] = useState<DraftLine[]>(() => creation.frozen ? creation.frozen.items.map((item) => ({ material: { consumableId: item.consumableId, name: `耗材 #${item.consumableId}`, unit: '—' }, quantity: String(item.applyQuantity), remark: item.remark ?? '' })) : initial?.items.map((item) => ({ material: { consumableId: item.consumableId, name: item.consumableName, model: item.model, unit: item.unit }, quantity: String(item.applyQuantity), remark: item.remark ?? '' })) ?? []);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const locked = editing || creation.busy || !!creation.frozen;
  const buildInput = (): ConsumableRequestInput => {
    if (!purpose.trim() || purpose.trim().length > 500) throw new Error('用途须为1至500字');
    if (!applyDate || expectDate && expectDate < applyDate) throw new Error('请选择申请日期，期望日期不能早于申请日期');
    if (!lines.length || lines.length > 100) throw new Error('申请须包含1至100项不同耗材');
    return { purpose: purpose.trim(), applyDate, expectDate: expectDate || undefined, items: lines.map((line) => ({ consumableId: line.material.consumableId, applyQuantity: positiveQuantity(line.quantity), remark: line.remark.trim() || undefined })) };
  };
  const save = async () => {
    if (initial) {
      if (editing) return;
      setEditing(true); setEditError('');
      try { onSaved(await consumableRequestApi.edit(initial.requestId, { ...buildInput(), version: initial.version })); }
      catch (failure) { setEditError(getErrorMessage(failure, '草稿保存失败')); }
      finally { setEditing(false); }
    } else {
      const result = await creation.run((operationKey) => ({ ...buildInput(), operationKey }));
      if (result) onSaved(result);
    }
  };
  const addLine = () => {
    if (!selected) return;
    if (lines.some((line) => line.material.consumableId === selected.consumableId)) { setEditError('该耗材已在明细中，请修改现有数量'); return; }
    if (lines.length >= 100) { setEditError('每单最多100项耗材'); return; }
    setLines((previous) => [...previous, { material: selected, quantity: '1', remark: '' }]); setSelected(null); setEditError('');
  };
  return <BaseDialog open title={initial ? `编辑领用申请 · ${initial.requestNo}` : '新建耗材领用申请'} description="提交后由服务器确定审批人并冻结原申请人；申请本身不预占或扣减库存。" onClose={() => { if (!editing && !creation.busy) onClose(); }} width="extra-wide"
    footer={<><Button variant="outline" onClick={onClose} disabled={editing || creation.busy}>关闭</Button><Button onClick={() => void save()} disabled={editing || creation.busy}>{editing || creation.busy ? '保存中…' : creation.frozen ? '按原请求重试' : '保存草稿'}</Button></>}>
    <div className="space-y-5"><ConsumableMutationNotice error={editError || creation.error} pending={!!creation.frozen} operationKey={creation.frozen?.operationKey} busy={creation.busy} onDiscard={() => { creation.discard(); onClose(); }} />
      <div className="grid gap-4 rounded-md bg-[var(--cf-surface-muted)] p-3 sm:grid-cols-2"><div><span className="text-xs text-cf-subtle">申请人（不可修改）</span><p className="text-sm">{initial?.applicantName ?? user?.name}</p></div><div><span className="text-xs text-cf-subtle">归属部门（不可修改）</span><p className="text-sm">{initial?.deptName ?? user?.deptName ?? '以账号有效部门为准'}</p></div></div>
      <fieldset disabled={locked} className="space-y-4"><ConsumableField label="领用用途"><Textarea maxLength={500} rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="说明用途和使用场景" /></ConsumableField><div className="grid gap-4 sm:grid-cols-2"><ConsumableField label="申请日期"><DatePicker type="date" value={applyDate} onChange={(event) => setApplyDate(event.target.value)} /></ConsumableField><ConsumableField label="期望领用日期（可选）"><DatePicker type="date" value={expectDate} onChange={(event) => setExpectDate(event.target.value)} /></ConsumableField></div>
        {!creation.frozen && <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"><ConsumableField label="从真实可领用目录添加"><ConsumablePicker value={selected} onSelect={setSelected} disabled={locked} /></ConsumableField><Button variant="outline" disabled={!selected || locked} onClick={addLine}><Plus size={16} />添加明细</Button></div>}
        <div className="overflow-x-auto"><table className="unity-data-table min-w-[700px]"><thead><tr><th>耗材 / 型号</th><th>单位</th><th>申请数量</th><th>明细说明</th><th>操作</th></tr></thead><tbody>{lines.length ? lines.map((line, index) => <tr key={line.material.consumableId}><td>{line.material.name}<div className="text-xs text-cf-subtle">{line.material.model || '—'}</div></td><td>{line.material.unit}</td><td><Input aria-label={`${line.material.name}申请数量`} type="number" min="1" step="1" max="2147483647" value={line.quantity} onChange={(event) => setLines((previous) => previous.map((item, position) => position === index ? { ...item, quantity: event.target.value } : item))} /></td><td><Input aria-label={`${line.material.name}明细说明`} value={line.remark} maxLength={255} onChange={(event) => setLines((previous) => previous.map((item, position) => position === index ? { ...item, remark: event.target.value } : item))} /></td><td><Button variant="ghost" size="sm" aria-label={`删除${line.material.name}`} onClick={() => setLines((previous) => previous.filter((_, position) => position !== index))}><Trash2 size={16} /></Button></td></tr>) : <tr><td colSpan={5} className="py-10 text-center text-cf-subtle">尚未添加耗材，请从目录选择。</td></tr>}</tbody></table></div>
      </fieldset><p className="text-xs text-cf-subtle">数量按每项计量单位填写，不跨单位合计。估价由服务器提交时计算，缺少有依据的价格仍须审批。</p>
    </div>
  </BaseDialog>;
}
