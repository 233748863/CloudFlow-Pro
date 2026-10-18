import { useCallback, useEffect, useState } from 'react';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { meetingApi, type MeetingBooking, type MeetingConflicts, type MeetingEvent, type MeetingId, type MeetingRoomView, type MeetingSeriesPreview } from '@/services/api/meeting';
import { getErrorMessage } from '@/utils/errorMessage';
import { backendTime, dayString, localTime, MeetingConflictNotice, MeetingError, MeetingField, MeetingPagination, MeetingPeoplePicker, meetingRows, readArray, sameId, useMeetingData } from './meetingUi';
import './meeting.css';

function RoomPicker({ command, onChoose, onClose }: { command: MeetingBooking; onChoose: (room: MeetingRoomView) => void; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [equipment, setEquipment] = useState(''); const [tags, setTags] = useState<string[]>([]);
  const loader = useCallback(() => meetingApi.available({ start: command.startTime, end: command.endTime, capacity: command.expectedAttendees, equipment: tags, pageNum: page, pageSize: 20 }), [command.startTime, command.endTime, command.expectedAttendees, tags, page]);
  const { data, loading, error, refresh } = useMeetingData(loader);
  return <BaseDialog open title="选择可预约会议室" onClose={onClose} width="wide" panelClassName="meeting-dialog"><div className="space-y-4"><p className="text-sm text-cf-subtle">按当前时段、人数及房间规则核查；提交时仍会重新锁定核验。</p>
    <div className="flex gap-2"><Input aria-label="所需设备标签" placeholder="设备标签，逗号分隔" value={equipment} onChange={(event) => setEquipment(event.target.value)} /><Button onClick={() => { setTags(equipment.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)); setPage(1); }}>筛选</Button></div>
    <MeetingError message={error} />{error && <Button onClick={refresh}>重试</Button>}{loading ? <p role="status">正在核查可预约房间…</p> : <div className="grid gap-3 sm:grid-cols-2">{meetingRows(data).map((room) => <Button key={room.roomId} variant="outline" className="h-auto justify-start py-3 text-left" onClick={() => onChoose(room)}><span>{room.name}<span className="block text-xs text-cf-subtle">{room.location || '未填写位置'} · {room.capacity ?? '未限制'}人{room.needApprovalFlag === 1 ? ' · 须审批' : ''}</span></span></Button>)}{!error && !data?.total && <p className="text-sm text-cf-subtle">此时段没有满足条件的空闲会议室，请调整时间或条件。</p>}</div>}
    <MeetingPagination total={data?.total ?? 0} page={page} pageSize={20} onChange={setPage} />
  </div></BaseDialog>;
}

