import React, { useState } from 'react';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { crmApi, type CrmLead, type CrmLeadConvertRequest } from '@/services/api/crm';
import { crmOperations } from '@/services/api/crm/operations';
import { Field, Flag, labelOf, OpsSelect, qualificationStatuses, useMutation } from './OperationsKit';

export function LeadQualificationDialog({ lead, onClose, onSaved }: { lead: CrmLead; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState<'qualify' | 'disqualify' | 'start-qualifying'>(lead.qualificationStatus === 'DISQUALIFIED' ? 'start-qualifying' : 'qualify');
  const [comment, setComment] = useState('');
  const mutation = useMutation();
  return <BaseDialog open title={`资质评估 · ${lead.leadName}`} description={`当前：${labelOf(qualificationStatuses, lead.qualificationStatus)}；评分 ${lead.leadScore ?? 0}，人工结论不随评分重算变化。`} onClose={onClose} footer={<Button disabled={mutation.busy || (action === 'disqualify' && !comment.trim())} onClick={() => void mutation.run(() => crmOperations.qualify(lead.leadId!, action, lead.version, comment), () => { onSaved(); onClose(); })}>确认评估</Button>}><div className="grid gap-4"><Field label="评估结论"><OpsSelect label="资质结论" value={action} options={{ ...(lead.qualificationStatus !== 'DISQUALIFIED' ? { qualify: '判定合格' } : {}), disqualify: '判定不合格', 'start-qualifying': '开始 / 重新评估' }} onChange={value => setAction(value as typeof action)} /></Field><Field label={action === 'disqualify' ? '不合格原因（必填）' : '评估说明'}><Textarea maxLength={500} value={comment} onChange={event => setComment(event.target.value)} /></Field>{lead.disqualifyReason && <p className="text-sm text-cf-muted">上次不合格原因：{lead.disqualifyReason}</p>}</div></BaseDialog>;
}

export function LeadConversionDialog({ lead, onClose, onConverted }: { lead: CrmLead; onClose: () => void; onConverted: (id: number) => void }) {
  const mutation = useMutation();
  const [form, setForm] = useState<CrmLeadConvertRequest>({ leadId: lead.leadId!, customerName: lead.companyName || lead.leadName, createOpportunity: false, opportunityName: lead.leadName, expectedAmount: 0 });
  return <BaseDialog open title="线索转为客户" description="区域、市场、员工规模、年营收、退订及营销来源同步继承；有联系人姓名时自动创建联系人。" onClose={onClose} footer={<Button disabled={mutation.busy || !form.customerName?.trim() || (form.createOpportunity && !form.opportunityName?.trim())} onClick={() => void mutation.run(() => crmApi.convertLead(form), onConverted, '线索已转为客户')}>确认转化</Button>}><div className="grid gap-4"><Field label="客户名称"><Input value={form.customerName || ''} onChange={event => setForm({ ...form, customerName: event.target.value })} /></Field>{lead.qualificationStatus !== 'QUALIFIED' && <div className="crm-ops-warning">当前线索尚未判定合格，转化时按规则中心的阻断 / 警告配置校验。</div>}<Flag label="同时创建商机" value={form.createOpportunity} onChange={createOpportunity => setForm({ ...form, createOpportunity })} />{form.createOpportunity && <><Field label="商机名称"><Input value={form.opportunityName || ''} onChange={event => setForm({ ...form, opportunityName: event.target.value })} /></Field><Field label="预计金额（元）"><Input aria-label="预计金额（元）" type="number" min="0" max="999999999999.99" step="0.01" value={form.expectedAmount ?? ''} onChange={event => setForm({ ...form, expectedAmount: event.target.value })} /></Field><Field label="预计签约日期"><Input type="date" value={form.expectedSignDate || ''} onChange={event => setForm({ ...form, expectedSignDate: event.target.value || undefined })} /></Field></>}</div></BaseDialog>;
}
