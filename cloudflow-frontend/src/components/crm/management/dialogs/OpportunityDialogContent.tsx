import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { crmApi, type CrmOpportunity } from '@/services/api/crm';
import { useCrmManagement } from '../store';
import { crmOperations } from '@/services/api/crm/operations';
import { opportunityStages } from '@/services/api/crm/opportunityStages';
import { StageRuleSummary, terminalStage } from '../../opportunity/StageRuleSummary';
import { Field, money, OpsSelect, useAccess, useMutation, useRemote } from '../../operations/OperationsKit';

export const OpportunityDialogContent: React.FC = () => {
  const { opportunityForm, setOpportunityForm, opportunitySaveError, customerOptions, salesStages } = useCrmManagement();
  const can = useAccess();
  const [latest, setLatest] = useState<CrmOpportunity>();
  const [contactSearch, setContactSearch] = useState('');
  const mutation = useMutation();
  const campaigns = useRemote(() => can('crm:campaign:list') ? crmOperations.campaignChoices() : Promise.resolve({ rows: [] }));
  const competitors = useRemote(() => can('crm:lost:list') ? crmOperations.competitors() : Promise.resolve({ rows: [] }));
  const contacts = useRemote(() => opportunityForm.customerId && can('crm:contact:list') ? crmApi.listContacts({ customerId: opportunityForm.customerId, status: 'ACTIVE', contactName: contactSearch || undefined, pageSize: 100 }) : Promise.resolve({ rows: [] }), [opportunityForm.customerId, contactSearch]);
  const products = useRemote(() => opportunityForm.opportunityId ? opportunityStages.items(opportunityForm.opportunityId) : Promise.resolve(undefined), [opportunityForm.opportunityId]);
  const firstStage = salesStages.filter(stage => !terminalStage(stage)).sort((left, right) => left.sortNo - right.sortNo)[0];
  const stage = salesStages.find(rule => rule.stageCode === opportunityForm.stage);
  useEffect(() => {
    if (!opportunityForm.opportunityId && firstStage) setOpportunityForm(previous => ({ ...previous, stage: firstStage.stageCode, winRate: Number(firstStage.defaultWinRate) * 100 }));
  }, [opportunityForm.opportunityId, firstStage?.stageCode, firstStage?.defaultWinRate, setOpportunityForm]);
  const contactOptions = Object.fromEntries((contacts.data?.rows || []).map(contact => [String(contact.contactId), contact.contactName]));
  if (opportunityForm.contactId && !contactOptions[String(opportunityForm.contactId)]) contactOptions[String(opportunityForm.contactId)] = opportunityForm.contactName || `现有联系人 #${opportunityForm.contactId}`;
  return <div className="crm-opportunity-panel space-y-4">
    {opportunitySaveError && <div className="crm-ops-warning space-y-2"><p role="alert">{opportunitySaveError}；未保存输入仍保留。</p>{opportunityForm.opportunityId && <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => crmApi.getOpportunityDetail(opportunityForm.opportunityId!), setLatest, '')}>读取最新商机（保留草稿）</Button>}</div>}
    {latest && <div className="crm-ops-warning space-y-2"><p>草稿版本 {opportunityForm.version}；最新版本 {latest.version}；最新阶段 {latest.stage}；最新预计金额 {money(latest.expectedAmount)} 元。</p><Button variant="outline" disabled={latest.status !== 'OPEN'} onClick={() => { setOpportunityForm(previous => ({ ...previous, version: latest.version, stage: latest.stage, status: latest.status })); setLatest(undefined); }}>已核对，保留输入并采用最新版本</Button></div>}
    {(contacts.error || products.error || campaigns.error || competitors.error) && <p role="alert" className="crm-ops-warning">{contacts.error || products.error || campaigns.error || competitors.error}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="客户（必填）" wide><Select value={opportunityForm.customerId ? String(opportunityForm.customerId) : ''} onValueChange={value => { setContactSearch(''); setOpportunityForm(previous => ({ ...previous, customerId: Number(value), contactId: undefined, contactName: undefined })); }}><SelectTrigger aria-label="商机客户"><SelectValue placeholder="选择客户" /></SelectTrigger><SelectContent>{customerOptions.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="商机名称（必填）"><Input maxLength={120} value={opportunityForm.opportunityName || ''} onChange={event => setOpportunityForm(previous => ({ ...previous, opportunityName: event.target.value }))} /></Field>
      <Field label={opportunityForm.opportunityId ? '当前阶段（使用调整阶段操作）' : '初始阶段（按规则确定）'}><Input value={stage?.stageName || opportunityForm.stage || ''} readOnly /></Field>
      <Field label={products.data?.items.length ? '预计金额（产品未税小计，只读）' : '预计金额（CNY / 元）'}><Input type="number" min="0" max="999999999999.99" step="0.01" readOnly={Boolean(products.data?.items.length)} value={opportunityForm.expectedAmount ?? 0} onChange={event => setOpportunityForm(previous => ({ ...previous, expectedAmount: Number(event.target.value) }))} /></Field>
      <Field label="赢率（0—100%）"><Input type="number" min="0" max="100" step="0.01" readOnly={!opportunityForm.opportunityId} value={opportunityForm.winRate ?? 0} onChange={event => setOpportunityForm(previous => ({ ...previous, winRate: Number(event.target.value) }))} /></Field>
      <Field label="筛选该客户联系人"><Input value={contactSearch} onChange={event => setContactSearch(event.target.value)} placeholder="按姓名查找，最多显示100个匹配项" /></Field>
      <Field label="联系人"><OpsSelect label="商机联系人" value={opportunityForm.contactId} empty="未指定联系人" options={contactOptions} onChange={value => setOpportunityForm(previous => ({ ...previous, contactId: value ? Number(value) : undefined }))} /></Field>
      <Field label="负责人"><Input value={opportunityForm.ownerName || '当前登录员工'} readOnly /></Field>
      <Field label="预计签约日期"><DatePicker className="h-11" type="date" value={opportunityForm.expectedSignDate || ''} onChange={event => setOpportunityForm(previous => ({ ...previous, expectedSignDate: event.target.value || undefined }))} /></Field>
      <Field label="来源营销活动"><OpsSelect label="商机营销来源" value={opportunityForm.campaignId} empty={opportunityForm.opportunityId ? '无' : '默认继承客户来源'} options={Object.fromEntries((campaigns.data?.rows || []).map(row => [String(row.campaignId), row.campaignName]))} onChange={value => setOpportunityForm(previous => ({ ...previous, campaignId: value ? Number(value) : undefined }))} /></Field>
      <Field label="主要竞争对手"><OpsSelect label="商机竞争对手" value={opportunityForm.competitorId} empty="无" options={Object.fromEntries((competitors.data?.rows || []).filter(row => row.status === 'ACTIVE').map(row => [String(row.competitorId), row.competitorName]))} onChange={value => setOpportunityForm(previous => ({ ...previous, competitorId: value ? Number(value) : undefined }))} /></Field>
      <Field label="备注" wide><Textarea maxLength={500} value={opportunityForm.remark || ''} onChange={event => setOpportunityForm(previous => ({ ...previous, remark: event.target.value }))} /></Field>
    </div>
    {!opportunityForm.opportunityId && <StageRuleSummary stage={firstStage} />}
    <p className="text-sm text-cf-muted">有产品明细时，预计金额按服务器未税小计计算；产品明细在商机详情中维护。保存时校验当前版本，创建人与阶段时间由服务器记录。</p>
  </div>;
};