export default function MeetingEditor({ initial, seedRoom, seedStart, names: initialNames = {}, onClose, onSaved }: {
  initial?: MeetingEvent; seedRoom?: MeetingRoomView; seedStart?: string; names?: Record<string, string>;
  onClose: () => void; onSaved: (event: MeetingEvent) => void;
}) {
  const { user, hasPermission } = useAuth();
  const [command, setCommand] = useState<MeetingBooking>(() => {
    const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
    const starting = initial?.startTime || seedStart || `${dayString(start)} ${String(start.getHours()).padStart(2, '0')}:00:00`;
    const ending = new Date(starting.replace(' ', 'T')); ending.setHours(ending.getHours() + 1);
    return { version: initial?.version, title: initial?.title || '', description: initial?.description || '', roomId: initial?.roomId ?? seedRoom?.roomId ?? null,
      startTime: starting, endTime: initial?.endTime || `${dayString(ending)} ${String(ending.getHours()).padStart(2, '0')}:${String(ending.getMinutes()).padStart(2, '0')}:00`,
      expectedAttendees: initial?.expectedAttendees ?? 1, attendeeIds: readArray<MeetingId>(initial?.attendees).filter((id) => !sameId(id, user?.id)),
      joinUrl: initial?.joinUrl || '', meetingPlatform: initial?.meetingPlatform || '', reminders: readArray(initial?.reminders),
      draft: initial?.approvalStatus === 'DRAFT', confirmParticipantConflicts: false, timezoneId: 'Asia/Shanghai',
      recurrenceRule: initial?.recurrenceRole === 'SERIES' ? initial.recurrenceRule : '', recurrenceEndDate: initial?.recurrenceRole === 'SERIES' ? initial.recurrenceEndDate : undefined };
  });
  const [names, setNames] = useState(initialNames); const [roomName, setRoomName] = useState(seedRoom?.name || (initial?.roomId ? `会议室 #${initial.roomId}` : '不占用实体会议室'));
  const [picker, setPicker] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<MeetingConflicts | null>(null); const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<MeetingSeriesPreview | null>(null); const [seriesConfirmed, setSeriesConfirmed] = useState(false);
  const [email, setEmail] = useState<{ ready: boolean; reason?: string }>();
  const series = initial?.recurrenceRole === 'SERIES' || Boolean(command.recurrenceRule?.trim());
  useEffect(() => { let current = true; meetingApi.emailReadiness().then((value) => { if (current) setEmail(value); }).catch(() => { if (current) setEmail({ ready: false, reason: '邮件服务未核实；站内通知和预约仍可使用' }); }); return () => { current = false; }; }, []);
  const changed = (values: Partial<MeetingBooking>) => { setCommand((previous) => ({ ...previous, ...values })); setConflicts(null); setConfirmed(false); setPreview(null); setSeriesConfirmed(false); setError(''); };
  const validate = () => {
    if (!command.title.trim()) throw new Error('请填写会议标题');
    if (!command.startTime || !command.endTime || command.endTime <= command.startTime) throw new Error('结束时间必须晚于开始时间');
    if (!Number.isInteger(command.expectedAttendees) || command.expectedAttendees < 1) throw new Error('预计人数须为正整数');
  };
  const review = async () => {
    setError(''); setBusy(true); setConfirmed(false); setSeriesConfirmed(false); setConflicts(null); setPreview(null);
    try {
      validate();
      if (series) {
        const result = await meetingApi.previewSeries({ ...command, draft: false }, initial?.recurrenceRole === 'SERIES' ? initial.eventId : undefined);
        setPreview(result); setConflicts(result.participantConflicts);
      } else {
        const people = [...new Set([String(user?.id || ''), ...command.attendeeIds.map(String)].filter(Boolean))];
        setConflicts(await meetingApi.participantBusy(people, command.startTime, command.endTime, initial?.eventId));
      }
    } catch (failure) { setError(getErrorMessage(failure, '预约核查失败')); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setError(''); setBusy(true);
    try {
      validate();
      if (!command.draft || series) {
        if (!conflicts) throw new Error('请先核查参与者与周期实例');
        if ((!conflicts.crmVerified || conflicts.busy.length > 0) && !confirmed) throw new Error('请查看并明确确认参与者冲突提示');
      }
      const body = { ...command, title: command.title.trim(), recurrenceRule: series ? command.recurrenceRule?.trim() : undefined,
        recurrenceEndDate: series ? command.recurrenceEndDate : undefined, confirmParticipantConflicts: confirmed, confirmSeriesChanges: seriesConfirmed, impactDigest: preview?.impactDigest };
      let result: MeetingEvent;
      if (series) {
        if (!preview?.canSubmit || !seriesConfirmed) throw new Error('请解决阻止提交的冲突，并确认本次全部周期实例影响清单');
        const response = initial ? await meetingApi.updateSeries(initial.eventId, { ...body, draft: false }) : await meetingApi.createSeries({ ...body, draft: false });
        result = response.instances[0] ?? response.series;
      } else result = initial ? await meetingApi.update(initial.eventId, body) : await meetingApi.create(body);
      onSaved(result);
    } catch (failure) { setError(getErrorMessage(failure, '预约保存失败，请核对最新数据后重试')); }
    finally { setBusy(false); }
  };
  const maySave = initial ? hasPermission(series ? 'oa:meeting:series' : 'oa:meeting:edit-own') : hasPermission(series ? 'oa:meeting:series' : 'oa:meeting:book');
  return <><BaseDialog open title={initial ? series ? '修改整个周期会议' : '修改本人会议' : '新建会议预约'} description="会议室占位、人员确认和实际出席分别记录，时区为北京时间。" width="extra-wide" onClose={() => { if (!busy) onClose(); }} panelClassName="meeting-dialog" footer={<><Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button><Button variant="outline" disabled={busy} onClick={() => void review()}>{series ? '预览全部周期实例' : '核查参与者时间'}</Button><Button disabled={busy || !maySave} onClick={() => void save()}>{busy ? '处理中…' : command.draft && !series ? '保存预约草稿' : initial ? '确认保存' : '确认预约'}</Button></>}>
    <div className="space-y-5"><MeetingError message={error} /><div className="meeting-fields">
      <MeetingField label="会议标题"><Input aria-label="会议标题" value={command.title} maxLength={200} disabled={busy} onChange={(event) => changed({ title: event.target.value })} /></MeetingField>
      <MeetingField label="预计人数（含发起人）"><Input aria-label="预计人数" type="number" min={1} step={1} value={command.expectedAttendees} disabled={busy} onChange={(event) => changed({ expectedAttendees: Number(event.target.value) })} /></MeetingField>
      <MeetingField label="开始时间"><Input aria-label="会议开始时间" type="datetime-local" value={localTime(command.startTime)} disabled={busy} onChange={(event) => changed({ startTime: event.target.value ? backendTime(event.target.value) : '' })} /></MeetingField>
      <MeetingField label="结束时间"><Input aria-label="会议结束时间" type="datetime-local" value={localTime(command.endTime)} disabled={busy} onChange={(event) => changed({ endTime: event.target.value ? backendTime(event.target.value) : '' })} /></MeetingField>
      <MeetingField label="会议室"><p className="text-sm">{roomName}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !command.startTime || !command.endTime} onClick={() => setPicker(true)}>查询可预约房间</Button>{command.roomId != null && <Button variant="ghost" disabled={busy} onClick={() => { changed({ roomId: null }); setRoomName('不占用实体会议室'); }}>改为线上 / 无会议室</Button>}</div></MeetingField>
      <MeetingField label="线上会议链接（可选）" hint="只保存HTTPS链接，系统不会访问该地址。"><Input aria-label="线上会议链接" type="url" value={command.joinUrl} maxLength={1000} disabled={busy} onChange={(event) => changed({ joinUrl: event.target.value })} /></MeetingField>
      <MeetingField label="会议平台（可选）"><Input aria-label="会议平台" value={command.meetingPlatform} maxLength={30} disabled={busy} onChange={(event) => changed({ meetingPlatform: event.target.value })} /></MeetingField>
    </div>
    <MeetingField label="说明"><Textarea aria-label="会议说明" value={command.description} disabled={busy} onChange={(event) => changed({ description: event.target.value })} /></MeetingField>
    <MeetingField label="邀请参与者"><fieldset disabled={busy}><MeetingPeoplePicker value={command.attendeeIds} names={names} onNamesChange={setNames} onChange={(attendeeIds) => changed({ attendeeIds, expectedAttendees: Math.max(command.expectedAttendees, attendeeIds.length + 1) })} /></fieldset></MeetingField>
    <section className="meeting-review"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">会前提醒</h3><Button variant="outline" disabled={busy || command.reminders.length >= 10} onClick={() => changed({ reminders: [...command.reminders, { remindMinutesBefore: 15, channelType: 'INTERNAL' }] })}>添加提醒（最多10组）</Button></div>
      {email && !email.ready && <p role="status" className="text-sm">{email.reason || '邮件渠道未配置，邮件不会发送；站内通知仍可使用。'}</p>}
      {command.reminders.map((reminder, index) => <div key={index} className="flex flex-wrap items-center gap-2"><span className="text-sm">提前分钟</span><Input className="w-28" aria-label={`提醒${index + 1}提前分钟`} type="number" min={0} max={43200} step={1} value={reminder.remindMinutesBefore} disabled={busy} onChange={(event) => changed({ reminders: command.reminders.map((entry, position) => position === index ? { ...entry, remindMinutesBefore: Number(event.target.value) } : entry) })} /><select className="meeting-select !w-auto" aria-label={`提醒${index + 1}渠道`} value={reminder.channelType} disabled={busy} onChange={(event) => changed({ reminders: command.reminders.map((entry, position) => position === index ? { ...entry, channelType: event.target.value as 'INTERNAL' | 'EMAIL' } : entry) })}><option value="INTERNAL">站内消息</option><option value="EMAIL">邮件{email?.ready === false ? '（当前未配置）' : ''}</option></select><Button variant="ghost" disabled={busy} onClick={() => changed({ reminders: command.reminders.filter((_entry, position) => position !== index) })}>移除此提醒</Button></div>)}
      <p className="text-xs text-cf-subtle">预约成功会发送站内邀请；排队、未配置和结果未知均不记为已送达。</p>
    </section>
    {hasPermission('oa:meeting:series') && (!initial || initial.recurrenceRole === 'SERIES') && <section className="meeting-review"><h3 className="font-medium">周期会议</h3><div className="flex flex-wrap gap-2">{[['', '单次'], ['FREQ=DAILY;COUNT=5', '每日，共5次'], ['FREQ=WEEKLY;COUNT=5', '每周，共5次'], ['FREQ=MONTHLY;COUNT=5', '每月同日，共5次']].map(([rule, label]) => <Button key={label} variant="outline" disabled={busy || Boolean(initial && !rule)} onClick={() => changed({ recurrenceRule: rule, draft: false })}>{label}</Button>)}</div>{series && <div className="meeting-fields"><MeetingField label="周期规则" hint="RRULE = 服务端按日历规则展开实际会议；须含COUNT次数或UNTIL截止日期，最多500次。"><Input aria-label="周期规则" value={command.recurrenceRule} disabled={busy} onChange={(event) => changed({ recurrenceRule: event.target.value, draft: false })} /></MeetingField><MeetingField label="额外截止日期（可选）" hint="与规则内结束条件取较早日期；结束日期对应当前北京时间。"><Input aria-label="周期截止日期" type="date" value={command.recurrenceEndDate || ''} disabled={busy} onChange={(event) => changed({ recurrenceEndDate: event.target.value || undefined })} /></MeetingField></div>}</section>}
    {!series && <label className="meeting-checkbox"><input type="checkbox" checked={command.draft} disabled={busy} onChange={(event) => changed({ draft: event.target.checked })} />先保存草稿（不占位、不发邀请，提交后才生效）</label>}
    <MeetingConflictNotice value={conflicts} confirmed={confirmed} onConfirm={setConfirmed} names={{ ...names, [String(user?.id)]: '本人' }} />
    {preview && <section className="meeting-review"><h3 className="font-medium">全部实例影响清单 · {preview.changes.length}项</h3><div className="max-h-64 overflow-auto"><table className="unity-data-table w-full"><thead><tr><th>发生时间</th><th>操作</th><th>说明</th></tr></thead><tbody>{preview.changes.map((change, index) => <tr key={`${change.originalStartTime}:${index}`}><td>{change.startTime}<div className="text-xs">至 {change.endTime}</div></td><td>{{ CREATE: '新增', UPDATE: '更新', KEEP: '保留原样', CANCEL: '取消', BLOCK: '冲突阻止' }[change.action] || change.action}</td><td>{change.reason || '通过本次预检'}</td></tr>)}</tbody></table></div>{!preview.canSubmit && <MeetingError message="存在阻止提交的冲突，本次不会创建或修改任何实例。" />}<label className="meeting-checkbox"><input type="checkbox" checked={seriesConfirmed} disabled={busy || !preview.canSubmit} onChange={(event) => setSeriesConfirmed(event.target.checked)} />已确认本次全部实例影响清单，保留已发生、独立改期和已取消的实例</label></section>}
    </div>
  </BaseDialog>{picker && <RoomPicker command={command} onClose={() => setPicker(false)} onChoose={(room) => { changed({ roomId: room.roomId }); setRoomName(room.name); setPicker(false); }} />}</>;
}
