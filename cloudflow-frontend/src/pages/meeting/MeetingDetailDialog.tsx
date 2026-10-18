import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BaseDialog, Button, Textarea } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { meetingApi, type MeetingConflicts, type MeetingDetail, type MeetingEvent, type MeetingId, type MeetingStatus } from '@/services/api/meeting';
import { getErrorMessage } from '@/utils/errorMessage';
import MeetingEditor from './MeetingEditor';
import { acceptanceStatus, approvalStatus, deliveryStatus, MeetingConflictNotice, MeetingError, MeetingField, meetingStatus, readArray, sameId, useMeetingData } from './meetingUi';
import './meeting.css';

type MeetingAction = 'SUBMIT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NOT_HELD';
const actionNames: Record<MeetingAction, string> = { SUBMIT: '提交预约草稿', IN_PROGRESS: '开始会议', COMPLETED: '结束会议', CANCELLED: '取消会议', NOT_HELD: '标记未举行' };
const noticeNames: Record<string, string> = { REMINDER: '会前提醒', INVITE: '会议邀请', UPDATED: '会议更新', APPROVED: '审批通过', CANCELLED: '取消通知', NOT_HELD: '未举行通知', CORRECTION: '旧通知更正' };

function MeetingActionDialog({ detail, action, onClose, onSaved }: { detail: MeetingDetail; action: MeetingAction; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<MeetingConflicts | null>(null); const [confirmed, setConfirmed] = useState(false);
  const requiresReason = action === 'CANCELLED' || action === 'NOT_HELD';
  const execute = async () => {
    setError(''); setBusy(true);
    try {
      if (requiresReason && (!reason.trim() || reason.trim().length > 500)) throw new Error('请填写1至500字的原因');
      if (action === 'SUBMIT') {
        if (!conflicts) {
          const result = await meetingApi.participantBusy(readArray(detail.event.attendees), detail.event.startTime, detail.event.endTime, detail.event.eventId);
          setConflicts(result);
          if (!result.crmVerified || result.busy.length) return;
        } else if ((!conflicts.crmVerified || conflicts.busy.length) && !confirmed) throw new Error('请确认参与者时间提示');
        await meetingApi.submit(detail.event.eventId, detail.event.version, confirmed);
      } else if (action === 'CANCELLED' && detail.owner && detail.event.status === 'PLANNED') {
        await meetingApi.cancel(detail.event.eventId, detail.event.version, reason.trim());
      } else await meetingApi.state(detail.event.eventId, detail.event.version, action as MeetingStatus, reason.trim() || undefined);
      onSaved();
    } catch (failure) { setError(getErrorMessage(failure, '操作失败，请刷新会议详情后重试')); }
    finally { setBusy(false); }
  };
  return <BaseDialog open title={`${actionNames[action]} · ${detail.event.title}`} panelClassName="meeting-dialog" onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>返回</Button><Button disabled={busy} onClick={() => void execute()}>{busy ? '处理中…' : `确认${actionNames[action]}`}</Button></>}><div className="space-y-4"><MeetingError message={error} /><p className="text-sm">{action === 'SUBMIT' ? '提交成功后才占用会议室、创建邀请；需要审批的预约仍须等待批准。' : '本次操作按当前会议版本执行，并保留实际出席与通知记录。'}</p>{requiresReason && <MeetingField label="原因"><Textarea aria-label="会议状态变更原因" value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} /></MeetingField>}<MeetingConflictNotice value={conflicts} confirmed={confirmed} onConfirm={setConfirmed} names={Object.fromEntries(detail.invitations.map((invitation) => [String(invitation.userId), invitation.userName]))} /></div></BaseDialog>;
}

function DeliveryHistory({ eventId, names }: { eventId: MeetingId; names: Record<string, string> }) {
  const loader = useCallback(() => meetingApi.delivery(eventId), [eventId]);
  const { data, loading, error, refresh } = useMeetingData(loader);
  return <section className="meeting-review"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">逐人真实投递结果</h3><Button variant="outline" disabled={loading} onClick={refresh}>刷新投递结果</Button></div><MeetingError message={error} />{loading ? <p role="status">正在读取消息记录…</p> : data?.length ? <div className="max-h-80 overflow-auto space-y-3">{data.map((delivery) => <article key={delivery.reminder.reminderId} className="rounded-md border p-3"><p className="text-sm font-medium">{noticeNames[delivery.reminder.eventKey.split(':')[2]] || '会议通知'} · {delivery.reminder.channelType === 'INTERNAL' ? '站内' : delivery.reminder.channelType === 'EMAIL' ? '邮件' : delivery.reminder.channelType} · 版本{delivery.reminder.scheduleVersion} · {deliveryStatus[delivery.reminder.status] || delivery.reminder.status}</p><p className="text-xs text-cf-subtle">计划触发：{delivery.reminder.dueTime}{delivery.reminder.sentFlag === 1 ? `；真实送达时间：${delivery.reminder.sendTime}` : '；尚未全部实际送达'}</p><ul className="mt-2 space-y-1">{delivery.recipients.map((recipient) => <li className="text-xs" key={`${recipient.userId}:${recipient.recordId || 'pending'}`}>{names[String(recipient.userId)] || `用户 #${recipient.userId}`}：{deliveryStatus[recipient.status] || recipient.status} · {recipient.reason}{recipient.acceptedTime ? ` · ${recipient.acceptedTime}` : ''}</li>)}</ul></article>)}</div> : !error && <p className="text-sm text-cf-subtle">暂无通知排程或投递记录。</p>}</section>;
}

