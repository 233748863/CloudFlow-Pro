import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Input } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { meetingApi, type MeetingId } from '@/services/api/meeting';
import MeetingDetailDialog from './meeting/MeetingDetailDialog';
import MeetingEditor from './meeting/MeetingEditor';
import { approvalStatus, dayString, MeetingError, MeetingField, MeetingPagination, meetingRows, meetingStatus, nextDay, sameId, useMeetingData } from './meeting/meetingUi';
import './meeting/meeting.css';

export default function MeetingMinePage() {
  const { user, hasPermission } = useAuth(); const [search] = useSearchParams(); const today = dayString(new Date());
  const [from, setFrom] = useState(today); const [to, setTo] = useState(nextDay(today, 6));
  const [range, setRange] = useState({ from, to }); const [page, setPage] = useState(1); const [filterError, setFilterError] = useState('');
  const [detail, setDetail] = useState<MeetingId>(); const [creating, setCreating] = useState(false);
  const loader = useCallback(() => meetingApi.mine({ start: `${range.from} 00:00:00`, end: `${nextDay(range.to)} 00:00:00`, pageNum: page, pageSize: 20 }), [range, page]);
  const { data, loading, error, refresh } = useMeetingData(loader);
  useEffect(() => { const id = search.get('eventId'); if (id && /^[1-9]\d{0,18}$/.test(id)) setDetail(id); }, [search]);
  return <section className="meeting-page admin-source-page"><header className="admin-source-header"><div><h2>本人会议与邀请</h2><p className="text-sm text-cf-subtle">仅显示本人发起或受邀的实际会议，周期主记录不重复占位。</p></div><div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={refresh}>刷新</Button>{hasPermission('oa:meeting:book') && <Button onClick={() => setCreating(true)}>新建预约</Button>}</div></header>{hasPermission('oa:meeting:board') && <Link className="inline-flex min-h-11 items-center underline" to="/admin/meeting-board">查看会议室资源看板</Link>}
    <section className="card p-4 space-y-3"><div className="meeting-fields"><MeetingField label="开始日期"><Input aria-label="本人会议开始日期" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></MeetingField><MeetingField label="结束日期（含当日）"><Input aria-label="本人会议结束日期" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></MeetingField><div className="flex items-end"><Button onClick={() => { if (!from || !to || to < from || new Date(`${nextDay(to)}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime() > 31 * 86400000) { setFilterError('请选择不超过31天的有效日期范围'); return; } setFilterError(''); setRange({ from, to }); setPage(1); }}>查询</Button></div></div><MeetingError message={filterError || error} /></section>
    {loading ? <p role="status" className="p-6">正在读取本人会议…</p> : !error && <><div className="grid gap-3 lg:grid-cols-2">{meetingRows(data).map((meeting) => <article key={meeting.eventId} className="meeting-room-card"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-medium">{meeting.title}</h3><span className="meeting-chip">{sameId(meeting.creatorId, user?.id) ? '本人发起' : '受邀参加'}</span></div><p className="text-sm">{meeting.startTime} — {meeting.endTime}</p><div className="flex flex-wrap gap-2"><span className="meeting-chip">{meetingStatus[meeting.status]}</span><span className="meeting-chip">{approvalStatus[meeting.approvalStatus] || meeting.approvalStatus}</span>{meeting.recurrenceRole === 'INSTANCE' && <span className="meeting-chip">周期实例</span>}</div><Button variant="outline" onClick={() => setDetail(meeting.eventId)}>详情 / 回应邀请</Button></article>)}</div>{!data?.total && <p className="card p-8 text-center text-cf-subtle">此日期范围没有本人会议或邀请。</p>}<MeetingPagination total={data?.total ?? 0} page={page} pageSize={20} onChange={setPage} /></>}
    {creating && <MeetingEditor onClose={() => setCreating(false)} onSaved={(saved) => { setCreating(false); setDetail(saved.eventId); refresh(); }} />}{detail != null && <MeetingDetailDialog eventId={detail} onClose={() => setDetail(undefined)} onChanged={refresh} />}
  </section>;
}
