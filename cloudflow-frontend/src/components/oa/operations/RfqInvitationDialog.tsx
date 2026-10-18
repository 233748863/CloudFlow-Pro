import React, { useState } from 'react';
import { Button, Input } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import type { PageResult } from '@/types';
import { oaGet, oaPost, pageRows, type OaPurchaseRfq, type OaPurchaseRfqSupplier, type SysSupplier } from '@/services/api/oaOperations';
import { useAccess, useMutation, useRemote } from './OperationsKit';
import { isSupplierBlacklistBlocked, supplierBlacklistNotice } from '@/utils/supplierAdmission';

interface Props {
  rfq: OaPurchaseRfq;
  invited: OaPurchaseRfqSupplier[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function RfqInvitationDialog({ rfq, invited, onClose, onSaved }: Props) {
  const can = useAccess();
  const mutation = useMutation();
  const [channel, setChannel] = useState('OFFLINE');
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const canListSuppliers = can('oa:supplier:list');
  const readiness = useRemote(() => oaGet<{ ready: boolean; reason: string }>('/rfq/email-readiness'));
  const suppliers = useRemote<PageResult<SysSupplier> | undefined>(() => canListSuppliers
    ? oaGet<PageResult<SysSupplier>>('/supplier/list', { pageNum: page, pageSize: 20, supplierName: keyword || undefined, status: 'ACTIVE' })
    : Promise.resolve(undefined), [canListSuppliers, page, keyword]);
  const pages = Math.max(1, Math.ceil(Number(suppliers.data?.total || 0) / 20));
  const eligible = pageRows(suppliers.data).filter(supplier => !invited.some(existing => String(existing.supplierId) === String(supplier.supplierId)
    && (existing.inviteChannel !== 'EMAIL' || existing.inviteDeliveryStatus !== 'FAILED')));
  const sending = channel === 'EMAIL';
  const save = () => mutation.run(() => oaPost<{ queued: number; registered: number; retained: number }>('/rfq/' + rfq.rfqId + '/invite', {
    version: rfq.version, channel, supplierIds: selected.map(Number),
  }), result => {
    onSaved(`邮件排队 ${result.queued} 家，电话或线下登记 ${result.registered} 家，复用已有邀请 ${result.retained} 家。`);
    onClose();
  }, '邀请登记已保存');
  return <BaseDialog open title="邀请供应商" onClose={() => { if (!mutation.busy) onClose(); }} footer={<>
    <Button className="!min-h-[44px]" variant="outline" disabled={mutation.busy} onClick={onClose}>取消</Button>
    <Button className="!min-h-[44px]" disabled={!selected.length || mutation.busy || (sending && !readiness.data?.ready)} onClick={() => void save()}>{sending ? '登记邮件投递' : '登记邀请'}</Button>
  </>}><div className="oa-operations space-y-4">
    <p role="status" className={readiness.data?.ready ? 'text-cf-muted' : 'oa-ops-warning'}>{readiness.loading ? '正在核验邮件配置' : readiness.data?.reason || '邮件配置无法核验，邮件未发送；可登记电话或线下邀请。'}</p>
    <label className="block space-y-2"><span>邀请方式</span><select aria-label="邀请方式" className="!min-h-[44px] w-full" value={channel} disabled={mutation.busy} onChange={event => setChannel(event.target.value)}>
      <option value="OFFLINE">线下联系</option><option value="PHONE">电话联系</option><option value="EMAIL" disabled={!readiness.data?.ready}>邮件邀请</option>
    </select></label>
    <p className="text-sm text-cf-muted">邮件逐家独立发送，不包含其他供应商信息；排队记录不计入已邀请，邮件服务接纳后更新结果。</p>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setKeyword(search.trim()); setPage(1); }}>
      <label className="min-w-0 flex-1 space-y-2"><span>供应商名称</span><Input aria-label="供应商名称" className="!min-h-[44px] w-full" maxLength={200} value={search} disabled={mutation.busy || !canListSuppliers} onChange={event => setSearch(event.target.value)} /></label>
      <Button className="!min-h-[44px]" type="submit" variant="outline" disabled={mutation.busy || !canListSuppliers}>搜索供应商</Button>
    </form>
    {suppliers.error && <p role="alert">{suppliers.error}<Button className="!min-h-[44px]" variant="link" disabled={mutation.busy} onClick={suppliers.refresh}>重新加载供应商</Button></p>}
    {!canListSuppliers && <p role="alert">当前账号没有供应商查询权限。</p>}
    {suppliers.loading && <p role="status">正在加载供应商</p>}
    <fieldset className="space-y-2" disabled={mutation.busy}><legend className="mb-2">选择供应商（已选 {selected.length} 家，最多 200 家）</legend>
      {eligible.map(supplier => <label key={supplier.supplierId} className={'flex min-h-[44px] items-center gap-3 rounded px-2' + (supplier.blacklistFlag === 1 ? ' text-red-700 dark:text-red-300' : '')}>
        <input type="checkbox" checked={selected.includes(String(supplier.supplierId))} disabled={isSupplierBlacklistBlocked(supplier) || selected.length >= 200 && !selected.includes(String(supplier.supplierId))} onChange={event => setSelected(values => event.target.checked ? values.length < 200 ? [...new Set([...values, String(supplier.supplierId)])] : values : values.filter(value => value !== String(supplier.supplierId)))} />
        <span className="min-w-0 break-words">{supplier.supplierName} · {supplier.contactName}{supplier.blacklistFlag === 1 && <span> · {supplierBlacklistNotice(supplier)}</span>}{supplier.standing === 'WATCH' && <span className="oa-ops-warning"> · 观察级，请谨慎选择</span>}</span>
      </label>)}
      {!suppliers.loading && !suppliers.error && eligible.length === 0 && <p className="text-cf-muted">本页没有可新增邀请的供应商，可翻页或搜索。</p>}
    </fieldset>
    <nav aria-label="供应商分页" className="flex flex-wrap items-center justify-between gap-2">
      <Button className="!min-h-[44px]" variant="outline" disabled={mutation.busy || suppliers.loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页供应商</Button>
      <span role="status" className="text-sm text-cf-muted">第 {page} 页{!suppliers.loading && ` / 共 ${pages} 页`}</span>
      <Button className="!min-h-[44px]" variant="outline" disabled={mutation.busy || suppliers.loading || page >= pages} onClick={() => setPage(value => value + 1)}>下一页供应商</Button>
    </nav>
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-cf-muted">翻页和搜索会保留已选供应商。</span><Button className="!min-h-[44px]" variant="link" disabled={mutation.busy || selected.length === 0} onClick={() => setSelected([])}>清空已选</Button></div>
  </div></BaseDialog>;
}
