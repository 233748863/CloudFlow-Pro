import React, { useState } from 'react';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { hrOvertimeApi } from '@/services/api/hr/overtime';
import { hr09References } from '@/services/api/hr/hr09Request';
import { Hr09Error, hasHr09Action } from '@/services/api/hr/hr09Model';
import type { OvertimeDetailVO, OvertimeResolutionAction, OvertimeSettlementVO } from '@/services/api/hr/hr09Types';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Notice, Hr09Select, Hr09State, Hr09Status, Hr09Textarea, Hr09Value, dateTimeText, useHr09Resource } from './Hr09Shared';

export function canReadOvertimeSettlement(record: OvertimeDetailVO, mine: boolean, permission: (value: string) => boolean) {
  return hasHr09Action(record, 'VIEW_SETTLEMENT') && (mine ? permission('hr:overtime:mine') : permission(record.settleMode === 'PAY' ? 'hr:overtime:finance' : 'hr:overtime:verify'));
}

function ResolutionDialog({ record, settlement, onClose, onChanged }: { record: OvertimeDetailVO; settlement: OvertimeSettlementVO; onClose: () => void; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const [action, setAction] = useState<OvertimeResolutionAction | ''>('');
  const [targetPeriodId, setTargetPeriodId] = useState('');
  const [originalSlipId, setOriginalSlipId] = useState('');
  const [reason, setReason] = useState('');
  const pay = settlement.settleMode === 'PAY';
  const originalPeriodId = (pay ? settlement.payrollPeriodId : settlement.leavePeriodId) || '';
  const canReadPeriods = hasPermission(pay ? 'hr:payroll:list' : 'hr:leave:list');
  const changingPeriod = action === 'PAY_CORRECTION' || action === 'COMPENSATORY_ADJUSTMENT';
  const periods = useHr09Resource(pay ? hr09References.payrollPeriods : hr09References.leavePeriods, [pay], changingPeriod && canReadPeriods);
  const slips = useHr09Resource(signal => hr09References.paidSlips(record.employeeId, originalPeriodId, signal), [record.employeeId, originalPeriodId], action === 'PAY_CORRECTION' && canReadPeriods && Boolean(originalPeriodId) && hasPermission('hr:payroll:correct'));
  const originalPeriod = periods.data?.find(period => period.periodId === originalPeriodId);
  const targets = periods.data?.filter(period => originalPeriod && originalPeriod.startDate && originalPeriod.endDate && period.startDate && period.endDate && period.status === 'OPEN' && period.periodId !== originalPeriodId && (!pay || period.startDate > originalPeriod.endDate)) || [];
  const actions = [{ value: 'REJECT', label: '终止本次自动结算' }, ...(pay ? hasPermission('hr:payroll:correct') ? [{ value: 'PAY_CORRECTION', label: '基于真实已发工资单补正' }] : [] : [{ value: 'COMPENSATORY_ADJUSTMENT', label: '明确补入新的假期周期' }])];
  const ready = Boolean(action && (action === 'REJECT' || canReadPeriods && !periods.loading && !periods.error && targets.some(period => period.periodId === targetPeriodId) && (action !== 'PAY_CORRECTION' || !slips.loading && !slips.error && slips.data?.some(slip => slip.value === originalSlipId))));
  return <Hr09FormDialog title="处置结算异常" description="原审批、核定依据与原目标保持不变，本次处置单独留痕。" onClose={onClose} onReload={() => { onClose(); onChanged(); }} blocked={!ready} submitText="确认处置" successText="处置请求已完成，请查看最新执行状态" confirmation={action === 'REJECT' ? '确认仅终止本次自动结算；保留已通过工时及记录，不代表员工放弃报酬。' : '已核对原目标与本次目标，确认按原核定依据处理；不另填金额、数量或变更补偿方式。'} onSubmit={async () => {
    if (!ready || !action || !hasPermission('hr:overtime:resolve') || !hasPermission(pay ? 'hr:overtime:price' : 'hr:overtime:verify') || action === 'PAY_CORRECTION' && !hasPermission('hr:payroll:correct')) throw new Hr09Error('当前处置条件未满足。', 403);
    await hrOvertimeApi.resolve(record.requestId, { version: settlement.version, action, reason, ...(action !== 'REJECT' ? { targetPeriodId } : {}), ...(action === 'PAY_CORRECTION' ? { originalSlipId } : {}) });
    onChanged();
  }}>
    <Hr09Notice danger>{settlement.lastErrorCode ? `${settlement.lastErrorCode}：` : ''}{settlement.lastErrorMessage || '原目标无法继续自动结算，请明确选择处理方式。'}</Hr09Notice>
    <Hr09Select label="处置方式" required value={action} options={actions} onChange={value => { setAction(value as OvertimeResolutionAction | ''); setTargetPeriodId(''); setOriginalSlipId(''); }} />
    <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="冻结的原目标周期">{originalPeriod?.periodName ? `${originalPeriod.periodName}（${originalPeriodId}）` : originalPeriodId || '未提供'}</Hr09Value><Hr09Value label="本次明确目标">{action === 'REJECT' ? '不变更目标，仅自动处理结案' : targets.find(period => period.periodId === targetPeriodId)?.periodName || '尚未选择'}</Hr09Value></dl>
    {changingPeriod && <>
      {!periods.loading && !periods.error && canReadPeriods && !originalPeriod && <Hr09Notice danger>未能读取冻结的原目标周期，当前不能选择新周期。</Hr09Notice>}
      {!canReadPeriods ? <Hr09Notice danger>缺少相应周期读取权限，无法完成目标选择。</Hr09Notice> : periods.loading ? <Hr09State loading title="正在读取可用周期" /> : <><Hr09ErrorNotice error={periods.error} />{!periods.error && !targets.length && <Hr09Notice danger>没有符合条件的开放目标周期，当前分支被阻塞。</Hr09Notice>}</>}
      <Hr09Select label={pay ? '本次补正目标工资周期' : '本次补入目标假期周期'} required value={targetPeriodId} onChange={setTargetPeriodId} disabled={!canReadPeriods || periods.loading || Boolean(periods.error)} options={targets.map(period => ({ value: period.periodId, label: `${period.periodName} · ${period.startDate}—${period.endDate}` }))} />
    </>}
    {action === 'PAY_CORRECTION' && <>
      {slips.loading ? <Hr09State loading title="正在核实原周期的真实已发工资单" /> : <><Hr09ErrorNotice error={slips.error} />{!slips.error && !slips.data?.length && <Hr09Notice danger>CORRECTION_REQUIRES_PAID：未查到属于该员工和原目标周期的真实已发工资单，不能创建补正。</Hr09Notice>}</>}
      <Hr09Select label="原周期已发工资单" required value={originalSlipId} onChange={setOriginalSlipId} options={slips.data || []} disabled={slips.loading || Boolean(slips.error)} />
      <Hr09Notice>补正仍须经过原有工资补正审批；补正应用成功后才显示已结算，工资发放另行确认。</Hr09Notice>
    </>}
    <Hr09Textarea label="处置原因" required rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
  </Hr09FormDialog>;
}

export function HrOvertimeSettlement({ record, mine, onChanged }: { record: OvertimeDetailVO; mine: boolean; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const permitted = canReadOvertimeSettlement(record, mine, hasPermission);
  const resource = useHr09Resource(signal => hrOvertimeApi.settlement(record.requestId, signal), [record.requestId, record.version], permitted);
  const [action, setAction] = useState<'retry' | 'resolve' | null>(null);
  const [reason, setReason] = useState('');
  if (!permitted) return <Hr09Notice>当前账号无权读取此结算视图。</Hr09Notice>;
  if (resource.loading) return <Hr09State loading title="正在读取授权结算详情" />;
  if (resource.error) return <Hr09State error title="结算详情读取失败" description={resource.error.message} onRetry={resource.refresh} />;
  const settlement = resource.data;
  if (!settlement || settlement.requestId !== record.requestId || settlement.settleMode !== record.settleMode) return <Hr09Notice danger>结算返回信息与当前申请不一致，已停止展示。</Hr09Notice>;
  const pay = settlement.settleMode === 'PAY';
  const mayHandle = !mine && hasPermission(pay ? 'hr:overtime:price' : 'hr:overtime:verify') && record.status === 'APPROVED';
  const canRetry = mayHandle && hasPermission('hr:overtime:retry') && settlement.settlementStatus === 'FAILED' && hasHr09Action(settlement, 'RETRY_SETTLEMENT');
  const canResolve = mayHandle && hasPermission('hr:overtime:resolve') && settlement.settlementStatus === 'NEEDS_RESOLUTION' && hasHr09Action(settlement, 'RESOLVE_SETTLEMENT');
  const changed = () => { setAction(null); resource.refresh(); onChanged(); };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-medium text-cf-title">{pay ? '本人 / 财务授权结算' : '调休结算依据'}</h3><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={resource.refresh}>刷新结算</Button>{canRetry && <Button variant="outline" onClick={() => { setReason(''); setAction('retry'); }}>重试原结算</Button>}{canResolve && <Button variant="warning" onClick={() => setAction('resolve')}>处置结算异常</Button>}</div></div>
    <Hr09Notice>结算完成表示调休额度已处理、工资变动已建立或补正已应用；工资是否发放以工资单为准。</Hr09Notice>
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Hr09Value label="结算执行状态"><Hr09Status kind="settlement" value={settlement.settlementStatus} /></Hr09Value><Hr09Value label="处理完成时间">{dateTimeText(settlement.settleTime)}</Hr09Value><Hr09Value label="冻结的原目标周期">{pay ? settlement.payrollPeriodId : settlement.leavePeriodId}</Hr09Value>
      {pay ? <><Hr09Value label="币种">{settlement.currency}</Hr09Value><Hr09Value label="已核定基础时薪">{settlement.hourlyRate ?? '未核价'}</Hr09Value><Hr09Value label="服务端核定金额">{settlement.settlementAmount ?? '未核价'}</Hr09Value><Hr09Value label="工资变动记录">{settlement.compChangeId}</Hr09Value><Hr09Value label="关联工资补正">{settlement.payrollCorrectionId}</Hr09Value><Hr09Value label="核价时间">{dateTimeText(settlement.pricedTime)}</Hr09Value><Hr09Value label="核价依据">{settlement.priceNote}</Hr09Value></> : <><Hr09Value label="调休入账小时">{settlement.compensatoryQuantity ?? '尚未结算'}</Hr09Value><Hr09Value label="调休假种标识">{settlement.leaveTypeId}</Hr09Value><Hr09Value label="额度台账记录">{settlement.leaveLedgerId || (settlement.settlementStatus === 'SETTLED' && settlement.compensatoryQuantity != null ? '累计差额为零时不生成台账' : '尚未入账')}</Hr09Value></>}
    </dl>
    {settlement.lastErrorCode && <Hr09Notice danger>{settlement.lastErrorCode}：{settlement.lastErrorMessage || '执行未完成，请查看可用处理动作。'}</Hr09Notice>}
    {settlement.settlementStatus === 'NEEDS_RESOLUTION' && <Hr09Notice>目标周期或工资覆盖已变化，自动重试已停止，须由有权且非本人的经办人明确处置。</Hr09Notice>}
    {settlement.settlementStatus === 'REJECTED' && <Hr09Notice>{settlement.lastErrorCode === 'CORRECTION_TARGET_CLOSED' ? '补正审批通过、执行拒绝；保留真实审批结果。' : '本次自动结算已结案。'}已通过工时和原依据保留，不代表员工放弃报酬。</Hr09Notice>}
    {!pay && settlement.rounding && <section className="space-y-3"><h4 className="text-sm font-medium text-cf-title">服务端累计舍入依据</h4><Hr09Notice>按同员工、假种及原周期累计精确分钟，累计向下保留两位小时，每单只记差额；页面不重新折算。零差额也参与后续累计。</Hr09Notice><dl className="grid gap-4 sm:grid-cols-3"><Hr09Value label="原累计周期">{settlement.rounding.sourcePeriodId}</Hr09Value><Hr09Value label="本次原始分钟 / 比例">{settlement.rounding.rawMinutes} 分钟 / {settlement.rounding.ratio}</Hr09Value><Hr09Value label="本次差额小时">{settlement.rounding.currentCreditHours}</Hr09Value><Hr09Value label="累计入账小时">{settlement.rounding.cumulativeCreditHours}</Hr09Value><Hr09Value label="权威余数（每单位 1/6000 小时）">{settlement.rounding.residualNumerator}</Hr09Value><Hr09Value label="计算策略">{settlement.rounding.policy}</Hr09Value></dl></section>}
    {settlement.resolution && <section className="space-y-3"><h4 className="text-sm font-medium text-cf-title">已记录的人工处置</h4><dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="处置方式">{{ REJECT: '终止本次自动结算', COMPENSATORY_ADJUSTMENT: '额度补入', PAY_CORRECTION: '工资补正' }[settlement.resolution.action]}</Hr09Value><Hr09Value label="处置时间">{dateTimeText(settlement.resolution.handledTime)}</Hr09Value><Hr09Value label="原目标周期">{settlement.resolution.originalPeriodId}</Hr09Value><Hr09Value label="本次目标周期">{settlement.resolution.targetPeriodId || '未变更'}</Hr09Value><Hr09Value label="处置原因">{settlement.resolution.reason}</Hr09Value></dl></section>}
    {action === 'retry' && canRetry && <Hr09FormDialog title="确认重试原结算" description="仅重投原申请及原依据，不修改金额、工时、参与人或目标周期。" onClose={() => setAction(null)} onReload={changed} confirmation="确认按原依据重试；已有结算结果不会重复入账。" successText="结算重试已请求，请查看执行状态" onSubmit={async () => { await hrOvertimeApi.retry(record.requestId, { version: settlement.version, reason }); changed(); }}><Hr09Textarea label="重试原因" required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></Hr09FormDialog>}
    {action === 'resolve' && canResolve && <ResolutionDialog record={record} settlement={settlement} onClose={() => setAction(null)} onChanged={changed} />}
  </section>;
}
