import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { hrOvertimeTypeApi } from '@/services/api/hr/overtime';
import { hr09References } from '@/services/api/hr/hr09Request';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import type { Hr09NamedOption, OvertimeDayType, OvertimeTypeDTO, OvertimeTypeVO } from '@/services/api/hr/hr09Types';
import { Hr09Access, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Table, Hr09Textarea, Hr09Value, asOptions, dateTimeText, dayTypes, useHr09Resource } from '../components/Hr09Shared';

function missingPolicy(record: OvertimeTypeVO) {
  const missing: string[] = [];
  if (record.maxHoursPerDay == null || record.maxHoursPerMonth == null) missing.push('日 / 月总上限');
  if (record.rateMultiplier == null || record.salaryComponentId == null) missing.push('加班费倍率及薪资项目');
  if (record.compensatoryFlag === 1 && (record.compensatoryRatio == null || record.compensatoryLeaveTypeId == null)) missing.push('调休比例及按小时管理的假种');
  if (record.needApprovalFlag !== 1) missing.push('强制审批');
  return missing;
}

function retainedOption(options: Hr09NamedOption[], value: string, label: string) {
  return value && !options.some(option => option.value === value) ? [{ value, label: `${label} ${value}（不在可用选项内，须核实）` }, ...options] : options;
}

function OvertimeTypeEditor({ record, onClose, onSaved, onReload }: { record?: OvertimeTypeVO; onClose: () => void; onSaved: (record: OvertimeTypeVO) => void; onReload: () => void }) {
  const { hasPermission } = useAuth();
  const canReadComponents = hasPermission('hr:compensation:list');
  const canReadLeaveTypes = hasPermission('hr:attendance:list');
  const components = useHr09Resource(hr09References.salaryComponents, [], canReadComponents);
  const leaveTypes = useHr09Resource(hr09References.leaveTypes, [], canReadLeaveTypes);
  const [form, setForm] = useState({ typeCode: record?.typeCode || '', typeName: record?.typeName || '', applicableDayType: record?.applicableDayType || '', rateMultiplier: record?.rateMultiplier || '', salaryComponentId: record?.salaryComponentId || '', compensatoryFlag: record?.compensatoryFlag || 0, compensatoryRatio: record?.compensatoryRatio || '', compensatoryLeaveTypeId: record?.compensatoryLeaveTypeId || '', maxHoursPerDay: record?.maxHoursPerDay || '', maxHoursPerMonth: record?.maxHoursPerMonth || '', remark: record?.remark || '' });
  const change = (patch: Partial<typeof form>) => setForm(previous => ({ ...previous, ...patch }));
  const writable = hasPermission(record ? 'hr:overtime-type:edit' : 'hr:overtime-type:add');
  return <Hr09FormDialog title={record ? '调整加班类型规则' : '新增加班类型（停用）'} description="未核定的规则保持空值；新类型保存为停用，启用须另行确认并通过服务端完整检查。" onClose={onClose} onReload={onReload} blocked={!writable} submitText="保存规则" successText={record ? '规则已保存，历史申请仍保留原依据' : '类型已保存为停用，尚未开放申请'} onSubmit={async () => {
    if (!writable) throw new Hr09Error('当前账号无权维护类型规则。', 403);
    const payload: OvertimeTypeDTO = { typeCode: form.typeCode, typeName: form.typeName, applicableDayType: form.applicableDayType as OvertimeDayType, rateMultiplier: form.rateMultiplier || null, salaryComponentId: form.salaryComponentId || null, compensatoryFlag: form.compensatoryFlag as 0 | 1, compensatoryRatio: form.compensatoryRatio || null, compensatoryLeaveTypeId: form.compensatoryLeaveTypeId || null, maxHoursPerDay: form.maxHoursPerDay || null, maxHoursPerMonth: form.maxHoursPerMonth || null, needApprovalFlag: 1, remark: form.remark };
    onSaved(record ? await hrOvertimeTypeApi.update(record.typeId, { ...payload, version: record.version }) : await hrOvertimeTypeApi.create(payload));
  }}>
    <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="类型编码" required maxLength={50} value={form.typeCode} onChange={event => change({ typeCode: event.target.value })} /><Hr09Input label="类型名称" required maxLength={100} value={form.typeName} onChange={event => change({ typeName: event.target.value })} /><Hr09Select label="适用日类型" required value={form.applicableDayType} onChange={value => change({ applicableDayType: value })} options={asOptions(dayTypes)} /><Hr09Input label="审批要求" value="必须经过正式审批" readOnly /></div>
    <Hr09Notice>日 / 月上限统计员工所有类型的实际加班；启用类型的同维度上限须一致。空值表示尚未核定，不能解释为无限制。</Hr09Notice>
    <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="每日总上限（小时）" inputMode="decimal" maxLength={9} value={form.maxHoursPerDay} onChange={event => change({ maxHoursPerDay: event.target.value })} placeholder="未核定时留空" /><Hr09Input label="每月总上限（小时）" inputMode="decimal" maxLength={9} value={form.maxHoursPerMonth} onChange={event => change({ maxHoursPerMonth: event.target.value })} placeholder="未核定时留空" /><Hr09Input label="加班费倍率" inputMode="decimal" maxLength={5} value={form.rateMultiplier} onChange={event => change({ rateMultiplier: event.target.value })} placeholder="未核定时留空" /><Hr09Select label="已启用的计税变动薪资项目" value={form.salaryComponentId} options={retainedOption(components.data || [], form.salaryComponentId, '原关联项目')} onChange={value => change({ salaryComponentId: value })} disabled={!canReadComponents || components.loading || Boolean(components.error)} placeholder="尚未核定项目" /></div>
    {!canReadComponents ? <Hr09Notice>缺少薪资项目配置读取权限，当前不能选择新项目；可保存停用类型，由有权经办人补齐后启用。</Hr09Notice> : components.loading ? <Hr09State loading title="正在读取薪资项目配置" /> : <><Hr09ErrorNotice error={components.error} />{!components.error && !components.data?.length && <Hr09Notice danger>尚无启用且计税的变动薪资项目；缺少该配置时类型不能启用。</Hr09Notice>}</>}
    <Hr09Select label="是否允许转调休" value={String(form.compensatoryFlag)} options={[{ value: '0', label: '不允许' }, { value: '1', label: '允许（须完整核定）' }]} onChange={value => { if (value === '0' || value === '1') change({ compensatoryFlag: value === '1' ? 1 : 0, ...(value === '0' ? { compensatoryRatio: '', compensatoryLeaveTypeId: '' } : {}) }); }} />
    {form.compensatoryFlag === 1 && <><div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="调休小时比例" inputMode="decimal" maxLength={5} value={form.compensatoryRatio} onChange={event => change({ compensatoryRatio: event.target.value })} placeholder="未核定时留空" /><Hr09Select label="按小时管理额度的调休假种" value={form.compensatoryLeaveTypeId} options={retainedOption(leaveTypes.data || [], form.compensatoryLeaveTypeId, '原关联假种')} onChange={value => change({ compensatoryLeaveTypeId: value })} disabled={!canReadLeaveTypes || leaveTypes.loading || Boolean(leaveTypes.error)} placeholder="尚未核定假种" /></div>{!canReadLeaveTypes ? <Hr09Notice danger>缺少假种读取权限，当前无法补齐调休配置。</Hr09Notice> : leaveTypes.loading ? <Hr09State loading title="正在读取合格调休假种" /> : <><Hr09ErrorNotice error={leaveTypes.error} />{!leaveTypes.error && !leaveTypes.data?.length && <Hr09Notice danger>没有启用、按小时管理额度且允许调休转入的假种，当前不能启用调休。</Hr09Notice>}</>}<Hr09Notice>调休按原周期累计向下保留两位小时、逐单记差额；有效期沿已实现的周期规则，未确认期限政策时保持停用。</Hr09Notice></>}
    <Hr09Textarea label="规则核定说明" maxLength={500} rows={3} value={form.remark} onChange={event => change({ remark: event.target.value })} />
  </Hr09FormDialog>;
}

