import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/common';
import { crmApi, type CrmOpportunity } from '@/services/api/crm';
import { opportunityStages, type OpportunityItemInput, type OpportunityItems } from '@/services/api/crm/opportunityStages';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { Empty, Field, Metric, money, OpsSelect, useMutation, useRemote } from '../operations/OperationsKit';
import './opportunity.css';

type DraftLine = OpportunityItemInput & { clientKey: string };
const draftLine = (source?: OpportunityItemInput): DraftLine => ({ clientKey: crypto.randomUUID(), productId: source?.productId,
  productNo: source?.productNo || '', productName: source?.productName || '', spec: source?.spec || '', unit: source?.unit || '',
  quantity: source?.quantity ?? '1', unitPrice: source?.unitPrice ?? '0', discountRate: source?.discountRate ?? '100', taxRate: source?.taxRate ?? '0', remark: source?.remark || '' });
const payloadLine = ({ clientKey, ...line }: DraftLine): OpportunityItemInput => line;

export function OpportunityItemsPanel({ opportunity, onChange, onDirtyChange, onBusyChange }: { opportunity: CrmOpportunity; onChange: (opportunity: CrmOpportunity) => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }) {
  const { hasPermission } = useAuth();
  const id = opportunity.opportunityId!;
  const remote = useRemote(() => opportunityStages.items(id), [id]);
  const [draft, setDraft] = useState<{ version: number; items: DraftLine[] }>();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<{ detail: CrmOpportunity; items: OpportunityItems }>();
  const [search, setSearch] = useState('');
  const mutation = useMutation();
  const products = useRemote(() => hasPermission('crm:product:list') ? crmApi.listProducts({ pageNum: 1, pageSize: 100, productName: search || undefined, status: 'ACTIVE' }) : Promise.resolve({ rows: [] }), [search]);
  const editable = hasPermission('crm:opportunity:items') && opportunity.status === 'OPEN';
  useEffect(() => { if (remote.data && !draft) setDraft({ version: remote.data.version, items: remote.data.items.map(draftLine) }); }, [remote.data, draft]);
  useEffect(() => { onDirtyChange(dirty); onBusyChange(mutation.busy); }, [dirty, mutation.busy, onDirtyChange, onBusyChange]);
  const change = (key: string, patch: Partial<OpportunityItemInput>) => {
    setDraft(previous => previous && ({ ...previous, items: previous.items.map(line => line.clientKey === key ? { ...line, ...patch } : line) })); setDirty(true);
  };
  const save = () => void mutation.run(async () => {
    setError('');
    try {
      if (!draft || !editable) throw new Error('产品版本或写权限不可用');
      return await opportunityStages.saveItems(id, { version: draft.version, items: draft.items.map(payloadLine) });
    } catch (failure) { setError(getErrorMessage(failure, '保存产品失败')); throw failure; }
  }, result => {
    remote.setData(result); setDraft({ version: result.version, items: result.items.map(draftLine) }); setDirty(false); setLatest(undefined);
    onChange({ ...opportunity, version: result.version, expectedAmount: Number(result.expectedAmount), weightedAmount: Number(result.weightedAmount) });
  }, '产品明细和商机金额已保存');
  const readLatest = () => void mutation.run(async () => {
    const [items, detail] = await Promise.all([opportunityStages.items(id), crmApi.getOpportunityDetail(id)]);
    if (items.version !== detail.version) throw new Error('读取期间商机再次变化，请重新读取');
    return { items, detail };
  }, setLatest, '');
  return <section className="crm-opportunity-panel space-y-4" aria-label="商机产品明细">
    {(error || remote.error) && <div className="crm-ops-warning space-y-2"><p role="alert">{error || remote.error}；未保存明细仍保留。</p><Button variant="outline" disabled={mutation.busy} onClick={draft ? readLatest : remote.refresh}>{draft ? '读取最新明细（保留草稿）' : '重新读取明细'}</Button></div>}
    {latest && <div className="crm-ops-warning space-y-2"><p>草稿版本 {draft?.version}；最新版本 {latest.items.version}；最新已保存明细 {latest.items.items.length} 行，未税小计 {money(latest.items.subtotal)} 元。</p><details><summary className="cursor-pointer py-3">核对最新产品</summary>{latest.items.items.map((line, index) => <p key={line.itemId ?? index}>{line.productName} / 数量 {line.quantity} / 单价 {line.unitPrice} / 折扣 {line.discountRate}% / 税率 {line.taxRate}% / 未税金额 {money(line.lineAmount)}</p>)}</details><Button variant="outline" disabled={mutation.busy || latest.detail.status !== 'OPEN'} onClick={() => { setDraft(previous => previous && ({ ...previous, version: latest.items.version })); remote.setData(latest.items); onChange(latest.detail); setLatest(undefined); setError(''); }}>已核对，保留草稿并采用最新版本</Button></div>}
    {remote.loading && <p role="status">正在读取产品明细…</p>}
    {remote.data && <div className="grid gap-3 sm:grid-cols-3"><Metric label="已保存未税小计（元）" value={money(remote.data.subtotal)} /><Metric label="已保存税额（元）" value={money(remote.data.taxAmount)} /><Metric label="已保存含税合计（元）" value={money(remote.data.totalAmount)} /></div>}
    <p className="text-sm text-cf-muted">版本 {draft?.version ?? '读取中'} · 金额与报价采用相同口径，保存时由服务器逐行四舍五入到分；加权预计金额采用未税小计。{dirty ? '当前草稿有未保存修改，合计仍为上次保存值。' : ''}</p>
    {editable && hasPermission('crm:product:list') && <Field label="筛选产品目录（最多显示100个匹配项）"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="输入产品名称；也可填写自定义产品" /></Field>}
    {products.error && <p role="alert" className="crm-ops-warning">{products.error}</p>}
    {draft && <>
      <div className="crm-opportunity-scroll" tabIndex={0} role="region" aria-label="产品明细，可横向滚动">
        <table className="unity-data-table crm-product-lines"><thead><tr>{['产品 / 编号 / 规格', '数量 / 单位', '单价（元）', '折扣（%）', '税率（%）', '未税金额 / 税额', '备注', '操作'].map(header => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{draft.items.map((line, index) => <tr key={line.clientKey}>
            <td className="space-y-2">{editable && hasPermission('crm:product:list') && <OpsSelect label={`第${index + 1}行产品目录`} value={line.productId ?? ''} empty="自定义产品" disabled={mutation.busy} options={{ ...Object.fromEntries((products.data?.rows || []).filter(product => !product.currency || product.currency === 'CNY').map(product => [String(product.productId), product.productName])), ...(line.productId ? { [String(line.productId)]: line.productName } : {}) }} onChange={value => {
              const selected = products.data?.rows.find(product => product.productId === Number(value));
              if (!value) change(line.clientKey, { productId: undefined });
              else if (selected) change(line.clientKey, { productId: selected.productId, productNo: selected.productNo, productName: selected.productName, spec: selected.spec, unit: selected.unit, unitPrice: String(selected.standardPrice ?? 0) });
            }} />}
              <Input data-product-name aria-label={`第${index + 1}行产品名称`} disabled={!editable || Boolean(line.productId) || mutation.busy} value={line.productName} maxLength={200} onChange={event => change(line.clientKey, { productName: event.target.value })} />
              <Input aria-label={`第${index + 1}行产品编号`} disabled={!editable || Boolean(line.productId) || mutation.busy} value={line.productNo || ''} maxLength={64} onChange={event => change(line.clientKey, { productNo: event.target.value })} placeholder="产品编号" />
              <Input aria-label={`第${index + 1}行规格`} disabled={!editable || Boolean(line.productId) || mutation.busy} value={line.spec || ''} maxLength={200} onChange={event => change(line.clientKey, { spec: event.target.value })} placeholder="规格" /></td>
            <td className="space-y-2"><Input type="number" aria-label={`第${index + 1}行数量`} min="0.0001" max="9999999999.9999" step="0.0001" value={line.quantity} disabled={!editable || mutation.busy} onChange={event => change(line.clientKey, { quantity: event.target.value })} /><Input aria-label={`第${index + 1}行单位`} maxLength={30} value={line.unit || ''} disabled={!editable || Boolean(line.productId) || mutation.busy} onChange={event => change(line.clientKey, { unit: event.target.value })} placeholder="单位" /></td>
            <td><Input type="number" aria-label={`第${index + 1}行单价`} min="0" max="9999999999.9999" step="0.0001" value={line.unitPrice} disabled={!editable || mutation.busy} onChange={event => change(line.clientKey, { unitPrice: event.target.value })} /></td>
            <td><Input type="number" aria-label={`第${index + 1}行折扣`} min="0" max="100" step="0.0001" value={line.discountRate} disabled={!editable || mutation.busy} onChange={event => change(line.clientKey, { discountRate: event.target.value })} /></td>
            <td><Input type="number" aria-label={`第${index + 1}行税率`} min="0" max="100" step="0.0001" value={line.taxRate} disabled={!editable || mutation.busy} onChange={event => change(line.clientKey, { taxRate: event.target.value })} /></td>
            <td>{dirty ? '保存后计算' : money(remote.data?.items[index]?.lineAmount)}<small>{dirty ? '未提交' : money(remote.data?.items[index]?.taxAmount)}</small></td>
            <td><Input aria-label={`第${index + 1}行备注`} maxLength={500} value={line.remark || ''} disabled={!editable || mutation.busy} onChange={event => change(line.clientKey, { remark: event.target.value })} /></td>
            <td>{editable && <Button variant="outline" aria-label={`删除第${index + 1}行产品`} disabled={mutation.busy} onClick={() => { setDraft(previous => previous && ({ ...previous, items: previous.items.filter(item => item.clientKey !== line.clientKey) })); setDirty(true); }}><Trash2 size={16} /></Button>}</td>
          </tr>)}</tbody></table>
      </div>
      {!draft.items.length && <Empty text="暂无产品明细，预计金额保留手填值" />}
      {editable && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={mutation.busy || draft.items.length >= 200} onClick={() => { setDraft(previous => previous && ({ ...previous, items: [...previous.items, draftLine()] })); setDirty(true); }}><Plus size={16} />新增产品</Button><Button disabled={mutation.busy || !dirty} onClick={save}>保存产品明细</Button><span className="self-center text-sm text-cf-muted">{draft.items.length} / 200 行</span></div>}
    </>}
    {!editable && <p className="text-sm text-cf-muted">{opportunity.status === 'OPEN' ? '当前账号只能查看产品明细。' : '商机已结案，产品与金额只读。'}</p>}
  </section>;
}
