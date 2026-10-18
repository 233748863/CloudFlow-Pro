import React, { useState } from 'react';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { crmOperations, type CustomerCredit } from '@/services/api/crm/operations';
import { Amount, Field, Metric, money, OpsSelect, Section, useAccess, useMutation, useRemote } from './OperationsKit';

export function CreditPanel({ customerId }: { customerId: number }) {
  const can = useAccess();
  const source = useRemote(() => crmOperations.credit(customerId), [customerId]);
  const mutation = useMutation();
  const [form, setForm] = useState<CustomerCredit>();
  const [bypass, setBypass] = useState<CustomerCredit>();
  const view = source.data;
  const current = view?.credit;
  const patch = (fields: Partial<CustomerCredit>) => setForm(previous => previous ? { ...previous, ...fields } : previous);
  return <Section title="信用额度与应收风险">
    {source.loading && <p className="text-sm text-cf-muted">正在核算当前占用…</p>}{source.error && <p role="alert" className="crm-ops-warning">{source.error}<Button variant="link" onClick={source.refresh}>重试</Button></p>}
    {view && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label={`信用额度（${current?.currency || 'CNY'}）`} value={money(current?.creditLimit)} detail={view.effective ? '当前生效' : '未生效 / 未设置'} /><Metric label="实时占用" value={money(view.occupied)} detail="未结清应收余额" /><Metric label="可用额度" value={money(view.available)} /><Metric label="超期应收" value={money(view.overdue)} detail={`允许阈值 ${money(current?.overdueThreshold)}`} /></div>
      {view.pendingApproval && <div className="crm-ops-warning">额度调整审批中：{view.pendingApproval.approvalNo}。通过前继续使用当前额度。</div>}
      {view.bypassActive && <div className="crm-ops-warning">额度校验临时放行中 · 截止 {current?.bypassExpireDate || '未设置'} · 原因：{current?.bypassReason} · 操作时间：{current?.bypassTime}</div>}
      <div className="crm-ops-actions"><Button variant="outline" size="sm" onClick={source.refresh}>重新核算</Button>{can('crm:credit:edit') && <Button size="sm" disabled={Boolean(view.pendingApproval) || mutation.busy} onClick={() => setForm(current ? { ...current, remark: '' } : { customerId, creditLimit: '0.00', overdueThreshold: '0.00', currency: 'CNY', status: 'ENABLED', remark: '' })}>申请调整额度</Button>}{can('crm:credit:bypass') && current && <Button size="sm" variant="outline" disabled={mutation.busy} onClick={() => setBypass({ ...current, bypassFlag: view.bypassActive ? 0 : 1, bypassReason: '', bypassExpireDate: undefined })}>{view.bypassActive ? '撤销临时放行' : '临时放行'}</Button>}</div>
    </div>}
    {form && <BaseDialog open title="申请信用额度调整" description="提交后由部门主管及财务审批，审批通过后生效。" onClose={() => setForm(undefined)} footer={<Button disabled={mutation.busy || !form.remark?.trim() || source.loading} onClick={() => void mutation.run(() => crmOperations.submitCredit(customerId, form), () => { setForm(undefined); source.refresh(); }, '额度调整已提交审批')}>提交审批</Button>}><div className="grid gap-4 md:grid-cols-2"><Field label="信用额度"><Amount value={form.creditLimit} onChange={creditLimit => patch({ creditLimit })} /></Field><Field label="超期应收阈值"><Amount value={form.overdueThreshold} onChange={overdueThreshold => patch({ overdueThreshold })} /></Field><Field label="币种"><OpsSelect label="额度币种" value={form.currency} options={{ CNY: '人民币（本期单币种）' }} onChange={currency => patch({ currency })} /></Field><Field label="状态"><OpsSelect label="额度状态" value={form.status} options={{ ENABLED: '启用', DISABLED: '停用' }} onChange={status => patch({ status })} /></Field><Field label="生效日期"><Input type="date" value={form.effectiveStart || ''} onChange={event => patch({ effectiveStart: event.target.value || undefined })} /></Field><Field label="到期日期"><Input type="date" value={form.effectiveEnd || ''} onChange={event => patch({ effectiveEnd: event.target.value || undefined })} /></Field><Field label="调整原因（必填）" wide><Textarea maxLength={500} value={form.remark || ''} onChange={event => patch({ remark: event.target.value })} /></Field></div></BaseDialog>}
    {bypass && <BaseDialog open title={bypass.bypassFlag ? '临时放行额度校验' : '撤销临时放行'} description="操作会记录原因、操作人和时间，不修改客户额度。" onClose={() => setBypass(undefined)} footer={<Button disabled={mutation.busy || !bypass.bypassReason?.trim() || Boolean(bypass.bypassFlag && !bypass.bypassExpireDate) || source.loading} onClick={() => void mutation.run(() => crmOperations.bypassCredit(customerId, bypass), () => { setBypass(undefined); source.refresh(); })}>确认</Button>}><div className="grid gap-4"><Field label="原因（必填）"><Textarea maxLength={500} value={bypass.bypassReason || ''} onChange={event => setBypass({ ...bypass, bypassReason: event.target.value })} /></Field>{Boolean(bypass.bypassFlag) && <Field label="放行截止日期（必填）"><Input type="date" value={bypass.bypassExpireDate || ''} onChange={event => setBypass({ ...bypass, bypassExpireDate: event.target.value })} /></Field>}</div></BaseDialog>}
  </Section>;
}
