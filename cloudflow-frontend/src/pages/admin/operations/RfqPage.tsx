import React, { useState } from 'react';
import { addDays, format } from 'date-fns';
import { Button, Input } from '@/components/common';
import type { PageResult } from '@/types';
import { purchaseRequestApi, type PurchaseRequest } from '@/services/api/purchase';
import { oaGet, oaPost, pageRows, type RfqDetail, type OaPurchaseRfq } from '@/services/api/oaOperations';
import { OperationsPage, OpsTable, OpsSelect, labelOf, money, useRemote, useAccess } from '@/components/oa/operations/OperationsKit';
import { RecordEditor, optionsOf } from '@/components/oa/operations/RecordEditor';
import RfqDraftEditor from '@/components/oa/operations/RfqDraftEditor';
import RfqWorkspace, { rfqStatuses } from '@/components/oa/operations/RfqWorkspace';

export default function RfqPage() {
  const can = useAccess(); const [page, setPage] = useState(1); const [title, setTitle] = useState(''); const [status, setStatus] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null); const [draft, setDraft] = useState<RfqDetail | null>(null); const [source, setSource] = useState<{ purchaseId?: number; deadline: string } | null>(null);
  const deadline = () => format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const list = useRemote(() => oaGet<PageResult<OaPurchaseRfq>>('/rfq', { pageNum: page, pageSize: 10, title: title || undefined, status: status || undefined }), [page, title, status]);
  const purchases = useRemote<PageResult<PurchaseRequest> | undefined>(() => can('oa:purchase:list') && can('oa:rfq:edit') ? purchaseRequestApi.list({ pageNum: 1, pageSize: 200, status: 'DRAFT' }) : Promise.resolve(undefined));
  return <OperationsPage title="询价比价" description="线下邀请、保密报价、横向比价与审批定标，成交结果直接生成采购草稿。" loading={list.loading} error={list.error} refresh={list.refresh} actions={<>{can('oa:rfq:edit') && <><Button onClick={() => setDraft({ rfq: { quoteDeadline: deadline(), status: 'DRAFT' }, items: [] })}>新建询价</Button>{can('oa:purchase:list') && <Button variant="outline" onClick={() => setSource({ deadline: deadline() })}>从采购申请发起</Button>}</>}</>} filters={<div className="oa-ops-actions"><Input aria-label="搜索询价标题" placeholder="搜索询价标题" value={title} onChange={event => { setTitle(event.target.value); setPage(1); }} /><OpsSelect label="询价状态" value={status} options={rfqStatuses} empty="全部状态" onChange={value => { setStatus(value); setPage(1); }} /></div>}>
    <OpsTable headers={['询价编号 / 标题', '采购负责人', '截止日', '邀请 / 有效报价', '状态', '成交金额', '操作']} empty={!pageRows(list.data).length}>{pageRows(list.data).map(item => <tr key={item.rfqId}><td>{item.rfqNo}<div>{item.title}</div></td><td>{item.ownerName}</td><td>{item.quoteDeadline}</td><td>{item.invitedCount || 0} / {item.respondedCount || 0}</td><td>{item.instanceId && item.status !== 'AWARDED' ? '定标审批中' : labelOf(rfqStatuses, item.status)}</td><td>{money(item.awardedAmount)}</td><td><Button variant="link" onClick={() => setActiveId(item.rfqId!)}>查看详情</Button></td></tr>)}</OpsTable>
    <div className="oa-ops-actions"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><span>第 {page} 页 · 共 {list.data?.total || 0} 条</span><Button variant="outline" disabled={page * 10 >= (list.data?.total || 0)} onClick={() => setPage(page + 1)}>下一页</Button></div>
    {activeId && !draft && <RfqWorkspace key={activeId} id={activeId} onClose={() => setActiveId(null)} onEdit={setDraft} onChanged={list.refresh} onSelect={setActiveId} />}
    {draft && <RfqDraftEditor value={draft} onClose={() => setDraft(null)} onSaved={id => { setActiveId(id); list.refresh(); }} />}
    <RecordEditor title="从采购草稿发起询价" value={source} onClose={() => setSource(null)} onSave={async value => { const id = await oaPost<number>('/rfq/from-purchase/' + value.purchaseId, { deadline: value.deadline }); setActiveId(id); list.refresh(); }} fields={[
      { key: 'purchaseId', label: '原采购申请', type: 'select', numeric: true, required: true, options: optionsOf(pageRows(purchases.data).filter(item => !item.rfqId), 'id', 'purchaseNo') }, { key: 'deadline', label: '报价截止日', type: 'date', required: true },
    ]} />
  </OperationsPage>;
}
