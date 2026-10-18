import React, { useState } from 'react';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { useAuth } from '@/context/AuthContext';
import { ConsumablePicker } from '@/pages/admin/consumable/consumableUi';
import { oaGet, oaPost, type RfqDetail, type OaPurchaseRfqSupplier, type OaSupplierQuotation, type QuotationDetail } from '@/services/api/oaOperations';
import { saveAuthorizedFile } from '@/services/api/file';
import { Section, OpsTable, Metric, money, labelOf, useRemote, useMutation, useAccess } from './OperationsKit';
import { RecordEditor, today } from './RecordEditor';
import QuotationEditor from './QuotationEditor';
import RfqComparisonPanel from './RfqComparisonPanel';
import RfqInvitationDialog from './RfqInvitationDialog';

export const rfqStatuses = { DRAFT: '草稿', SENT: '已邀请', QUOTING: '报价中', COMPARING: '比价中', AWARDED: '已定标', CANCELLED: '已取消', FAILED: '已流标' };
export default function RfqWorkspace({ id, onClose, onEdit, onChanged, onSelect }: { id: number; onClose: () => void; onEdit: (value: RfqDetail) => void; onChanged: () => void; onSelect: (id: number) => void }) {
  const can = useAccess(); const { user } = useAuth(); const mutation = useMutation();
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null); const [inviting, setInviting] = useState(false); const [notice, setNotice] = useState('');
  const [decline, setDecline] = useState<{ supplierId?: number; reason: string } | null>(null); const [end, setEnd] = useState<{ failed: number; reason: string } | null>(null);
  const [restart, setRestart] = useState<{ deadline: string } | null>(null); const [binding, setBinding] = useState<{ itemId?: number; consumableId?: number } | null>(null);
  const data = useRemote(async () => ({ detail: await oaGet<RfqDetail>('/rfq/' + id), suppliers: await oaGet<OaPurchaseRfqSupplier[]>('/rfq/' + id + '/suppliers'), quotations: can('oa:rfq:quote') ? await oaGet<OaSupplierQuotation[]>('/rfq/' + id + '/quotations') : [] }), [id]);
  const rfq = data.data?.detail.rfq; const owner = !!rfq && String(rfq.ownerId) === user?.id; const open = !!rfq && ['SENT', 'QUOTING'].includes(rfq.status || '') && !!rfq.quoteDeadline && rfq.quoteDeadline >= today();
  const frozen = data.data?.suppliers.some(supplier => supplier.inviteChannel === 'EMAIL' && supplier.inviteDeliveryStatus !== 'FAILED');
  const reached = (invitation: OaPurchaseRfqSupplier) => invitation.inviteChannel !== 'EMAIL' || !!invitation.inviteSentTime;
  const refresh = () => { data.refresh(); onChanged(); };
  const newQuote = (supplierId?: number) => setQuotation({ quotation: { rfqId: id, supplierId, quoteDate: today(), currency: 'CNY', status: 'DRAFT' }, items: (data.data?.detail.items || []).map(item => ({ rfqItemId: item.itemId, itemName: item.itemName, quantity: item.quantity, unit: item.unit, spec: item.spec, unitPrice: 0, discountRate: 1, taxRate: 0 })) });
  return <BaseDialog open title={rfq?.title || '询价详情'} width="full" onClose={onClose} footer={<Button variant="outline" onClick={onClose}>关闭</Button>}><div className="oa-operations space-y-5">
    {data.error && <p role="alert" className="oa-ops-warning">{data.error}</p>}{data.loading && <p role="status">正在加载询价</p>}
    {rfq && <><div className="grid gap-3 md:grid-cols-3"><Metric label="询价状态" value={rfq.instanceId && rfq.status !== 'AWARDED' ? '定标审批中' : labelOf(rfqStatuses, rfq.status)} detail={rfq.rfqNo} /><Metric label="报价截止日" value={rfq.quoteDeadline} detail={'有效响应 ' + (rfq.respondedCount || 0) + ' / 邀请 ' + (rfq.invitedCount || 0)} /><Metric label="成交含税金额" value={money(rfq.awardedAmount)} detail={rfq.awardedSupplierName} /></div>
      {notice && <p role="status">{notice}</p>}
      {rfq.status === 'DRAFT' && frozen && <p role="status" className="oa-ops-warning">邮件投递或结果核验期间，询价关键内容已冻结；尚未计入已邀请。</p>}
      <div className="oa-ops-actions"><Button variant="outline" onClick={refresh}>刷新</Button>{owner && rfq.status === 'DRAFT' && can('oa:rfq:edit') && <Button disabled={frozen} onClick={() => onEdit(data.data!.detail)}>编辑草稿</Button>}
        {owner && (rfq.status === 'DRAFT' || open) && can('oa:rfq:invite') && <Button onClick={() => setInviting(true)}>邀请供应商</Button>}
        {owner && !rfq.instanceId && !['AWARDED', 'FAILED', 'CANCELLED'].includes(rfq.status || '') && can('oa:rfq:terminate') && <Button variant="outline" onClick={() => setEnd({ failed: 0, reason: '' })}>取消或流标</Button>}
        {owner && ['FAILED', 'CANCELLED'].includes(rfq.status || '') && can('oa:rfq:edit') && <Button onClick={() => setRestart({ deadline: today() })}>重开新一轮</Button>}
        {owner && rfq.status === 'AWARDED' && can('oa:rfq:convert') && <Button disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost<{ purchaseNo?: string }>('/rfq/' + id + '/purchase'), refresh, '采购草稿已生成，可在采购申请中继续办理')}>生成采购申请</Button>}
        {owner && rfq.status === 'AWARDED' && can('oa:rfq:invite') && <Button className="!min-h-[44px]" variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost<number>('/rfq/' + id + '/notify-award', { version: rfq.version }), count => setNotice(`已登记 ${count} 家供应商的独立结果通知，实际接纳以消息投递记录为准。`), '结果通知已登记')}>逐家通知定标结果</Button>}
        {owner && rfq.attachmentUrl && <Button className="!min-h-[44px]" variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => saveAuthorizedFile({ bizType: 'OA_RFQ_INVITATION', bizId: String(id), reference: rfq.attachmentUrl }, '询价邀请附件'), undefined, '')}>下载本询价私有附件</Button>}
      </div>
      <Section title="需求与物料"><p className="mb-3">交付日期：{rfq.expectedDeliveryDate || '—'} · 地址：{rfq.deliveryAddress || '—'} · 付款：{rfq.paymentTerms || '—'}</p><p className="mb-3 whitespace-pre-wrap">{rfq.termsContent}</p><OpsTable headers={['物料', '规格 / 单位', '数量', '采购耗材关联', '操作']}>{data.data?.detail.items.map(item => <tr key={item.itemId}><td>{item.itemName}</td><td>{item.spec} / {item.unit}</td><td>{item.quantity}</td><td>{item.consumableId ? '已关联 #' + item.consumableId : '待关联'}</td><td>{owner && can('oa:rfq:edit') && can('oa:consumable:list') && <Button variant="link" onClick={() => setBinding({ itemId: item.itemId, consumableId: item.consumableId })}>关联耗材</Button>}</td></tr>)}</OpsTable></Section>
      <Section title="供应商邀请"><p className="mb-3 text-sm text-cf-muted">邮件服务接纳后才计入已邀请；结果待核验时请管理员核对原投递，避免重复发送。</p>
        <OpsTable headers={['供应商', '联系人', '邀请渠道 / 真实状态', '响应', '操作']} empty={!data.data?.suppliers.length}>{data.data?.suppliers.map(item => <tr key={item.rfqSupplierId}>
          <td>{item.supplierName}</td><td>{item.contactName} / {item.contactPhone}</td>
          <td>{labelOf({ EMAIL: '邮件', PHONE: '电话', OFFLINE: '线下' }, item.inviteChannel)} · {item.inviteTime}
            {item.inviteChannel === 'EMAIL' && <p>{labelOf({ QUEUED: '排队中，尚未发送', SENT: '邮件服务已接纳', FAILED: '未成功', UNKNOWN: '结果待核验' }, item.inviteDeliveryStatus)}{item.inviteSentTime && ' · ' + item.inviteSentTime}</p>}
          </td><td>{reached(item) ? labelOf({ INVITED: '待响应', RESPONDED: '已报价', DECLINED: '已拒绝', NO_RESPONSE: '未响应' }, item.quoteStatus) : '尚未确认邀请已发出'}<p>{item.declineReason}</p></td>
          <td><div className="oa-ops-actions">{open && reached(item) && item.quoteStatus === 'INVITED' && can('oa:rfq:quote') && <Button variant="link" onClick={() => newQuote(item.supplierId)}>代录报价</Button>}{owner && open && reached(item) && item.quoteStatus === 'INVITED' && can('oa:rfq:invite') && <Button variant="link" onClick={() => setDecline({ supplierId: item.supplierId, reason: '' })}>登记拒绝</Button>}</div></td>
        </tr>)}</OpsTable>
      </Section>
      {can('oa:rfq:quote') && <Section title="当前有权查看的报价"><div className="oa-quotation-records"><OpsTable headers={['供应商', '报价编号', '含税总额 / 币种', '状态', '操作']} empty={!data.data?.quotations.length}>{data.data?.quotations.map(item => <tr key={item.quotationId}><td data-field-label="供应商">{item.supplierName}</td><td data-field-label="报价编号">{item.quotationNo}</td><td data-field-label="含税总额 / 币种">{money(item.totalAmount)} {item.currency}</td><td data-field-label="状态">{labelOf({ DRAFT: '草稿', SUBMITTED: '已提交', WITHDRAWN: '已撤回' }, item.status)}</td><td data-field-label="操作"><div className="oa-ops-actions"><Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => oaGet<QuotationDetail>('/rfq/quotations/' + item.quotationId), setQuotation, '')}>查看报价</Button>{open && String(item.entryBy) === user?.id && <Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/rfq/quotations/' + item.quotationId + (item.status === 'SUBMITTED' ? '/withdraw' : '/submit')), refresh)}>{item.status === 'SUBMITTED' ? '撤回报价' : '提交报价'}</Button>}</div></td></tr>)}</OpsTable></div></Section>}
      <RfqComparisonPanel rfq={rfq} owner={owner} onChanged={refresh} />
    </>}
    <QuotationEditor value={quotation} suppliers={data.data?.suppliers || []} editable={open && can('oa:rfq:quote') && (!quotation?.quotation.quotationId || (String(quotation.quotation.entryBy) === user?.id && ['DRAFT', 'WITHDRAWN'].includes(quotation.quotation.status || '')))} onClose={() => setQuotation(null)} onSaved={refresh} />
    {inviting && rfq && <RfqInvitationDialog rfq={rfq} invited={data.data?.suppliers || []} onClose={() => setInviting(false)} onSaved={message => { setNotice(message); refresh(); }} />}
    <RecordEditor title="登记拒绝报价" value={decline} onClose={() => setDecline(null)} onSave={async value => { await oaPost('/rfq/' + id + '/decline', value); refresh(); }} fields={[{ key: 'reason', label: '拒绝原因', type: 'textarea', maxLength: 500, required: true, wide: true }]} />
    <RecordEditor title="结束询价" value={end} onClose={() => setEnd(null)} onSave={async value => { await oaPost('/rfq/' + id + '/terminate', { failed: value.failed === 1, reason: value.reason }); refresh(); }} fields={[{ key: 'failed', label: '登记为流标（未勾选则为取消）', type: 'checkbox' }, { key: 'reason', label: '原因', type: 'textarea', maxLength: 500, required: true, wide: true }]} />
    <RecordEditor title="重新发起询价" value={restart} onClose={() => setRestart(null)} onSave={async value => { const newId = await oaPost<number>('/rfq/' + id + '/restart', value); onChanged(); onSelect(newId); }} fields={[{ key: 'deadline', label: '新报价截止日', type: 'date', required: true }]} />
    <RecordEditor title="关联采购耗材" value={binding} onClose={() => setBinding(null)} onSave={async value => { if (!value.consumableId) throw new Error('请选择采购耗材'); await oaPost('/rfq/' + id + '/items/' + value.itemId + '/consumable', { consumableId: value.consumableId }); refresh(); }} fields={[]} description="请选择与询价物料计量单位一致的耗材。">
      {(value, onChange) => <ConsumablePicker management value={value.consumableId ? { consumableId: String(value.consumableId), name: '已关联 #' + value.consumableId, unit: data.data?.detail.items.find(item => item.itemId === value.itemId)?.unit || '' } : null} onSelect={material => onChange({ ...value, consumableId: Number(material.consumableId) })} />}
    </RecordEditor>
  </div></BaseDialog>;
}
