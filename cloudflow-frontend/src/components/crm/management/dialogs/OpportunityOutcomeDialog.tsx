import React, { useState } from 'react';
import { BaseDialog, Button, Textarea } from '@/components/common';
import { crmOperations, type LossReasonInput } from '@/services/api/crm/operations';
import { crmApi, type CrmOpportunity } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { Amount, Field, Flag, OpsSelect, useAccess, useMutation, useRemote } from '../../operations/OperationsKit';
import { useCrmManagement } from '../store';

export function OpportunityOutcomeDialog({ opportunity, lost }: { opportunity: CrmOpportunity; lost: boolean }) {
  const { setConfirm, load } = useCrmManagement();
  const can = useAccess();
  const reasons = useRemote(() => can('crm:lost:list') ? crmOperations.lostReasons() : Promise.resolve({ rows: [] }));
  const competitors = useRemote(() => can('crm:lost:list') ? crmOperations.competitors() : Promise.resolve({ rows: [] }));
  const mutation = useMutation();
  const [selected, setSelected] = useState<LossReasonInput[]>([]);
  const [competitorId, setCompetitorId] = useState<number | undefined>(opportunity.competitorId);
  const [comment, setComment] = useState('');
  const [baseline, setBaseline] = useState(opportunity);
  const [latest, setLatest] = useState<CrmOpportunity>();
  const [error, setError] = useState('');
  const competitorOptions = Object.fromEntries((competitors.data?.rows || []).filter(row => row.status === 'ACTIVE').map(row => [String(row.competitorId), row.competitorName]));
  const allowed = can(lost ? 'crm:approval:opportunity-downgrade' : 'crm:opportunity:win');
  const submit = () => void mutation.run(async () => {
    setError('');
    try {
      if (baseline.version == null || !allowed || baseline.status !== 'OPEN') throw new Error('商机版本、状态或权限无效，请重新读取');
      if (lost) await crmOperations.lose(baseline.opportunityId!, { reasons: selected, comment, version: baseline.version });
      else await crmOperations.win(baseline.opportunityId!, baseline.version, competitorId);
    } catch (failure) { setError(getErrorMessage(failure, '操作失败，输入已保留')); throw failure; }
  }, () => { setConfirm(null); void load(); }, lost ? '已提交丢单审批，通过前商机阶段保持不变' : '已赢单');
  return <BaseDialog open title={lost ? `丢单审批 · ${opportunity.opportunityName}` : `确认赢单 · ${opportunity.opportunityName}`} description={lost ? '请选择一至二十项丢单原因，并指定唯一主因。' : '记录击败的主要竞争对手，并核验当前阶段的赢单要求。'} panelClassName="crm-opportunity-panel" width={lost ? 'wide' : 'normal'} onClose={() => { if (!mutation.busy) setConfirm(null); }} footer={<Button disabled={mutation.busy || !allowed || baseline.version == null || baseline.status !== 'OPEN' || (lost && (!selected.length || selected.filter(reason => reason.isPrimary).length !== 1))} onClick={submit}>{lost ? '提交审批' : '确认赢单'}</Button>}>
    <p className="text-sm mb-3">当前阶段 {baseline.stage} · 版本 {baseline.version ?? '缺失'}</p>
    {error && <div className="crm-ops-warning mb-3 space-y-2"><p role="alert">{error}；输入仍保留。</p><Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => crmApi.getOpportunityDetail(opportunity.opportunityId!), setLatest, '')}>读取最新商机（保留输入）</Button></div>}
    {latest && <div className="crm-ops-warning mb-3 space-y-2"><p>最新阶段 {latest.stage} · 版本 {latest.version} · {latest.status === 'OPEN' ? '进行中' : '已结案'}</p><Button variant="outline" onClick={() => { setBaseline(latest); setLatest(undefined); setError(''); }}>已核对，采用最新版本</Button></div>}
    {(reasons.error || competitors.error) && <p role="alert" className="crm-ops-warning">{reasons.error || competitors.error}</p>}
    {lost ? <div className="space-y-4">{(reasons.data?.rows || []).filter(reason => reason.status === 'ACTIVE').map(reason => { const choice = selected.find(item => item.reasonId === reason.reasonId); return <div key={reason.reasonId} className="rounded-lg border p-4 space-y-3"><Flag label={reason.reasonName} value={Boolean(choice)} disabled={!choice && selected.length >= 20} onChange={checked => setSelected(previous => checked ? [...previous, { reasonId: reason.reasonId!, isPrimary: previous.length === 0, amountLost: opportunity.expectedAmount || 0 }] : previous.filter(item => item.reasonId !== reason.reasonId))} />{choice && <div className="grid gap-3 md:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="radio" name="primaryLostReason" checked={choice.isPrimary} onChange={() => setSelected(previous => previous.map(item => ({ ...item, isPrimary: item.reasonId === reason.reasonId })))} />主要原因</label><Field label="相关竞争对手"><OpsSelect label={`${reason.reasonName}的竞争对手`} value={choice.competitorId} empty="无" options={competitorOptions} onChange={value => setSelected(previous => previous.map(item => item.reasonId === reason.reasonId ? { ...item, competitorId: value ? Number(value) : undefined } : item))} /></Field><Field label="影响金额（元）"><Amount value={choice.amountLost} onChange={amountLost => setSelected(previous => previous.map(item => item.reasonId === reason.reasonId ? { ...item, amountLost } : item))} /></Field><Field label="具体说明" wide><Textarea value={choice.remark || ''} onChange={event => setSelected(previous => previous.map(item => item.reasonId === reason.reasonId ? { ...item, remark: event.target.value } : item))} /></Field></div>}</div>; })}{!reasons.loading && !reasons.data?.rows.length && <p className="crm-ops-warning">暂无可用丢单原因，需先由有权限的人员配置原因。</p>}<Field label="审批说明"><Textarea value={comment} onChange={event => setComment(event.target.value)} /></Field></div> : <Field label="主要竞争对手（可选）"><OpsSelect label="赢单竞争对手" value={competitorId} empty="无竞争对手" options={competitorOptions} onChange={value => setCompetitorId(value ? Number(value) : undefined)} /></Field>}
  </BaseDialog>;
}