function OvertimeTypeWorkspace() {
  const { hasPermission } = useAuth();
  const list = useHr09Resource(async signal => { const result = await hrOvertimeTypeApi.list(signal); if (!Array.isArray(result)) throw new Hr09Error('类型列表返回格式不完整。'); return result; }, []);
  const [selectedId, setSelectedId] = useState('');
  const detail = useHr09Resource(signal => hrOvertimeTypeApi.detail(selectedId, signal), [selectedId], Boolean(selectedId));
  const [editor, setEditor] = useState<{ record?: OvertimeTypeVO } | null>(null);
  const [statusChange, setStatusChange] = useState<OvertimeTypeVO | null>(null);
  const [reason, setReason] = useState('');
  const refresh = () => { list.refresh(); detail.refresh(); };
  const reload = () => { setEditor(null); setStatusChange(null); refresh(); };
  const saved = (record: OvertimeTypeVO) => { setSelectedId(record.typeId); refresh(); };
  const record = detail.data;
  return <Hr09Page title="加班规则" description="维护真实加班类型与已核定规则；不设置默认公司上限、时薪、审批人或最短休息时长。" actions={<><Button variant="outline" disabled={list.loading} onClick={refresh}><RefreshCw size={16} className="mr-2" />刷新</Button>{hasPermission('hr:overtime-type:add') && <Button onClick={() => setEditor({})}><Plus size={16} className="mr-2" />新增加班类型</Button>}</>}>
    <Hr09Notice>新类型仅创建为停用。日历、规则效果、薪资项目、调休期限或审批配置未明确时，相关申请仍由服务端明确阻塞。</Hr09Notice>
    <div className="card"><Hr09Table rows={list.data || []} rowKey={row => row.typeId} loading={list.loading} error={list.error} onRefresh={list.refresh} emptyText="尚未配置加班类型" columns={[
      { key: 'type', label: '类型 / 编码', render: row => <>{row.typeName}<div className="mt-1 text-xs text-cf-subtle">{row.typeCode}</div></> }, { key: 'day', label: '适用日类型', render: row => dayTypes[row.applicableDayType] || '未知类型' },
      { key: 'limits', label: '日 / 月总上限（小时）', render: row => <>{row.maxHoursPerDay ?? '未核定'} / {row.maxHoursPerMonth ?? '未核定'}</> }, { key: 'rate', label: '加班费倍率', render: row => row.rateMultiplier ?? '未核定' },
      { key: 'compensatory', label: '调休比例', render: row => row.compensatoryFlag === 1 ? row.compensatoryRatio ?? '未核定' : '未开放调休' },
      { key: 'status', label: '启用状态', render: row => <span className="inline-flex rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] px-2 py-1 text-xs">{row.status === 1 ? '已启用' : row.status === 0 ? '停用 / 待核定' : '未知状态'}</span> },
      { key: 'action', label: '操作', render: row => <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setSelectedId(row.typeId)}>查看 / 配置</Button> },
    ]} /></div>
    <BaseDialog open={Boolean(selectedId) && !editor && !statusChange} title={record ? `${record.typeName} · 类型规则` : '类型规则'} onClose={() => setSelectedId('')} width="wide" footer={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={detail.refresh}>重新读取</Button>{record && hasPermission('hr:overtime-type:edit') && <><Button variant="outline" onClick={() => setEditor({ record })}>调整规则</Button><Button variant={record.status === 1 ? 'warning' : 'default'} onClick={() => { setReason(''); setStatusChange(record); }} disabled={record.status !== 0 && record.status !== 1}>{record.status === 1 ? '停用类型' : '校验并启用'}</Button></>}</div>}>
      {detail.loading ? <Hr09State loading title="正在读取类型规则" /> : detail.error ? <Hr09State error title="规则读取失败" description={detail.error.message} onRetry={detail.refresh} /> : record ? <div className="space-y-4"><dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="类型名称 / 编码">{record.typeName} / {record.typeCode}</Hr09Value><Hr09Value label="适用日类型">{dayTypes[record.applicableDayType]}</Hr09Value><Hr09Value label="每日 / 每月总上限（小时）">{record.maxHoursPerDay ?? '未核定'} / {record.maxHoursPerMonth ?? '未核定'}</Hr09Value><Hr09Value label="加班费倍率">{record.rateMultiplier ?? '未核定'}</Hr09Value><Hr09Value label="薪资项目标识">{record.salaryComponentId ?? '未核定'}</Hr09Value><Hr09Value label="调休比例">{record.compensatoryFlag === 1 ? record.compensatoryRatio ?? '未核定' : '不允许转调休'}</Hr09Value><Hr09Value label="调休假种标识">{record.compensatoryFlag === 1 ? record.compensatoryLeaveTypeId ?? '未核定' : '不适用'}</Hr09Value><Hr09Value label="审批要求">必须经过正式审批</Hr09Value><Hr09Value label="当前状态 / 版本">{record.status === 1 ? '已启用' : '停用'} / {record.version}</Hr09Value><Hr09Value label="更新时间">{dateTimeText(record.updateTime)}</Hr09Value><Hr09Value label="核定说明">{record.remark}</Hr09Value></dl>{missingPolicy(record).length > 0 && <Hr09Notice danger>尚未核定：{missingPolicy(record).join('、')}。当前不能启用。</Hr09Notice>}</div> : <Hr09State error title="未返回类型详情" onRetry={detail.refresh} />}
    </BaseDialog>
    {editor && <OvertimeTypeEditor record={editor.record} onClose={() => setEditor(null)} onSaved={saved} onReload={reload} />}
    {statusChange && <Hr09FormDialog title={statusChange.status === 1 ? '确认停用加班类型' : '核验并启用加班类型'} onClose={() => setStatusChange(null)} onReload={reload} blocked={!hasPermission('hr:overtime-type:edit') || statusChange.status === 0 && missingPolicy(statusChange).length > 0} confirmation={statusChange.status === 1 ? '确认停用后停止新申请匹配；已提交申请保留原核定依据。' : '确认已核定日月上限、倍率、薪资项目及启用的调休政策；服务端检查失败时保持停用。'} successText="类型状态已更新" onSubmit={async () => {
      if (!hasPermission('hr:overtime-type:edit')) throw new Hr09Error('当前账号无权启停加班类型。', 403);
      saved(await hrOvertimeTypeApi.status(statusChange.typeId, { version: statusChange.version, status: statusChange.status === 1 ? 0 : 1, reason }));
    }}><Hr09Notice>{statusChange.typeName} · {dayTypes[statusChange.applicableDayType]} · 当前版本 {statusChange.version}</Hr09Notice>{statusChange.status === 0 && missingPolicy(statusChange).length > 0 && <Hr09Notice danger>尚未核定：{missingPolicy(statusChange).join('、')}。请先调整规则，不能绕过检查启用。</Hr09Notice>}<Hr09Textarea label="启停原因" required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></Hr09FormDialog>}
  </Hr09Page>;
}

export default function HrOvertimeTypePage() {
  return <Hr09Access permission="hr:overtime-type:list"><OvertimeTypeWorkspace /></Hr09Access>;
}
