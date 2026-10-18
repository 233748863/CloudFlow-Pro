import { useEffect, useState } from 'react';
import { Input } from '@/components/common';
import { meetingApi, type MeetingCalendar, type MeetingRule } from '@/services/api/meeting';
import { getErrorMessage } from '@/utils/errorMessage';
import { MeetingError, MeetingField, MeetingPeoplePicker, meetingRows, sameId } from './meetingUi';
import './meeting.css';

export const initialMeetingRule = (): MeetingRule => ({ version: 0, equipmentTags: [], bookableWeekdays: [], openTime: null, closeTime: null,
  holidayCalendarId: null, holidayBookableFlag: 1, minBookingMinutes: 1, maxBookingMinutes: null, advanceBookingDays: null,
  needApprovalFlag: 0, approverId: null, bufferMinutes: 0, photoFileId: null, confirmExistingConflicts: false });

export default function MeetingRuleFields({ rule, busy, onChange }: { rule: MeetingRule; busy: boolean; onChange: (values: Partial<MeetingRule>) => void }) {
  const [equipment, setEquipment] = useState(rule.equipmentTags.join('，'));
  const [calendarError, setCalendarError] = useState(''); const [calendars, setCalendars] = useState<MeetingCalendar[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    const load = async () => {
      const first = await meetingApi.calendars(1); const rows = [...meetingRows(first)];
      for (let page = 2; page <= Math.ceil(first.total / 50); page++) rows.push(...meetingRows(await meetingApi.calendars(page)));
      if (current) setCalendars(rows);
    };
    load().catch((failure) => { if (current) setCalendarError(getErrorMessage(failure, '日历选项加载失败，当前绑定会保留')); });
    return () => { current = false; };
  }, []);
  return <div className="space-y-5">
    <p className="text-sm text-cf-subtle">清空开放时段表示全天开放，未选星期表示一周七天均可预约；最长时长为空时仍受系统预约时长上限约束。</p>
    <div className="meeting-fields"><MeetingField label="设备标签"><Input aria-label="会议室设备标签" value={equipment} disabled={busy} onChange={(event) => { setEquipment(event.target.value); onChange({ equipmentTags: [...new Set(event.target.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))] }); }} placeholder="如：投影仪，视频会议，白板" /></MeetingField>
      <MeetingField label="开放时间"><Input aria-label="会议室开放时间" type="time" value={rule.openTime?.slice(0, 5) ?? ''} disabled={busy} onChange={(event) => onChange({ openTime: event.target.value ? `${event.target.value}:00` : null })} /></MeetingField>
      <MeetingField label="关闭时间"><Input aria-label="会议室关闭时间" type="time" value={rule.closeTime?.slice(0, 5) ?? ''} disabled={busy} onChange={(event) => onChange({ closeTime: event.target.value ? `${event.target.value}:00` : null })} /></MeetingField>
      <MeetingField label="最短预约分钟"><Input aria-label="最短预约分钟" type="number" min={1} step={1} value={rule.minBookingMinutes} disabled={busy} onChange={(event) => onChange({ minBookingMinutes: Number(event.target.value) })} /></MeetingField>
      <MeetingField label="最长预约分钟（可空）"><Input aria-label="最长预约分钟" type="number" min={1} step={1} value={rule.maxBookingMinutes ?? ''} disabled={busy} onChange={(event) => onChange({ maxBookingMinutes: event.target.value === '' ? null : Number(event.target.value) })} /></MeetingField>
      <MeetingField label="最多提前天数（可空）"><Input aria-label="最多提前天数" type="number" min={0} step={1} value={rule.advanceBookingDays ?? ''} disabled={busy} onChange={(event) => onChange({ advanceBookingDays: event.target.value === '' ? null : Number(event.target.value) })} /></MeetingField>
      <MeetingField label="会后间隔分钟" hint="10分钟表示下一场最早在会议结束10分钟后开始。"><Input aria-label="会后间隔分钟" type="number" min={0} step={1} value={rule.bufferMinutes} disabled={busy} onChange={(event) => onChange({ bufferMinutes: Number(event.target.value) })} /></MeetingField>
      <MeetingField label="节假日日历"><select className="meeting-select" aria-label="会议室节假日日历" value={String(rule.holidayCalendarId ?? '')} disabled={busy || Boolean(calendarError)} onChange={(event) => onChange({ holidayCalendarId: event.target.value || null })}><option value="">不绑定日历</option>{rule.holidayCalendarId && !calendars.some((calendar) => sameId(calendar.calendarId, rule.holidayCalendarId)) && <option value={String(rule.holidayCalendarId)}>当前绑定日历 #{rule.holidayCalendarId}</option>}{calendars.map((calendar) => <option key={calendar.calendarId} value={String(calendar.calendarId)}>{calendar.calendarName}</option>)}</select><MeetingError message={calendarError} /></MeetingField>
    </div>
    <MeetingField label="可预约星期"><div className="flex flex-wrap gap-4">{['一', '二', '三', '四', '五', '六', '日'].map((day, index) => <label key={day} className="meeting-checkbox"><input type="checkbox" checked={rule.bookableWeekdays.includes(index + 1)} disabled={busy} onChange={(event) => onChange({ bookableWeekdays: event.target.checked ? [...rule.bookableWeekdays, index + 1].sort() : rule.bookableWeekdays.filter((value) => value !== index + 1) })} />周{day}</label>)}</div></MeetingField>
    <div className="flex flex-wrap gap-6"><label className="meeting-checkbox"><input type="checkbox" checked={rule.holidayBookableFlag === 1} disabled={busy} onChange={(event) => onChange({ holidayBookableFlag: event.target.checked ? 1 : 0 })} />允许法定节假日预约</label><label className="meeting-checkbox"><input type="checkbox" checked={rule.needApprovalFlag === 1} disabled={busy} onChange={(event) => onChange({ needApprovalFlag: event.target.checked ? 1 : 0, approverId: event.target.checked ? rule.approverId : null })} />预约需要审批</label></div>
    {rule.needApprovalFlag === 1 && <MeetingField label="指定审批人" hint="审批人必须已启用并具备流程办理权限；发起人不能审批自己的预约。"><fieldset disabled={busy}><MeetingPeoplePicker single value={rule.approverId ? [rule.approverId] : []} names={names} onNamesChange={setNames} onChange={(people) => onChange({ approverId: people[0] ?? null })} /></fieldset></MeetingField>}
  </div>;
}
