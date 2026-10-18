import React, { useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Textarea, UserSelector } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { crmOperations, type ActivityDetail, type ActivityParticipant, type CrmActivity } from '@/services/api/crm/operations';
import { BusinessPicker } from './BusinessPicker';
import { acceptanceStatuses, activityStatuses, dateInput, datePayload, Field, Flag, OpsSelect, Section, useAccess, useMutation } from './OperationsKit';

export const activityTypes = { MEETING: '会议', CALL: '通话', TASK: '任务' };
export const businessTypes = { NONE: '独立活动', CUSTOMER: '客户', LEAD: '线索', OPPORTUNITY: '商机', TICKET: '工单', QUOTE: '报价', CONTRACT: '合同' };
export function newActivity(customerId?: number, start?: string, end?: string): ActivityDetail {
  const begin = start || datePayload(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  return { activity: { activityType: 'MEETING', subject: '', status: 'PLANNED', priority: 'MEDIUM', startTime: begin, endTime: end || datePayload(new Date(new Date(begin.replace(' ', 'T')).getTime() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)), bizType: customerId ? 'CUSTOMER' : 'NONE', bizId: customerId, customerId }, participants: [], reminders: [{ channelType: 'INTERNAL', remindMinutesBefore: 15 }] };
}

export function newNextActivity(source: CrmActivity): ActivityDetail {
  const detail = newActivity(source.customerId);
  const action = source.nextAction || '';
  return { ...detail, activity: { ...detail.activity,
    subject: action.trim() && action.length <= 200 ? action : source.subject,
    description: action, bizType: source.bizType, bizId: source.bizId,
    customerId: source.customerId, customerName: source.customerName,
    ownerId: source.ownerId, ownerName: source.ownerName,
  } };
}

export function ActivityEditor({ initial, onClose, onSaved, nextOf, businessLabel }: { initial: ActivityDetail; onClose: () => void; onSaved: (detail: ActivityDetail) => void; nextOf?: number; businessLabel?: string }) {
  const { user } = useAuth();
  const can = useAccess();
  const mutation = useMutation();
  const [form, setForm] = useState<ActivityDetail>(initial);
  const [participantType, setParticipantType] = useState('CONTACT');
  const activity = form.activity;
  const existing = Boolean(activity.activityId);
  const writable = can(existing ? 'crm:activity:edit' : 'crm:activity:add') && (!existing || activity.ownerId === Number(user?.id) || can('crm:activity:assign'));
  const terminal = ['COMPLETED', 'CANCELLED', 'NOT_HELD'].includes(activity.status);
  const patchActivity = (fields: Partial<CrmActivity>) => setForm(previous => ({ ...previous, activity: { ...previous.activity, ...fields } }));
  const patchParticipant = (index: number, fields: Partial<ActivityParticipant>) => setForm(previous => ({ ...previous, participants: previous.participants.map((member, position) => position === index ? { ...member, ...fields } : member) }));
  const addParticipant = (member: ActivityParticipant) => setForm(previous => previous.participants.some(item => item.participantType === member.participantType && item.participantRefId === member.participantRefId) ? previous : { ...previous, participants: [...previous.participants, member] });
  const saved = (detail: ActivityDetail) => { setForm(detail); onSaved(detail); };
  const persist = () => {
    if (!activity.subject.trim() || !activity.startTime || !activity.endTime) { toast.error('请填写主题和起止时间'); return; }
    if (activity.endTime < activity.startTime) { toast.error('结束时间不能早于开始时间'); return; }
    void mutation.run(() => nextOf ? crmOperations.nextActivity(nextOf, form) : crmOperations.saveActivity(form), saved);
  };
  return <BaseDialog open title={nextOf ? '安排后续活动' : existing ? activity.subject : '创建活动'} description="会议、通话和任务统一安排；时间变更会重新安排提醒。" onClose={onClose} width="wide" footer={<div className="crm-ops-actions justify-end"><Button variant="outline" onClick={onClose}>关闭</Button>{writable && <Button disabled={mutation.busy} onClick={persist}>保存活动</Button>}</div>}>
    <div className="space-y-5">
      {!!form.conflicts?.length && <div role="alert" className="crm-ops-warning">已保存；以下活动时间冲突，请调整安排：{form.conflicts.map(item => `${item.subject}（${item.startTime}）`).join('、')}</div>}
      <fieldset disabled={!writable || mutation.busy} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="主题" wide><Input maxLength={200} value={activity.subject} onChange={event => patchActivity({ subject: event.target.value })} /></Field>
          <Field label="活动类型"><OpsSelect label="活动类型" value={activity.activityType} options={activityTypes} onChange={activityType => patchActivity({ activityType })} /></Field>
          <Field label="状态"><OpsSelect label="活动状态" value={activity.status} options={activityStatuses} onChange={status => patchActivity({ status })} /></Field>
          <Field label="开始时间"><Input type="datetime-local" value={dateInput(activity.startTime)} onChange={event => patchActivity({ startTime: datePayload(event.target.value) })} /></Field>
          <Field label="结束时间"><Input type="datetime-local" value={dateInput(activity.endTime)} onChange={event => patchActivity({ endTime: datePayload(event.target.value) })} /></Field>
          <Field label="优先级"><OpsSelect label="活动优先级" value={activity.priority} options={{ HIGH: '高', MEDIUM: '中', LOW: '低' }} onChange={priority => patchActivity({ priority })} /></Field>
          <Field label="负责人"><UserSelector single value={activity.ownerId ? String(activity.ownerId) : user?.id} disabled={!can('crm:activity:assign')} onChange={(id, picked) => patchActivity({ ownerId: id ? Number(id) : undefined, ownerName: picked?.name })} /></Field>
          <Flag label="全天活动" value={activity.allDayFlag} onChange={checked => patchActivity({ allDayFlag: checked ? 1 : 0 })} />
          {activity.activityType === 'CALL' && <Field label="通话方向"><OpsSelect label="通话方向" value={activity.direction || 'OUTBOUND'} options={{ INBOUND: '呼入', OUTBOUND: '呼出' }} onChange={direction => patchActivity({ direction })} /></Field>}
          <Field label="关联类型"><OpsSelect label="关联类型" value={activity.bizType} options={businessTypes} onChange={bizType => patchActivity({ bizType, bizId: undefined, customerId: undefined, customerName: undefined })} /></Field>
          {activity.bizType === 'CONTRACT' && <Field label="所属客户"><BusinessPicker type="CUSTOMER" label="所属客户" value={activity.customerId} selectedLabel={activity.customerName} onChange={(customerId, option) => patchActivity({ customerId, customerName: option?.name, bizId: undefined })} /></Field>}
          {activity.bizType !== 'NONE' && <Field label="关联对象"><BusinessPicker type={activity.bizType} value={activity.bizId} selectedLabel={activity.bizType === initial.activity.bizType && activity.bizId === initial.activity.bizId ? businessLabel : undefined} customerId={activity.bizType === 'CONTRACT' ? activity.customerId : undefined} onChange={(bizId, option) => patchActivity({ bizId, customerId: option?.customerId ?? (activity.bizType === 'CONTRACT' ? activity.customerId : undefined) })} /></Field>}
          {['NONE', 'LEAD'].includes(activity.bizType) && <Field label="所属客户（可选）"><BusinessPicker type="CUSTOMER" value={activity.customerId} selectedLabel={activity.customerName} onChange={(customerId, option) => patchActivity({ customerId, customerName: option?.name })} /></Field>}
          {activity.activityType === 'MEETING' && <><Field label="地点"><Input maxLength={200} value={activity.location || ''} onChange={event => patchActivity({ location: event.target.value })} /></Field><Field label="会议平台"><Input maxLength={50} value={activity.meetingPlatform || ''} onChange={event => patchActivity({ meetingPlatform: event.target.value })} /></Field><Field label="入会链接" wide><Input type="url" maxLength={500} value={activity.joinUrl || ''} onChange={event => patchActivity({ joinUrl: event.target.value })} /></Field></>}
          <Field label="活动说明" wide><Textarea value={activity.description || ''} onChange={event => patchActivity({ description: event.target.value })} /></Field>
          <Field label="纪要 / 结果" wide><Textarea value={activity.resultSummary || ''} onChange={event => patchActivity({ resultSummary: event.target.value })} /></Field>
          <Field label="下一步行动" wide><Textarea value={activity.nextAction || ''} onChange={event => patchActivity({ nextAction: event.target.value })} /></Field>
          <Flag label="完成时生成跟进记录" value={form.generateFollowUp} onChange={generateFollowUp => setForm(previous => ({ ...previous, generateFollowUp }))} />
        </div>
        <Section title={`参与人（${form.participants.length}/100）`}>
          <div className="space-y-3">{form.participants.map((member, index) => <div key={`${member.participantType}:${member.participantRefId}`} className="grid items-center gap-3 md:grid-cols-[1fr_120px_auto_auto_auto]"><span className="text-sm">{member.participantName || `参与人 #${member.participantRefId}`}</span><OpsSelect label={`${member.participantName}接受状态`} value={member.acceptanceStatus} options={acceptanceStatuses} disabled={member.participantType === 'USER' && member.participantRefId !== Number(user?.id)} onChange={acceptanceStatus => patchParticipant(index, { acceptanceStatus })} /><Flag label="组织者" value={member.isOrganizerFlag} onChange={checked => patchParticipant(index, { isOrganizerFlag: checked ? 1 : 0 })} /><Flag label="已签到" value={member.attendFlag} onChange={checked => patchParticipant(index, { attendFlag: checked ? 1 : 0 })} /><Button variant="ghost" onClick={() => setForm(previous => ({ ...previous, participants: previous.participants.filter((_, position) => position !== index) }))}>移除</Button></div>)}</div>
          {form.participants.length < 100 && <div className="mt-4 grid gap-3 md:grid-cols-2"><OpsSelect label="参与人类型" value={participantType} options={{ USER: '内部同事', CONTACT: '客户联系人', LEAD: '线索联系人' }} onChange={setParticipantType} />{participantType === 'USER' ? <UserSelector single value={null} onChange={(id, picked) => { if (id) addParticipant({ participantType: 'USER', participantRefId: Number(id), participantName: picked?.name, acceptanceStatus: 'NONE' }); }} /> : <BusinessPicker type={participantType} customerId={participantType === 'CONTACT' ? activity.customerId : undefined} label="参与人" onChange={(id, option) => { if (id) addParticipant({ participantType, participantRefId: id, participantName: option?.name, acceptanceStatus: 'NONE' }); }} />}</div>}
        </Section>
        <Section title="提醒设置">
          <div className="space-y-3">{form.reminders.map((reminder, index) => <div key={index} className="grid items-center gap-3 md:grid-cols-[1fr_1fr_auto]"><Field label="提前分钟"><Input type="number" min={0} step={1} value={reminder.remindMinutesBefore} onChange={event => setForm(previous => ({ ...previous, reminders: previous.reminders.map((item, position) => position === index ? { ...item, remindMinutesBefore: Number(event.target.value) } : item) }))} /></Field><Field label="渠道"><OpsSelect label="提醒渠道" value={reminder.channelType} options={{ INTERNAL: '站内消息', EMAIL: '邮件' }} onChange={channelType => setForm(previous => ({ ...previous, reminders: previous.reminders.map((item, position) => position === index ? { ...item, channelType } : item) }))} /></Field><Button variant="ghost" onClick={() => setForm(previous => ({ ...previous, reminders: previous.reminders.filter((_, position) => position !== index) }))}>移除</Button></div>)}</div>
          <Button className="mt-3" variant="outline" disabled={form.reminders.length >= 10} onClick={() => setForm(previous => ({ ...previous, reminders: [...previous.reminders, { channelType: 'INTERNAL', remindMinutesBefore: 30 }] }))}>添加提醒</Button>
        </Section>
      </fieldset>
      {existing && <div className="crm-ops-actions">
        {form.participants.some(member => member.participantType === 'USER' && member.participantRefId === Number(user?.id)) && <><span className="text-sm">我的回复</span>{Object.entries(acceptanceStatuses).filter(([value]) => value !== 'NONE').map(([value, label]) => <Button key={value} variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(async () => { await crmOperations.respondActivity(activity.activityId!, value); return crmOperations.activity(activity.activityId!); }, saved)}>{label}</Button>)}</>}
        {writable && !terminal && <><Button disabled={mutation.busy} onClick={() => void mutation.run(() => crmOperations.finishActivity(activity.activityId!, { version: activity.version, resultSummary: activity.resultSummary, nextAction: activity.nextAction, generateFollowUp: Boolean(form.generateFollowUp) }), saved)}>完成活动</Button><Button variant="outline" disabled={mutation.busy} onClick={() => { if (window.confirm('确认取消该活动并撤销未发送提醒？')) void mutation.run(async () => { await crmOperations.cancelActivity(activity.activityId!, activity.version); return crmOperations.activity(activity.activityId!); }, saved); }}>取消活动</Button></>}
      </div>}
    </div>
  </BaseDialog>;
}
