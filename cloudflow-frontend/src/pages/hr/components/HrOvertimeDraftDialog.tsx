import React, { useRef, useState } from 'react';
import { Button } from '@/components/common';
import { hrOvertimeApi } from '@/services/api/hr/overtime';
import { Hr09Error, newHr09Key, overtimeDraft } from '@/services/api/hr/hr09Model';
import type { OvertimeDetailVO, OvertimePreviewVO, SettleMode } from '@/services/api/hr/hr09Types';
import { Hr09Blockers, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Segments, Hr09Select, Hr09State, Hr09Textarea, Hr09Value, minutesText, settleModes, useHr09Mutation, useHr09Resource } from './Hr09Shared';

export function HrOvertimeDraftDialog({ record, onClose, onSaved, onReload }: { record?: OvertimeDetailVO; onClose: () => void; onSaved: (record: OvertimeDetailVO) => void; onReload: () => void }) {
  const options = useHr09Resource(hrOvertimeApi.options, []);
  const [form, setForm] = useState({ startTime: record?.startTime?.replace(' ', 'T').slice(0, 16) || '', endTime: record?.endTime?.replace(' ', 'T').slice(0, 16) || '', settleMode: record?.settleMode || '' as SettleMode | '', reason: record?.reason || '' });
  const [preview, setPreview] = useState<OvertimePreviewVO>();
  const [previewSignature, setPreviewSignature] = useState('');
  const [creationLocked, setCreationLocked] = useState(false);
  const creation = useRef<{ key: string; payload: ReturnType<typeof overtimeDraft> } | undefined>(undefined);
  const precheck = useHr09Mutation();
  const signature = JSON.stringify(form);
  const modes = Array.from(new Set(options.data?.types?.flatMap(type => type.eligibleSettleModes || []) || []))
    .filter(mode => mode === 'PAY' || mode === 'COMPENSATORY').map(value => ({ value, label: settleModes[value] }));
  const configured = options.data?.businessTimezone === 'Asia/Shanghai' && modes.length > 0;
  const ready = Boolean(configured && preview && previewSignature === signature && Array.isArray(preview.blockers) && preview.blockers.length === 0 && preview.eligibleSettleModes?.includes(form.settleMode as SettleMode));
  const change = (field: keyof typeof form, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }));
    setPreview(undefined);
    setPreviewSignature('');
  };
  const check = () => precheck.run(async () => {
    setPreview(undefined);
    setPreviewSignature('');
    const result = await hrOvertimeApi.preview(overtimeDraft({ ...form, settleMode: form.settleMode as SettleMode }));
    if (!Array.isArray(result.blockers) || !result.blockers.length && !Array.isArray(result.eligibleSettleModes)) throw new Hr09Error('预检结果不完整，已阻止保存，请重新读取。');
    setPreview(result);
    setPreviewSignature(signature);
  });
  return <Hr09FormDialog title={record ? '修改加班草稿' : '登记本人加班'} description="使用北京时间；类型由服务端日历确定。草稿不产生调休或工资，时段结束并完成打卡后才能提交核定。" onClose={onClose} onReload={onReload} submitText={creationLocked ? '重试保存同一草稿' : '保存草稿'} successText="加班草稿已保存，尚未提交核定" blocked={!ready || precheck.busy} onSubmit={async () => {
    if (!ready) throw new Hr09Error('请先完成当前内容的服务端预检。', 400);
    const payload = overtimeDraft({ ...form, settleMode: form.settleMode as SettleMode });
    let result: OvertimeDetailVO;
    if (record) result = await hrOvertimeApi.update(record.requestId, { ...payload, version: record.version });
    else {
      if (!creation.current) creation.current = { key: newHr09Key(), payload };
      setCreationLocked(true);
      result = await hrOvertimeApi.create(creation.current.payload, creation.current.key);
    }
    onSaved(result);
  }}>
    {options.loading ? <Hr09State loading title="正在读取可申请配置" /> : options.error ? <Hr09State error title="申请配置读取失败" description={options.error.message} onRetry={options.refresh} /> : !configured ? <Hr09Notice danger>尚未配置可申请的加班类型、补偿方式或北京时间规则。请由有权经办人核定后再登记，当前无法保存。</Hr09Notice> : null}
    <fieldset disabled={!configured || precheck.busy || creationLocked} className="min-w-0 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="开始时间（北京时间）" type="datetime-local" step={60} required value={form.startTime} onChange={event => change('startTime', event.target.value)} /><Hr09Input label="结束时间（北京时间）" type="datetime-local" step={60} required value={form.endTime} onChange={event => change('endTime', event.target.value)} /></div>
      <Hr09Select label="补偿方式" required value={form.settleMode} options={modes} disabled={!configured || creationLocked} onChange={value => change('settleMode', value)} hint="仅展示服务端已开放的方式；本次日期是否适用以预检为准。" />
      <Hr09Textarea label="加班事由" required rows={3} maxLength={800} value={form.reason} onChange={event => change('reason', event.target.value)} />
      <Button type="button" variant="outline" disabled={precheck.busy || !configured || creationLocked} onClick={() => void check()}>{precheck.busy ? '正在预检…' : '预检当前申请'}</Button>
    </fieldset>
    <Hr09ErrorNotice error={precheck.error} />
    {creationLocked && <Hr09Notice>本次创建内容已固定；重试沿用同一创建标识。若请求未返回，请先确认列表结果，避免重新登记同一时段。</Hr09Notice>}
    {preview && <section className="space-y-4"><h3 className="text-sm font-medium text-cf-title">服务端核算预览</h3><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Hr09Value label="自然加班日">{preview.workDate}</Hr09Value><Hr09Value label="考勤归属日">{preview.attendanceDate}</Hr09Value><Hr09Value label="自动匹配类型">{preview.overtimeTypeName}</Hr09Value>
      <Hr09Value label="申请区间">{minutesText(preview.requestedMinutes)}</Hr09Value><Hr09Value label="实际可核定">{minutesText(preview.actualMinutes)}</Hr09Value><Hr09Value label="班次阈值">{minutesText(preview.thresholdMinutes)}</Hr09Value>
    </dl><Hr09Blockers blockers={preview.blockers} warnings={preview.warnings || []} /><Hr09Segments segments={preview.segments || []} />{!ready && preview.blockers.length === 0 && <Hr09Notice danger>所选补偿方式不适用于当前日期，或预检依据不完整；请调整后重新预检。</Hr09Notice>}{ready && <Hr09Notice>预检通过，可保存草稿；提交核定时服务端仍会重新检查证据、上限及配置。</Hr09Notice>}</section>}
  </Hr09FormDialog>;
}
