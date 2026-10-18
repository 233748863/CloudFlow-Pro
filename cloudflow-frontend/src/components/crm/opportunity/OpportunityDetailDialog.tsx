import React, { useState } from 'react';
import { BaseDialog, Button, ConfirmDialog, Pagination, Tabs, TabsList, TabsTrigger } from '@/components/common';
import { DetailFieldGrid } from '@/components/common/DetailDialog';
import { crmApi, type CrmOpportunity } from '@/services/api/crm';
import { opportunityStages } from '@/services/api/crm/opportunityStages';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { money, OpsTable, useRemote } from '../operations/OperationsKit';
import { useCrmManagement } from '../management/store';
import { OpportunityItemsPanel } from './OpportunityItemsPanel';
import { DealTeamPanel } from '../deal/DealTeamPanel';
import { EmailBusinessButton } from '../email/EmailPanel';
import { OpportunityReopenDialog } from './OpportunityReopenDialog';
import { ActivityBusinessButton } from '../operations/ActivityBusinessButton';

export function OpportunityDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { hasPermission, board, openOpportunityEditor, setStageChange, setConfirm, load } = useCrmManagement();
  const remote = useRemote(() => crmApi.getOpportunityDetail(id), [id]);
  const [tab, setTab] = useState('basic');
  const [teamOpened, setTeamOpened] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [productDirty, setProductDirty] = useState(false);
  const [teamDirty, setTeamDirty] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const dirty = productDirty || teamDirty;
  const busy = productBusy || teamBusy;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reopening, setReopening] = useState<CrmOpportunity>();
  const history = useRemote(() => opportunityStages.history(id, historyPage), [id, historyPage]);
  const detail = remote.data;
  const stageName = (code?: string) => board.find(column => column.stage === code)?.stageLabel || code || '—';
  const finishClose = () => { onClose(); void load(); };
  const close = () => { if (busy) return; if (dirty) setDiscardOpen(true); else finishClose(); };
  if (reopening) return <OpportunityReopenDialog opportunity={reopening} onClose={() => { setReopening(undefined); remote.refresh(); history.refresh(); }}
    onSaved={() => { remote.refresh(); history.refresh(); }} />;
  return <><BaseDialog open title="商机详情" width="extra-wide" panelClassName="crm-opportunity-panel" onClose={close} hideCloseButton={busy} closeOnEscape={!busy && !discardOpen}
    footer={<Button variant="outline" disabled={busy} onClick={close}>{busy ? '正在处理业务数据…' : '关闭详情'}</Button>}>
    {(remote.error || history.error) && <div className="crm-ops-warning"><p role="alert">{remote.error || history.error}</p><Button variant="outline" onClick={() => { remote.refresh(); history.refresh(); }} disabled={dirty || busy}>重新读取</Button></div>}
    {remote.loading && <p role="status">正在读取商机详情…</p>}
    {detail && <div className="space-y-4">
      <div className="space-y-2"><h4 className="font-semibold text-cf-title">{detail.opportunityName}</h4><p className="text-sm text-cf-muted">{detail.customerName} · {stageName(detail.stage)} · 版本 {detail.version}</p></div>
      <Tabs value={tab} onValueChange={value => { setTab(value); if (value === 'team') setTeamOpened(true); }}><TabsList><TabsTrigger value="basic" disabled={busy}>基本信息</TabsTrigger><TabsTrigger value="products" disabled={teamDirty || busy}>产品明细</TabsTrigger><TabsTrigger value="history" disabled={busy}>阶段历史</TabsTrigger>{hasPermission('crm:deal-team:query') && <TabsTrigger value="team" disabled={productDirty || busy}>分成团队</TabsTrigger>}</TabsList></Tabs>
      <section hidden={tab !== 'basic'} role="tabpanel" aria-label="商机基本信息" className="space-y-4">
        <DetailFieldGrid items={[
          { label: '当前阶段', value: stageName(detail.stage) }, { label: '上一阶段', value: stageName(detail.lastStage) },
          { label: '当前阶段停留', value: detail.stageChangedTime ? `${detail.stageDurationDays ?? 0} 个完整天` : '进入时间未记录' },
          { label: '预计金额（未税 / 元）', value: money(detail.expectedAmount) }, { label: '赢率（%）', value: `${detail.winRate ?? 0}%` },
          { label: '加权预计金额（元）', value: money(detail.weightedAmount) }, { label: '预计签约日期', value: detail.expectedSignDate },
          { label: '负责人', value: detail.ownerName }, { label: '部门', value: detail.deptName }, { label: '联系人', value: detail.contactName },
          { label: '阶段进入时间', value: formatDateTimeDisplay(detail.stageChangedTime) }, { label: '最近跟进', value: formatDateTimeDisplay(detail.latestFollowUpTime) },
          { label: '丢单说明', value: detail.lostReason, wide: true }, { label: '备注', value: detail.remark, wide: true },
        ]} />
        <fieldset disabled={dirty || busy} className="flex flex-wrap gap-3"><EmailBusinessButton bizType="OPPORTUNITY" bizId={id} /><ActivityBusinessButton bizType="OPPORTUNITY" bizId={id} businessName={detail.opportunityName} customerId={detail.customerId} customerName={detail.customerName} disabled={dirty || busy} /></fieldset>
        {detail.status === 'OPEN' && <div className="flex flex-wrap gap-3">
          {hasPermission('crm:opportunity:edit') && <Button variant="outline" disabled={dirty || busy} onClick={() => { onClose(); void openOpportunityEditor(id); }}>编辑基本信息</Button>}
          {(hasPermission('crm:opportunity:edit') || hasPermission('crm:approval:opportunity-downgrade')) && <Button variant="outline" disabled={dirty || busy} onClick={() => { onClose(); setStageChange({ opportunity: detail }); }}>调整阶段</Button>}
          {hasPermission('crm:opportunity:win') && <Button disabled={dirty || busy} onClick={() => { onClose(); setConfirm({ action: 'winOpportunity', item: detail }); }}>确认赢单</Button>}
          {hasPermission('crm:approval:opportunity-downgrade') && <Button variant="outline" disabled={dirty || busy} onClick={() => { onClose(); setConfirm({ action: 'loseOpportunity', item: detail }); }}>提交丢单审批</Button>}
        </div>}
        {detail.status === 'CLOSED' && ['WON', 'LOST'].includes(detail.stage || '') && hasPermission('crm:opportunity:stage-reopen') && <Button
          variant="outline" disabled={dirty || busy} onClick={() => setReopening(detail)}>恢复进行中</Button>}
        {dirty && <p className="text-sm text-cf-muted">产品或团队草稿未保存，请先保存后再执行其他写操作。</p>}
      </section>
      <section hidden={tab !== 'products'} role="tabpanel" aria-label="产品明细"><OpportunityItemsPanel opportunity={detail} onChange={remote.setData} onDirtyChange={setProductDirty} onBusyChange={setProductBusy} /></section>
      {teamOpened && hasPermission('crm:deal-team:query') && <section hidden={tab !== 'team'} role="tabpanel" aria-label="商机分成团队"><DealTeamPanel bizType="OPPORTUNITY" bizId={id} businessVersion={detail.version} onDirtyChange={setTeamDirty} onBusyChange={setTeamBusy} onSaved={remote.refresh} /></section>}
      <section hidden={tab !== 'history'} role="tabpanel" aria-label="阶段历史" className="space-y-4">
        <p className="text-sm text-cf-muted">每次真实阶段变更独立记录；时长为退出阶段的完整区间，初始记录不计算退出时长。</p>
        {history.loading && <p role="status">正在读取阶段历史…</p>}
        <OpsTable headers={['原阶段 → 新阶段', '进入时间', '变更时间', '完整停留', '操作人', '原因']} empty={!history.loading && !history.data?.rows.length}>
          {(history.data?.rows || []).map(row => <tr key={row.historyId}><td>{stageName(row.fromStage)} → {stageName(row.toStage)}</td><td>{formatDateTimeDisplay(row.enteredTime)}</td><td>{formatDateTimeDisplay(row.changedTime)}</td><td>{row.fromStage ? `${row.durationSeconds} 秒` : '初始进入'}</td><td>{row.createBy || `用户 #${row.operatorId}`}</td><td>{row.reason || '—'}</td></tr>)}
        </OpsTable>
        <Pagination total={history.data?.total || 0} page={historyPage} pageSize={20} showPageSizeSelector={false} onPageChange={setHistoryPage} onPageSizeChange={() => undefined} />
      </section>
    </div>}
  </BaseDialog><ConfirmDialog open={discardOpen} title={teamDirty ? '放弃未保存的分成团队？' : '放弃未保存的产品明细？'} message="关闭后将丢弃本次未保存草稿，已保存的数据保持不变。" confirmText="放弃草稿并关闭" cancelText="继续编辑" danger onCancel={() => setDiscardOpen(false)} onConfirm={() => { if (!busy) finishClose(); }} /></>;
}
