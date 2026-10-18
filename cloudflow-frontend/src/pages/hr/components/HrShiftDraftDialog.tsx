import React, { useRef, useState } from 'react';
import { Button } from '@/components/common';
import { hrShiftRequestApi } from '@/services/api/hr/shift-request';
import { Hr09Error, newHr09Key, shanghaiDate, shiftDraft } from '@/services/api/hr/hr09Model';
import type { ShiftPreviewVO, ShiftRequestDetailVO } from '@/services/api/hr/hr09Types';
import { Hr09Blockers, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, Hr09Slots, Hr09State, Hr09Textarea, asOptions, dateTimeText, shiftModes, useHr09Mutation, useHr09Resource } from './Hr09Shared';

export function HrShiftDraftDialog({ record, onClose, onSaved, onReload }: { record?: ShiftRequestDetailVO; onClose: () => void; onSaved: (record: ShiftRequestDetailVO) => void; onReload: () => void }) {
  const [form, setForm] = useState({ requestMode: record?.requestMode || 'SINGLE', attendanceDate: record?.fromDate || '', targetShiftId: record?.requestMode === 'SINGLE' ? record.toShiftId : '', targetRuleId: record?.requestMode === 'SINGLE' ? record.toRuleId || '' : '', swapEmployeeId: record?.swapEmployeeId || '', reason: record?.reason || '' });
  const options = useHr09Resource(signal => hrShiftRequestApi.options(form.attendanceDate, signal), [form.attendanceDate], Boolean(form.attendanceDate));
  const [preview, setPreview] = useState<ShiftPreviewVO>();
  const [previewSignature, setPreviewSignature] = useState('');
  const [creationLocked, setCreationLocked] = useState(false);
  const creation = useRef<{ key: string; payload: ReturnType<typeof shiftDraft> } | undefined>(undefined);
  const precheck = useHr09Mutation();
  const signature = JSON.stringify(form);
  const future = Boolean(form.attendanceDate && form.attendanceDate > shanghaiDate());
  const configured = future && options.data?.attendanceDate === form.attendanceDate && Boolean(options.data.ownSlot?.employeeId && options.data.ownSlot.shiftId && options.data.ownSlot.ruleId);
  const shifts = options.data?.eligibleShifts || [];
  const peers = options.data?.eligiblePeers || [];
  const targetValid = form.requestMode === 'SWAP' ? peers.some(peer => peer.employeeId === form.swapEmployeeId) : shifts.some(shift => shift.shiftId === form.targetShiftId && shift.ruleId === form.targetRuleId);
  const ready = Boolean(configured && targetValid && preview && previewSignature === signature && Array.isArray(preview.blockers) && preview.blockers.length === 0 && Number.isInteger(preview.minimumRestMinutes) && (preview.minimumRestMinutes ?? -1) >= 0 && preview.beforeSlots?.length && preview.afterSlots?.length === preview.beforeSlots?.length);
  const change = (patch: Partial<typeof form>) => { setForm(previous => ({ ...previous, ...patch })); setPreview(undefined); setPreviewSignature(''); };
  return <Hr09FormDialog title={record ? '修改调班草稿' : '登记本人调班'} description="仅支持未来一个考勤日：本人换班，或同部门在职员工互换实际班次。互换须由对方本人同意，审批通过后才应用排班。" onClose={onClose} onReload={onReload} blocked={!ready || precheck.busy} submitText={creationLocked ? '重试保存同一草稿' : '保存草稿'} successText="调班草稿已保存，尚未提交审批" onSubmit={async () => {
    if (!ready) throw new Hr09Error('请先完成当前排班的服务端预检。', 400);
    const payload = shiftDraft(form);
    let result: ShiftRequestDetailVO;
    if (record) result = await hrShiftRequestApi.update(record.requestId, { ...payload, version: record.version });
    else {
      if (!creation.current) creation.current = { key: newHr09Key(), payload };
      setCreationLocked(true);
      result = await hrShiftRequestApi.create(creation.current.payload, creation.current.key);
    }
    onSaved(result);
  }}>
    <fieldset disabled={precheck.busy || creationLocked} className="min-w-0 space-y-4"><div className="grid gap-4 sm:grid-cols-2">
      <Hr09Input label="考勤日期（北京时间）" type="date" required value={form.attendanceDate} onChange={event => change({ attendanceDate: event.target.value, targetShiftId: '', targetRuleId: '', swapEmployeeId: '' })} />
      <Hr09Select label="调班方式" required value={form.requestMode} options={asOptions(shiftModes)} disabled={creationLocked} onChange={value => { if (value === 'SINGLE' || value === 'SWAP') change({ requestMode: value, targetShiftId: '', targetRuleId: '', swapEmployeeId: '' }); }} />
    </div>
    {!form.attendanceDate ? <Hr09Notice>先选择未来考勤日，再读取本人班次与可选对象。</Hr09Notice> : !future ? <Hr09Notice danger>考勤日期必须晚于北京时间今天；已发生的班次不可调整。</Hr09Notice> : options.loading ? <Hr09State loading title="正在读取真实排班" /> : options.error ? <Hr09State error title="排班选项读取失败" description={options.error.message} onRetry={options.refresh} /> : !configured ? <Hr09Notice danger>该日期没有完整的本人工作班次或规则，当前不能申请调班。</Hr09Notice> : <>
      <Hr09Notice>当前班次：{dateTimeText(options.data?.ownSlot.startTime)} 至 {dateTimeText(options.data?.ownSlot.endTime)}；保存及提交时重新核对原排班版本。</Hr09Notice>
      {form.requestMode === 'SINGLE' ? <Hr09Select label="目标班次及配套规则" required value={form.targetShiftId && form.targetRuleId ? `${form.targetShiftId}:${form.targetRuleId}` : ''} disabled={creationLocked} options={shifts.map(shift => ({ value: `${shift.shiftId}:${shift.ruleId}`, label: `${shift.shiftName} · ${shift.startTime}—${shift.endTime}` }))} onChange={value => { const selected = shifts.find(shift => `${shift.shiftId}:${shift.ruleId}` === value); change({ targetShiftId: selected?.shiftId || '', targetRuleId: selected?.ruleId || '' }); }} /> : <Hr09Select label="同部门互换对象" required value={form.swapEmployeeId} disabled={creationLocked} options={peers.map(peer => ({ value: peer.employeeId, label: `${peer.name} · ${peer.shiftName}` }))} onChange={value => change({ swapEmployeeId: value })} hint="目标班次和规则由对方真实排班确定，不可手动替换。" />}
      {form.requestMode === 'SINGLE' && !shifts.length || form.requestMode === 'SWAP' && !peers.length ? <Hr09Notice danger>服务端没有返回可选目标，请核实班次与参与人员配置。</Hr09Notice> : null}
    </>}
    <Hr09Textarea label="调班事由" required rows={3} maxLength={800} value={form.reason} onChange={event => change({ reason: event.target.value })} />
    <Button type="button" variant="outline" disabled={!configured || !targetValid || precheck.busy || creationLocked} onClick={() => void precheck.run(async () => {
      setPreview(undefined); setPreviewSignature('');
      const result = await hrShiftRequestApi.preview(shiftDraft(form));
      if (!Array.isArray(result.blockers) || !Array.isArray(result.beforeSlots) || !Array.isArray(result.afterSlots)) throw new Hr09Error('预检结果不完整，已阻止保存。');
      if (!result.blockers.length) {
        const employeeIds = [options.data?.ownSlot.employeeId, ...(form.requestMode === 'SWAP' ? [form.swapEmployeeId] : [])];
        if (result.beforeSlots.length !== employeeIds.length || result.afterSlots.length !== employeeIds.length || !employeeIds.every(employeeId => employeeId && result.beforeSlots.filter(slot => slot.employeeId === employeeId && slot.attendanceDate === form.attendanceDate).length === 1 && result.afterSlots.filter(slot => slot.employeeId === employeeId && slot.attendanceDate === form.attendanceDate).length === 1)) throw new Hr09Error('预检没有完整返回本次参与人员及日期的排班对照，已阻止保存。');
      }
      setPreview(result); setPreviewSignature(signature);
    })}>{precheck.busy ? '正在预检…' : '预检双方排班与休息间隔'}</Button></fieldset>
    <Hr09ErrorNotice error={precheck.error} />
    {creationLocked && <Hr09Notice>本次创建内容已固定；重试沿用同一创建标识，请勿重复登记。</Hr09Notice>}
    {preview && <div className="space-y-4"><Hr09Blockers blockers={preview.blockers} /><Hr09Slots title="本次调班前后对照" before={preview.beforeSlots} after={preview.afterSlots} names={options.data?.ownSlot ? { [options.data.ownSlot.employeeId]: '本人', ...Object.fromEntries(peers.map(peer => [peer.employeeId, peer.name])) } : {}} />
      {preview.minimumRestMinutes == null ? <Hr09Notice danger>尚未核定相邻班次最短休息分钟，当前无法保存或提交。</Hr09Notice> : <Hr09Notice>本次采用已配置的最短休息间隔：{preview.minimumRestMinutes} 分钟；服务端同时检查班次交叠、打卡、请假、封账与算薪覆盖。</Hr09Notice>}
      {preview.restGaps?.map((gap, index) => <p key={`${gap.employeeId}:${index}`} className="text-xs leading-6 text-cf-subtle">员工 {gap.employeeId}：{dateTimeText(gap.previousEnd)} 至 {dateTimeText(gap.nextStart)}，实际休息 {gap.gapMinutes} 分钟。</p>)}
    </div>}
  </Hr09FormDialog>;
}
