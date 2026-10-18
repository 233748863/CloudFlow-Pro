import React, { useState } from 'react';
import { BaseDialog, Button, Textarea } from '@/components/common';
import { crmApi, type CrmOpportunity } from '@/services/api/crm';
import { opportunityStages } from '@/services/api/crm/opportunityStages';
import { Field, OpsSelect, useMutation, useRemote } from '../../operations/OperationsKit';
import { StageRuleSummary, terminalStage } from '../../opportunity/StageRuleSummary';
import { getErrorMessage } from '@/utils/errorMessage';
import { useCrmManagement } from '../store';

export function OpportunityStageDialog({ opportunity, initialStage }: { opportunity: CrmOpportunity; initialStage?: string }) {
  const { hasPermission, board, setStageChange, load } = useCrmManagement();
  const [baseline, setBaseline] = useState(opportunity);
  const [targetCode, setTargetCode] = useState(initialStage || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [latest, setLatest] = useState<CrmOpportunity>();
  const remote = useRemote(() => opportunityStages.options());
  const mutation = useMutation();
  const stages = remote.data || [];
  const source = stages.find(stage => stage.stageCode === baseline.stage);
  const sourceOrder = source?.sortNo ?? board.find(column => column.stage === baseline.stage)?.sortNo;
  const target = stages.find(stage => stage.stageCode === targetCode);
  const backward = target != null && sourceOrder != null && target.sortNo < sourceOrder;
  const next = stages.filter(stage => !terminalStage(stage) && sourceOrder != null && stage.sortNo > sourceOrder).sort((left, right) => left.sortNo - right.sortNo)[0];
  const skipsForbidden = Boolean(target && !backward && !target.allowSkipFlag && target.stageCode !== next?.stageCode);
  const allowed = hasPermission(backward ? 'crm:approval:opportunity-downgrade' : 'crm:opportunity:edit');
  const submit = () => void mutation.run(async () => {
    setError('');
    try {
      if (baseline.version == null || !baseline.opportunityId || !target || !allowed || baseline.status !== 'OPEN') throw new Error('商机版本、权限或目标阶段无效，请重新读取');
      if (backward) {
        if (!reason.trim()) throw new Error('请填写阶段回退原因');
        await crmApi.submitOpportunityDowngrade({ opportunityId: baseline.opportunityId, version: baseline.version, action: 'DOWNGRADE', targetStage: targetCode, lostReason: reason.trim() });
      } else await crmApi.updateOpportunityStage({ opportunityId: baseline.opportunityId, stage: targetCode, version: baseline.version });
    } catch (failure) { setError(getErrorMessage(failure, '操作失败，输入已保留')); throw failure; }
  }, () => { setStageChange(null); void load(); }, backward ? '已提交阶段回退审批，通过后才变更阶段' : '商机阶段已推进');
  return <BaseDialog open title={`调整阶段 · ${baseline.opportunityName}`} width="wide" panelClassName="crm-opportunity-panel" onClose={() => { if (!mutation.busy) setStageChange(null); }}
    footer={<Button disabled={mutation.busy || remote.loading || !allowed || !target || sourceOrder == null || target.stageCode === baseline.stage || skipsForbidden || baseline.version == null || baseline.status !== 'OPEN' || (backward && !reason.trim())} onClick={submit}>{backward ? '提交回退审批' : '确认推进'}</Button>}>
    <div className="space-y-4">
      <p className="text-sm">当前阶段：{source?.stageName || baseline.stage}；版本：{baseline.version ?? '缺失'}。</p>
      {(error || remote.error) && <p role="alert" className="crm-ops-warning">{error || remote.error}；原因和目标选择仍保留。</p>}
      {error && <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => crmApi.getOpportunityDetail(opportunity.opportunityId!), setLatest, '')}>读取最新商机（保留输入）</Button>}
      {latest && <div className="crm-ops-warning space-y-2"><p>最新阶段：{latest.stage}；最新版本：{latest.version}；状态：{latest.status === 'OPEN' ? '进行中' : '已结案'}。</p><Button variant="outline" onClick={() => { setBaseline(latest); setLatest(undefined); setError(''); remote.refresh(); }}>已核对，采用最新版本</Button></div>}
      <Field label="目标阶段"><OpsSelect label="目标阶段" value={targetCode} empty="选择进行中阶段" options={Object.fromEntries(stages.filter(stage => !terminalStage(stage) && stage.stageCode !== baseline.stage).map(stage => [stage.stageCode, stage.stageName]))} onChange={setTargetCode} /></Field>
      {target && <StageRuleSummary stage={target} />}
      {skipsForbidden && <p role="alert" className="crm-ops-warning">当前规则要求先进入{next?.stageName || '下一个启用阶段'}，此目标不能跳入。</p>}
      {backward && <Field label="回退原因（必填，最多500字符）"><Textarea maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="填写实际业务原因；审批通过后执行回退" /></Field>}
      {!allowed && <p role="alert">没有该阶段操作权限。</p>}
      <p className="text-sm text-cf-muted">赢单和丢单使用独立业务操作；已结案商机不能通过此入口恢复。</p>
    </div>
  </BaseDialog>;
}
