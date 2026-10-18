import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { Pagination } from '@/components/common/Pagination';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { consumableApi } from '@/services/api/consumable';
import { consumableRequestApi, type ConsumableCatalogItem, type ConsumablePageResult } from '@/services/api/consumableLedger';
import { completeConsumableOperation, consumableOperationStorageKey, freezeConsumableOperation, newConsumableOperationKey, readConsumableOperation } from '@/services/api/consumableOperation';
import { getErrorMessage } from '@/utils/errorMessage';

export const requestStatusLabel = { DRAFT: '草稿', APPROVING: '审批中', APPROVED: '已批准', REJECTED: '已驳回', ISSUED: '已发足', CANCELLED: '已取消' };
export const transactionLabel = { INBOUND: '入库', OUTBOUND: '领用', ADJUST: '盘点调整', SCRAP: '报废', RETURN: '退回' };
export const sourceLabel = { MANUAL: '手工登记', PURCHASE_RECEIPT: '采购收货', CONSUMABLE_REQUEST: '领用申请' };
export const moneyText = (value?: string | null) => value == null ? '待估价' : `¥ ${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const dateWindow = (from: string, to: string) => {
  if (!from || !to || from > to) throw new Error('请选择有效的起止日期');
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const next = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { from: `${from}T00:00:00`, to: `${next}T00:00:00` };
};
export const positiveQuantity = (value: string | number, zero = false) => {
  if (!/^\d+$/.test(String(value))) throw new Error('数量必须为整数');
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < (zero ? 0 : 1) || quantity > 2147483647) throw new Error(`数量须为${zero ? 0 : 1}至2147483647的整数`);
  return quantity;
};
export const priceInput = (value: string) => {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) throw new Error('单价须为0至99999999.99，最多两位小数；免费须明确填写0');
  return value;
};

export function ConsumableField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="admin-dialog-field min-w-0"><span className="text-sm font-medium text-cf-body">{label}</span>{children}</label>;
}

export function ConsumableSelect({ value, onChange, options, label, disabled }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string; disabled?: boolean }) {
  return <Select value={value || 'ALL'} onValueChange={(next) => onChange(next === 'ALL' ? '' : next)} disabled={disabled}>
    <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map((option) => <SelectItem key={option.value || 'ALL'} value={option.value || 'ALL'}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function ConsumableTableState({ columns, loading, error, empty, onRetry }: { columns: number; loading: boolean; error: string; empty: boolean; onRetry: () => void }) {
  if (!loading && !error && !empty) return null;
  return <tr><td colSpan={columns} className="px-4 py-12 text-center text-cf-subtle">
    {loading ? <span role="status" className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />正在加载...</span> : error ? <div role="alert" className="space-y-3"><p>{error}</p><Button variant="outline" onClick={onRetry}>重新加载</Button></div> : '暂无符合条件的记录'}
  </td></tr>;
}

export function useConsumablePage<Row>(loader: () => Promise<ConsumablePageResult<Row>>) {
  const [data, setData] = useState<ConsumablePageResult<Row>>({ rows: [], total: 0, pageNum: 1, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try { const response = await loader(); if (current === sequence.current) setData(response); }
    catch (failure) { if (current === sequence.current) { setData((previous) => ({ ...previous, rows: [], total: 0 })); setError(getErrorMessage(failure, '加载失败')); } }
    finally { if (current === sequence.current) setLoading(false); }
  }, [loader]);
  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [refresh]);
  return { data, loading, error, refresh };
}

export function ConsumablePagination({ total, page, onChange }: { total: number; page: number; onChange: (page: number) => void }) {
  return <Pagination total={total} page={page} pageSize={10} onPageChange={onChange} onPageSizeChange={() => {}} showPageSizeSelector={false} />;
}

export function useConsumableMutation<Command extends { operationKey: string }, Result>(scope: string, send: (body: Command) => Promise<Result>) {
  const storageKey = consumableOperationStorageKey(scope);
  const [frozen, setFrozen] = useState<Command | null>(() => readConsumableOperation<Command>(storageKey));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setFrozen(readConsumableOperation<Command>(storageKey)); setResult(null); setError(''); }, [storageKey]);
  const run = async (build: (key: string) => Command) => {
    if (busyRef.current || result) return null;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const body = readConsumableOperation<Command>(storageKey) ?? freezeConsumableOperation(storageKey, build(newConsumableOperationKey()));
      setFrozen(body);
      const response = await send(body);
      completeConsumableOperation(storageKey); setResult(response); setFrozen(null);
      return response;
    } catch (failure) { setError(getErrorMessage(failure, '操作未确认成功，请保留原请求重试')); return null; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const discard = () => {
    if (busyRef.current) return;
    completeConsumableOperation(storageKey); setFrozen(null); setError('');
  };
  return { frozen, busy, result, error, run, discard };
}

export function ConsumableMutationNotice({ error, pending, operationKey, onDiscard, busy }: { error: string; pending: boolean; operationKey?: string; onDiscard?: () => void; busy?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (!error && !pending) return null;
  return <><div role={error ? 'alert' : 'status'} className="rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-3 text-sm text-cf-body">
    {error && <p>{error}</p>}{pending && <p className="mt-1 text-cf-subtle">已冻结本次参数；重试沿用原数量和版本，不重新分配库存。请求键：{operationKey}</p>}
    {pending && onDiscard && <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(true)}>核对后结束本次请求</Button>}
  </div><ConfirmDialog open={confirm} title="结束本次请求重试" message="此操作仅清除本机待重试参数，不撤销服务器上的记账或审批。请先核对台账和来源单据，确认结果后再开始一笔新业务，避免重复领用或入库。" confirmText="已核对，结束重试" cancelText="继续保留" danger onConfirm={() => { setConfirm(false); onDiscard?.(); }} onCancel={() => setConfirm(false)} /></>;
}

export function ConsumablePicker({ value, onSelect, disabled = false, management = false }: { value?: Pick<ConsumableCatalogItem, 'consumableId' | 'name' | 'unit'> | null; onSelect: (item: ConsumableCatalogItem) => void; disabled?: boolean; management?: boolean }) {
  const { hasPermission } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState({ keyword: '', pageNum: 1 });
  const loader = useCallback(async () => {
    if (!management && hasPermission('oa:consumable-request:lookup')) return consumableRequestApi.catalog({ ...query, pageSize: 10 });
    const response = await consumableApi.list({ name: query.keyword, pageNum: query.pageNum, pageSize: 10 });
    return { rows: (response.records ?? response.rows ?? []).map((item) => ({ consumableId: String(item.consumableId), name: item.name, model: item.model, unit: item.unit ?? '', quantity: item.quantity ?? 0, categoryId: item.categoryId == null ? undefined : String(item.categoryId) })), total: response.total, pageNum: query.pageNum, pageSize: 10 };
  }, [query, management, hasPermission]);
  const { data, loading, error, refresh } = useConsumablePage<ConsumableCatalogItem>(loader);
  return <div className="min-w-0 space-y-2 [&_.select-trigger]:!min-h-[44px]">
    <div className="flex gap-2"><Input className="!min-h-[44px] min-w-0" aria-label="搜索耗材目录" value={keyword} onChange={(event) => setKeyword(event.target.value)} disabled={disabled} placeholder="按名称查找耗材" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setQuery({ keyword: keyword.trim(), pageNum: 1 }); } }} /><Button type="button" className="!min-h-[44px]" variant="outline" disabled={disabled || loading} onClick={() => setQuery({ keyword: keyword.trim(), pageNum: 1 })}>查找</Button></div>
    <ConsumableSelect label="选择耗材" value={value?.consumableId ?? ''} disabled={disabled || loading} options={[{ value: '', label: loading ? '正在加载目录…' : '请选择耗材' }, ...(value && !data.rows.some((row) => row.consumableId === value.consumableId) ? [{ value: value.consumableId, label: `${value.name} · ${value.unit}` }] : []), ...data.rows.map((row) => ({ value: row.consumableId, label: `${row.name} · ${row.model || '无型号'} · ${row.unit}（可用 ${row.quantity}）` }))]} onChange={(id) => { const item = data.rows.find((row) => row.consumableId === id); if (item) onSelect(item); }} />
    {error && <button type="button" className="min-h-[44px] text-sm text-rose-600" disabled={disabled || loading} onClick={() => void refresh()}>{error} · 重试</button>}
    {data.total > 10 && <div className="flex items-center justify-end gap-2 text-xs text-cf-subtle"><Button type="button" className="!min-h-[44px]" aria-label="上一页耗材" size="sm" variant="ghost" disabled={disabled || loading || query.pageNum <= 1} onClick={() => setQuery((previous) => ({ ...previous, pageNum: previous.pageNum - 1 }))}>上一页</Button><span>{query.pageNum} / {Math.ceil(data.total / 10)}</span><Button type="button" className="!min-h-[44px]" aria-label="下一页耗材" size="sm" variant="ghost" disabled={disabled || loading || query.pageNum * 10 >= data.total} onClick={() => setQuery((previous) => ({ ...previous, pageNum: previous.pageNum + 1 }))}>下一页</Button></div>}
  </div>;
}