export default function MeetingDetailDialog({ eventId, onClose, onChanged }: { eventId: MeetingId; onClose: () => void; onChanged: () => void }) {
  const { user, hasPermission } = useAuth();
  const loader = useCallback(() => meetingApi.detail(eventId), [eventId]);
  const { data, loading, error, refresh } = useMeetingData(loader);
  const [action, setAction] = useState<MeetingAction>(); const [edit, setEdit] = useState<MeetingEvent>(); const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState('');
  const event = data?.event;
  const names = Object.fromEntries((data?.invitations || []).map((invitation) => [String(invitation.userId), invitation.userName]));
  const editable = data?.owner && event?.status === 'PLANNED' && event.recurrenceRole !== 'SERIES' && new Date(event.startTime.replace(' ', 'T')) > new Date() && hasPermission('oa:meeting:edit-own');
  const canState = data && (data.owner && hasPermission('oa:meeting:edit-own') || data.manageable && hasPermission('oa:meeting:manage'));
  const ownInvitation = data?.invitations.find((invitation) => sameId(invitation.userId, user?.id) && invitation.deleted === 0);
  const changed = () => { setAction(undefined); setEdit(undefined); setActionError(''); refresh(); onChanged(); };
  const respond = async (acceptance: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE') => {
    if (!event || !ownInvitation) return; setBusy(true); setActionError('');
    try { await meetingApi.respond(event.eventId, ownInvitation.invitationVersion, acceptance); changed(); }
    catch (failure) { setActionError(getErrorMessage(failure, '邀请回应失败，请刷新后重试')); }
    finally { setBusy(false); }
  };
  const editSeries = async () => {
    if (!event) return; setBusy(true); setActionError('');
    try { setEdit((await meetingApi.detail(event.parentEventId ?? event.eventId)).event); }
    catch (failure) { setActionError(getErrorMessage(failure, '周期会议读取失败')); }
    finally { setBusy(false); }
  };
  if (edit) return <MeetingEditor initial={edit} names={names} onClose={() => setEdit(undefined)} onSaved={changed} />;
  if (action && data) return <MeetingActionDialog detail={data} action={action} onClose={() => setAction(undefined)} onSaved={changed} />;
  let joinUrl: string | undefined;
  try { const parsed = event?.joinUrl ? new URL(event.joinUrl) : null; if (parsed?.protocol === 'https:' && !parsed.username && !parsed.password) joinUrl = parsed.href; } catch { }
  const occurred = event && (['IN_PROGRESS', 'COMPLETED'].includes(event.status) || event.status === 'CANCELLED' && ['APPROVED', 'NOT_REQUIRED'].includes(event.approvalStatus));
  return <BaseDialog open title={event?.title || '会议详情'} width="extra-wide" panelClassName="meeting-dialog" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>关闭</Button><Button variant="outline" disabled={loading || busy} onClick={refresh}>刷新详情</Button>{editable && <Button disabled={busy} onClick={() => setEdit(event)}>编辑本次会议</Button>}</>}>
    <div className="space-y-5"><MeetingError message={error || actionError} />{loading ? <p role="status">正在核实会议访问权限并读取详情…</p> : data && event && <>
      <div className="flex flex-wrap gap-2"><span className="meeting-chip">{meetingStatus[event.status]}</span><span className="meeting-chip">{approvalStatus[event.approvalStatus] || event.approvalStatus}</span>{event.recurrenceRole === 'INSTANCE' && <span className="meeting-chip">周期中的独立实例</span>}</div>
      <dl className="meeting-fields"><div><dt className="text-xs text-cf-subtle">北京时间</dt><dd>{event.startTime} — {event.endTime}</dd></div><div><dt className="text-xs text-cf-subtle">预计人数</dt><dd>{event.expectedAttendees}人</dd></div><div><dt className="text-xs text-cf-subtle">审批</dt><dd>{event.instanceId ? `流程已登记：${event.instanceId}` : event.approvalStatus === 'PENDING' ? '审批正在建立，尚未获得批准' : approvalStatus[event.approvalStatus]}</dd></div>{event.originalStartTime && <div><dt className="text-xs text-cf-subtle">原定发生时间</dt><dd>{event.originalStartTime}</dd></div>}</dl>
      {event.description && <p className="whitespace-pre-wrap text-sm">{event.description}</p>}{joinUrl && <a className="inline-flex min-h-11 items-center underline" href={joinUrl} target="_blank" rel="noopener noreferrer">打开线上会议{event.meetingPlatform ? `（${event.meetingPlatform}）` : ''}</a>}
      <div className="flex flex-wrap gap-2">{data.owner && event.approvalStatus === 'DRAFT' && hasPermission('oa:meeting:book') && <Button disabled={busy} onClick={() => setAction('SUBMIT')}>提交草稿</Button>}{canState && event.status === 'PLANNED' && ['NOT_REQUIRED', 'APPROVED'].includes(event.approvalStatus) && <Button disabled={busy || new Date(event.startTime.replace(' ', 'T')) > new Date() || new Date(event.endTime.replace(' ', 'T')) <= new Date()} onClick={() => setAction('IN_PROGRESS')}>开始会议（预约时段内）</Button>}{canState && event.status === 'IN_PROGRESS' && <Button disabled={busy} onClick={() => setAction('COMPLETED')}>结束会议</Button>}{event.status === 'PLANNED' && (data.owner && hasPermission('oa:meeting:cancel-own') || data.manageable && hasPermission('oa:meeting:manage')) && <Button variant="outline" disabled={busy} onClick={() => setAction('CANCELLED')}>取消本次会议</Button>}{data.manageable && event.status === 'IN_PROGRESS' && hasPermission('oa:meeting:manage') && <Button variant="outline" disabled={busy} onClick={() => setAction('CANCELLED')}>取消已开始会议</Button>}{canState && event.status === 'PLANNED' && event.approvalStatus !== 'DRAFT' && <Button variant="outline" disabled={busy} onClick={() => setAction('NOT_HELD')}>登记未举行</Button>}{data.owner && (event.parentEventId || event.recurrenceRole === 'SERIES') && hasPermission('oa:meeting:series') && <Button variant="outline" disabled={busy} onClick={() => void editSeries()}>预览并修改整个系列</Button>}</div>
      <section className="meeting-review"><h3 className="font-medium">邀请回应与实际出席</h3><p className="text-xs text-cf-subtle">接受邀请不会自动签到；改期后请按最新邀请重新回应。</p>{ownInvitation && event.status === 'PLANNED' && event.approvalStatus !== 'DRAFT' && hasPermission('oa:meeting:respond') && <div className="flex flex-wrap gap-2">{(['ACCEPTED', 'DECLINED', 'TENTATIVE'] as const).map((value) => <Button key={value} variant={ownInvitation.acceptanceStatus === value ? 'secondary' : 'outline'} disabled={busy} onClick={() => void respond(value)}>{acceptanceStatus[value]}</Button>)}</div>}<div className="max-h-72 overflow-auto"><table className="unity-data-table w-full"><thead><tr><th>参与者</th><th>邀请回应</th><th>回应时间</th><th>实际出席 / 签到时间</th></tr></thead><tbody>{data.invitations.map((invitation) => <tr key={invitation.id}><td>{invitation.userName}</td><td>{invitation.deleted === 1 ? '已移出名单' : acceptanceStatus[invitation.acceptanceStatus]}</td><td>{invitation.responseTime || '尚未回应'}</td><td>{({ ATTEND: '已出席', ABSENT: '缺席', LATE: '迟到', LEAVE: '请假', NOT_CHECKED: '未签到' } as Record<string, string>)[invitation.attendStatus] || invitation.attendStatus}{invitation.checkInTime ? ` · ${invitation.checkInTime}` : ''}</td></tr>)}</tbody></table></div></section>
      {data.minutesId && hasPermission('oa:meeting:list') ? <Link className="inline-flex min-h-11 items-center underline" to={`/office/meeting-minutes?minutesId=${data.minutesId}`}>打开关联纪要与签到</Link> : occurred && hasPermission('oa:meeting:edit') && <Link className="inline-flex min-h-11 items-center underline" to={`/office/meeting-minutes?eventId=${event.eventId}`}>为本次实际会议创建纪要</Link>}
      <Button variant="outline" onClick={() => setDeliveryOpen((value) => !value)}>{deliveryOpen ? '收起投递记录' : '查看逐人通知与未发送原因'}</Button>{deliveryOpen && <DeliveryHistory eventId={event.eventId} names={names} />}
    </>}</div>
  </BaseDialog>;
}
