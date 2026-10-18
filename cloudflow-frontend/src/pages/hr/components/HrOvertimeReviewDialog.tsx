import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { hrOvertimeApi } from '@/services/api/hr/overtime';
import { hr09References } from '@/services/api/hr/hr09Request';
import { Hr09Error, hasHr09Action } from '@/services/api/hr/hr09Model';
import type { OvertimeDetailVO } from '@/services/api/hr/hr09Types';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, Hr09Value, minutesText, useHr09Resource } from './Hr09Shared';

export type OvertimeReviewAction = 'REVIEW_HOURS' | 'REVIEW_PAY' | 'REVIEW_REJECT';

export function HrOvertimeReviewDialog({ action, record, onClose, onSaved, onReload }: { action: OvertimeReviewAction; record: OvertimeDetailVO; onClose: () => void; onSaved: (record: OvertimeDetailVO) => void; onReload: () => void }) {
  const { hasPermission } = useAuth();
  const [minutes, setMinutes] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [note, setNote] = useState('');
  const isPay = action === 'REVIEW_PAY';
  const title = { REVIEW_HOURS: '核定实际加班工时', REVIEW_PAY: '核定加班费与工资周期', REVIEW_REJECT: '拒绝本次业务核定' }[action];
  const permitted = hasHr09Action(record, action) && hasPermission(isPay ? 'hr:overtime:price' : 'hr:overtime:verify') && record.status === 'SUBMITTED';
  const canReadPeriods = isPay && permitted && hasPermission('hr:payroll:list');
  const periods = useHr09Resource(hr09References.payrollPeriods, [], canReadPeriods);
  const availablePeriods = periods.data?.filter(period => period.status === 'OPEN' && period.startDate > record.workDate) || [];
  const ready = permitted && (!isPay || canReadPeriods && !periods.loading && !periods.error && availablePeriods.some(period => period.periodId === periodId));
  return <Hr09FormDialog title={title} description="核定仅准备正式审批依据；经办人不能核定本人申请，正式结果由工作流返回。" onClose={onClose} onReload={onReload} blocked={!ready} confirmation={action === 'REVIEW_REJECT' ? '确认拒绝本次核定；此申请将结束，保留原始记录。' : '已核对实际证据及本次核定内容；核定后不覆盖原依据，有误须在正式审批前撤回重建。'} successText={action === 'REVIEW_REJECT' ? '本次核定已拒绝' : '核定已保存，请以最新申请状态为准'} onSubmit={async () => {
    if (!permitted) throw new Hr09Error('当前记录不允许执行此核定。', 403);
    let result: OvertimeDetailVO;
    if (action === 'REVIEW_HOURS') {
      const approvedMinutes = Number(minutes);
      if (!Number.isInteger(approvedMinutes) || approvedMinutes <= 0 || record.actualMinutes == null || approvedMinutes > record.actualMinutes) throw new Hr09Error('核定分钟须为正整数，且不能超过服务端实际分钟。', 400);
      result = await hrOvertimeApi.reviewHours(record.requestId, { version: record.version, approvedMinutes, note });
    } else if (isPay) result = await hrOvertimeApi.reviewPay(record.requestId, { version: record.version, hourlyRate, payrollPeriodId: periodId, note });
    else result = await hrOvertimeApi.reviewReject(record.requestId, { version: record.version, reason: note });
    onSaved(result);
  }}>
    {!permitted && <Hr09Notice danger>当前账号权限或单据状态不支持此动作，请重新读取记录。</Hr09Notice>}
    <dl className="grid gap-4 sm:grid-cols-3"><Hr09Value label="申请人">{record.employeeName}</Hr09Value><Hr09Value label="实际工时">{minutesText(record.actualMinutes)}</Hr09Value><Hr09Value label="已核定工时">{minutesText(record.approvedMinutes)}</Hr09Value></dl>
    {action === 'REVIEW_HOURS' && <Hr09Input label="本次核定分钟" type="number" min={1} max={record.actualMinutes ?? undefined} step={1} required value={minutes} onChange={event => setMinutes(event.target.value)} hint="不按展示小时反算分钟，不允许超过打卡核算的实际分钟。" />}
    {isPay && <>
      {!canReadPeriods ? <Hr09Notice danger>缺少工资周期读取权限，无法完成核价；请由有权财务经办。</Hr09Notice> : periods.loading ? <Hr09State loading title="正在读取工资周期" /> : <><Hr09ErrorNotice error={periods.error} />{!periods.error && !availablePeriods.length && <Hr09Notice danger>没有可选择的后续开放工资周期，当前核价被阻塞。</Hr09Notice>}</>}
      <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="基础时薪（元/小时）" inputMode="decimal" maxLength={19} required autoComplete="off" value={hourlyRate} onChange={event => setHourlyRate(event.target.value)} hint="最多 16 位整数、2 位小数；页面不试算金额。" /><Hr09Select label="明确目标工资周期" required value={periodId} onChange={setPeriodId} options={availablePeriods.map(period => ({ value: period.periodId, label: `${period.periodName} · ${period.startDate}—${period.endDate}` }))} disabled={!canReadPeriods || periods.loading || Boolean(periods.error)} hint="须为该员工下一有效周期，服务端复核工资覆盖；审批期间不会自动更换目标。" /></div>
      <Hr09Notice>金额由服务端按核定分钟、基础时薪与冻结倍率计算；核价和结算详情仅向本人及有权财务提供。</Hr09Notice>
    </>}
    <Hr09Textarea label={action === 'REVIEW_REJECT' ? '拒绝原因' : isPay ? '核价依据' : '核定依据'} required maxLength={500} rows={3} value={note} onChange={event => setNote(event.target.value)} />
  </Hr09FormDialog>;
}
