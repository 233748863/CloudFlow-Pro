import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input } from '@/components/common';
import { meetingApi } from '@/services/api/meeting';
import { dayString, MeetingError, MeetingField, MeetingPagination, meetingRows, nextDay, useMeetingData } from '../meeting/meetingUi';
import '../meeting/meeting.css';

export default function MeetingUsagePage() {
  const today = dayString(new Date()); const [from, setFrom] = useState(nextDay(today, -6)); const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from, to }); const [page, setPage] = useState(1); const [filterError, setFilterError] = useState('');
  const loader = useCallback(() => meetingApi.usage({ start: `${range.from} 00:00:00`, end: `${nextDay(range.to)} 00:00:00`, pageNum: page, pageSize: 50 }), [range, page]);
  const { data, loading, error, refresh } = useMeetingData(loader);
  const number = (value?: number) => value == null ? '不适用' : Number(value).toFixed(2);
  return <section className="meeting-page admin-source-page"><header className="admin-source-header"><div><h2>会议室使用率</h2><p className="text-sm text-cf-subtle">实际使用与计划预订分开统计；取消、未举行和会后间隔不计入实际使用。</p></div><Button variant="outline" disabled={loading} onClick={refresh}>刷新</Button></header><Link className="inline-flex min-h-11 items-center underline" to="/admin/meeting-board">返回会议室看板</Link>
    <section className="card p-4 space-y-3"><div className="meeting-fields"><MeetingField label="报告开始日期"><Input aria-label="使用率开始日期" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></MeetingField><MeetingField label="报告结束日期（含当日）"><Input aria-label="使用率结束日期" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></MeetingField><div className="flex items-end"><Button onClick={() => { if (!from || !to || to < from || new Date(`${nextDay(to)}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime() > 31 * 86400000) { setFilterError('报告每次最多31天，请选择有效日期范围'); return; } setFilterError(''); setRange({ from, to }); setPage(1); }}>计算使用率</Button></div></div><MeetingError message={filterError || error} /></section>
    <p className="text-sm text-cf-subtle">使用率 = 实际使用与开放时间重叠的分钟数 ÷ 同期可预约分钟数；开放分钟为0或日历无法核实时显示“不适用”。</p>
    {loading ? <p role="status" className="p-6">正在核算真实会议记录与开放窗口…</p> : !error && <><div className="card overflow-x-auto"><table className="unity-data-table w-full min-w-[900px]"><thead><tr><th>会议室</th><th>实际使用分钟</th><th>计划预订分钟</th><th>可预约分钟</th><th>实际使用率</th><th>预订占用率</th><th>核算依据 / 提示</th></tr></thead><tbody>{meetingRows(data).map((usage) => <tr key={usage.room.roomId}><td>{usage.room.name}</td><td>{number(usage.usedMinutes)}</td><td>{number(usage.bookedMinutes)}</td><td>{number(usage.openMinutes)}</td><td>{usage.usagePercent == null ? '不适用' : `${number(usage.usagePercent)}%`}</td><td>{usage.bookingPercent == null ? '不适用' : `${number(usage.bookingPercent)}%`}</td><td className="max-w-80 whitespace-normal">{usage.unavailableReason || usage.basis}</td></tr>)}</tbody></table>{!data?.total && <p className="p-8 text-center text-cf-subtle">暂无可统计会议室。</p>}</div><MeetingPagination total={data?.total ?? 0} page={page} onChange={setPage} /></>}
  </section>;
}
