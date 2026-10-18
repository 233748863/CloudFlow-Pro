import { useEffect, useRef, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { meetingApi, type MeetingConflicts, type MeetingId } from '@/services/api/meeting';
import { normalizeScheduleTime } from '@/services/api/schedule';
import type { SysScheduleEvent } from '@/types';
import { MeetingConflictNotice, readArray } from './meetingUi';
import './meeting.css';

export function useMeetingConflictConsent() {
  const { user } = useAuth();
  const [request, setRequest] = useState<{ title: string; conflicts: MeetingConflicts }>(); const [confirmed, setConfirmed] = useState(false);
  const resolver = useRef<((value: boolean | undefined) => void) | null>(null);
  const generation = useRef(0);
  const checking = useRef(false);
  useEffect(() => {
    generation.current++; checking.current = false; setRequest(undefined); setConfirmed(false);
    return () => { generation.current++; checking.current = false; resolver.current?.(undefined); resolver.current = null; };
  }, [user?.id, user?.tenantId]);
  const finish = (value?: boolean) => { resolver.current?.(value); resolver.current = null; setRequest(undefined); setConfirmed(false); };
  const confirmSchedule = async (event: Partial<SysScheduleEvent>): Promise<boolean | undefined> => {
    if (!event.startTime || !event.endTime || !user?.id) throw new Error('缺少会议时间或当前用户身份');
    if (resolver.current || checking.current) return undefined;
    const sequence = generation.current;
    const session = getAuthSessionVersion();
    const isCurrent = () => sequence === generation.current && session === getAuthSessionVersion();
    const people = [...new Set([String(user.id), ...readArray<MeetingId>(event.attendees).map(String)])];
    checking.current = true;
    let conflicts: MeetingConflicts;
    try {
      conflicts = await meetingApi.participantBusy(people, normalizeScheduleTime(event.startTime)!, normalizeScheduleTime(event.endTime)!, event.eventId);
      if (!isCurrent()) return undefined;
    } finally { if (isCurrent()) checking.current = false; }
    if (conflicts.crmVerified && !conflicts.busy.length) return false;
    return new Promise((resolve) => { resolver.current = resolve; setConfirmed(false); setRequest({ title: event.title || '日程', conflicts }); });
  };
  const dialog = request && <BaseDialog open title={`参与者时间提示 · ${request.title}`} panelClassName="meeting-dialog" onClose={() => finish()} footer={<><Button variant="outline" onClick={() => finish()}>返回调整</Button><Button disabled={!confirmed} onClick={() => finish(true)}>确认仍继续预约</Button></>}><MeetingConflictNotice value={request.conflicts} confirmed={confirmed} onConfirm={setConfirmed} names={{ [String(user?.id)]: '本人' }} /></BaseDialog>;
  return { confirmSchedule, conflictDialog: dialog };
}
