import React, { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { BaseDialog, Button, ConfirmDialog, Textarea } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import type { CrmOpportunity } from '@/services/api/crm';
import { opportunityStages, type OpportunityReopenReceipt, type OpportunityReopenRequest, type OpportunityReopenView, type SalesStage } from '@/services/api/crm/opportunityStages';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { dealRoleLabels } from '../deal/dealTeamDraft';
import { Field, money, OpsSelect, useMutation, useRemote } from '../operations/OperationsKit';
import { StageRuleSummary, terminalStage } from './StageRuleSummary';

interface Inspection { view: OpportunityReopenView; stages: SalesStage[] }

export function OpportunityReopenDialog({ opportunity, onClose, onSaved }: {
  opportunity: CrmOpportunity; onClose: () => void; onSaved: () => void;
}) {
  const { hasPermission } = useAuth();
  const canReopen = hasPermission('crm:opportunity:stage-reopen');
  const inspect = async (): Promise<Inspection> => {
    if (!canReopen || !opportunity.opportunityId) throw new Error('无权恢复此商机');
    const [view, stages] = await Promise.all([opportunityStages.inspectReopen(opportunity.opportunityId), opportunityStages.options()]);
    return { view, stages };
  };
  const remote = useRemote(inspect, [opportunity.opportunityId, canReopen]);
  const mutation = useMutation();
  const [baseline, setBaseline] = useState<Inspection>();
  const [latest, setLatest] = useState<Inspection>();
  const [targetCode, setTargetCode] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState<OpportunityReopenRequest>();
  const [receipt, setReceipt] = useState<OpportunityReopenReceipt>();
  const [discardOpen, setDiscardOpen] = useState(false);
  const current = baseline || remote.data;
  const view = current?.view;
  const stages = current?.stages || [];
  const target = stages.find(stage => stage.stageCode === targetCode && stage.status === 'ACTIVE' && !terminalStage(stage));
  const busy = mutation.busy || remote.loading;
  const dirty = !receipt && Boolean(targetCode || reason || attempt);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || mutation.busy)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || mutation.busy) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, mutation.busy]);
  useEffect(() => { if (busy && blocker.state === 'blocked') blocker.reset(); }, [busy, blocker]);
  const stageName = (code: string) => stages.find(stage => stage.stageCode === code)?.stageName || code;
  const close = () => { if (busy) return; if (dirty) setDiscardOpen(true); else onClose(); };
  const saved = (result: OpportunityReopenReceipt) => { setReceipt(result); setError(''); setAttempt(undefined); setLatest(undefined); onSaved(); };
  const submit = () => void mutation.run(async () => {
    if (!canReopen || !view?.allowed || !target || !reason.trim() || reason.length > 1000 || attempt || receipt)
      throw new Error('请先核对商机状态、目标阶段及恢复原因');
    const input = { version: view.version, targetStage: targetCode, reason: reason.trim() };
    setError(''); setLatest(undefined); setAttempt(input);
    try { return await opportunityStages.reopen(view.opportunityId, input); }
    catch (failure) {
      const message = `${getErrorMessage(failure, '未收到恢复结果')}；输入已保留，请先只读核对最新结果。`;
      setError(message); throw new Error(message);
    }
  }, saved, '商机已恢复进行中，历史记录已保留');
  const reconcile = () => void mutation.run(async () => {
    try { return await inspect(); }
    catch (failure) { setError(`${getErrorMessage(failure, '核对失败')}；尚未确认提交结果，请勿重复提交。`); throw failure; }
  }, result => {
    const previous = result.view.lastReopen;
    if (attempt && previous && previous.originalVersion === attempt.version && previous.version === attempt.version + 1
        && previous.targetStage === attempt.targetStage && previous.reason === attempt.reason) saved(previous);
    else { setLatest(result); setError(''); }
  }, '');
  return <><BaseDialog open title={`恢复进行中 · ${opportunity.opportunityName}`} width="wide" panelClassName="crm-opportunity-panel"
    onClose={close} hideCloseButton={busy} closeOnEscape={!busy && !discardOpen}
    footer={<><Button variant="outline" disabled={busy} onClick={close}>返回详情</Button>{!receipt && <Button
      disabled={busy || !canReopen || !view?.allowed || !target || !reason.trim() || Boolean(attempt) || Boolean(remote.error)} onClick={submit}>
      {mutation.busy ? '正在核验并处理…' : '确认恢复进行中'}</Button>}</>}>
    <div className="space-y-4">
      {remote.loading && <p role="status">正在核对原赢单分配及关联合同、到账记录…</p>}
      {(error || remote.error) && <p role="alert" className="crm-ops-warning">{error || remote.error}</p>}
      {remote.error && !attempt && <Button variant="outline" disabled={busy} onClick={remote.refresh}>重新读取核验信息</Button>}
      {view && !attempt && !receipt && <Button variant="outline" disabled={busy} onClick={() => void mutation.run(inspect, result => { setBaseline(result); setError(''); }, '')}>重新核对恢复条件（保留输入）</Button>}
      {view && <>
        <div className="crm-reopen-summary"><p>当前阶段：{stageName(view.stage)} · 业务版本 {view.version}</p>
          <p>保留关联合同 {view.retainedContracts} 份；恢复操作不会取消、删除或新建合同。</p></div>
        {view.blockers.length > 0 && !receipt && <aside className="crm-ops-warning space-y-2" aria-label="恢复阻断原因"><h3 className="font-semibold">当前暂不能恢复</h3>
          <ul className="list-disc space-y-1 pl-5">{view.blockers.map(message => <li key={message}>{message}</li>)}</ul></aside>}
        {view.winningEventId != null && <section className="space-y-3" aria-label="原赢单冻结分配">
          <h3 className="font-semibold text-cf-title">按原赢单分配扣回</h3>
          <p className="text-sm text-cf-muted">原事实 #{view.winningEventId} · 团队版本 {view.teamVersion} · 原赢单金额 {money(view.amount)} {view.currency}；赢单数量同步扣回。</p>
          <ul className="space-y-2">{view.shares.map(share => <li key={share.userId} className="crm-reopen-share">
            <div className="min-w-0"><p className="break-words font-medium text-cf-title">{share.name || `用户 #${share.userId}`}</p>
              <p className="text-xs text-cf-muted">{dealRoleLabels[share.roleType]} · {(Number(share.percentage) * 100).toFixed(2)}%</p></div>
            <p>扣回 {money(share.amount)} {view.currency}</p>
          </li>)}</ul><p className="text-sm text-cf-muted">使用赢单发生时保存的分配，后续调整团队不会改变此次扣回。</p>
        </section>}
        {view.stage === 'LOST' && <p className="text-sm text-cf-muted">恢复后清除当前丢单原因，原丢单说明和明细保留在历史记录中。</p>}
      </>}
      {!receipt && <fieldset disabled={busy || Boolean(attempt)} className="space-y-4">
        <Field label="目标进行中阶段"><OpsSelect label="恢复目标阶段" value={targetCode} empty="选择启用的进行中阶段"
          options={Object.fromEntries(stages.filter(stage => stage.status === 'ACTIVE' && !terminalStage(stage)).map(stage => [stage.stageCode, stage.stageName]))} onChange={setTargetCode} /></Field>
        {target && <StageRuleSummary stage={target} reopening />}
        <Field label="恢复原因（必填，最多1000字符）"><Textarea aria-label="恢复原因" maxLength={1000} value={reason}
          onChange={event => setReason(event.target.value)} placeholder="说明重新推进的实际业务原因，提交后保留审计记录" /></Field>
      </fieldset>}
      {attempt && !receipt && <aside className="crm-ops-warning space-y-3" aria-label="恢复结果核对"><p>提交结果尚待核对，已暂停再次提交；目标和原因保持不变。</p>
        <Button variant="outline" disabled={busy} onClick={reconcile}>只读核对最新结果</Button></aside>}
      {latest && !receipt && <aside className="crm-reopen-summary space-y-3" aria-label="最新恢复状态">
        <p>最新阶段：{stageName(latest.view.stage)} · 业务版本 {latest.view.version}；未找到与本次提交相符的恢复回执。</p>
        {latest.view.lastReopen && <p>最近一次恢复：{formatDateTimeDisplay(latest.view.lastReopen.changedTime)} · 历史 #{latest.view.lastReopen.historyId} · 版本 {latest.view.lastReopen.originalVersion} → {latest.view.lastReopen.version}。</p>}
        {latest.view.blockers.map(message => <p key={message}>{message}</p>)}
        {latest.view.allowed && <Button variant="outline" disabled={busy} onClick={() => { setBaseline(latest); setLatest(undefined); setAttempt(undefined); setError(''); }}>已核对，采用最新版本继续编辑</Button>}
      </aside>}
      {receipt && <section role="status" className="crm-reopen-summary space-y-2" aria-label="商机恢复回执"><h3 className="font-semibold text-cf-title">已确认恢复成功</h3>
        <p>{stageName(receipt.fromStage)} → {stageName(receipt.targetStage)} · 版本 {receipt.originalVersion} → {receipt.version}</p>
        <p>历史 #{receipt.historyId} · {formatDateTimeDisplay(receipt.changedTime)} · 操作人 #{receipt.operatorId}</p>
        {receipt.originalEventId != null && <p>原赢单事实 #{receipt.originalEventId} · 冲减事实 #{receipt.reversalEventId}</p>}
        <p className="break-words">原因：{receipt.reason}</p><p>此回执证明该次恢复已经保存，返回详情可查看商机的最新状态。</p>
      </section>}
    </div>
  </BaseDialog><ConfirmDialog open={(discardOpen || blocker.state === 'blocked') && !busy} title={attempt ? '尚未核对恢复结果，确认离开？' : '放弃未提交的恢复草稿？'}
    message={attempt ? '离开不会撤销已提交的操作。再次进入商机详情核对阶段历史前，请勿重复恢复。' : '离开后丢弃本次目标和原因，已保存的业务记录保持不变。'}
    confirmText="确认离开" cancelText={attempt ? '继续核对' : '继续编辑'} danger
    onCancel={() => { setDiscardOpen(false); if (blocker.state === 'blocked') blocker.reset(); }}
    onConfirm={() => { if (busy) return; setDiscardOpen(false); if (blocker.state === 'blocked') blocker.proceed(); else onClose(); }} /></>;
}
