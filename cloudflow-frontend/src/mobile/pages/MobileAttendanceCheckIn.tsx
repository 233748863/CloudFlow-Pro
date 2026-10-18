import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, MapPin, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import {
  attendanceLocationMessage, downloadAttendancePhoto, getTodayAttendance, locateForAttendance, submitAttendanceCheckin,
  uploadAttendancePhoto, validateAttendancePhoto, type AttendanceShift, type TodayAttendance,
} from '@/services/api/hr/essAttendance';
import { getErrorMessage } from '@/utils/errorMessage';

const displayTime = (value: string) => value.replace('T', ' ').slice(0, 19);
const shiftText = (shift: AttendanceShift | null | undefined) => shift
  ? `${shift.shiftName} · ${displayTime(shift.startTime)} 至 ${displayTime(shift.endTime)}` : '当前没有有效排班';

export default function MobileAttendanceCheckIn({ onShowHistory }: { onShowHistory: () => void }) {
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState('');
  const uploaded = useRef<{ file: File; fileId: number } | null>(null);
  const submitting = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const value = await getTodayAttendance(); setToday(value); setError(''); return value; }
    catch (failure) { const message = getErrorMessage(failure, '今日考勤加载失败'); setError(message); throw failure; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const punch = async (logType: 'IN' | 'OUT') => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setResult('');
    let submitted = false;
    try {
      const position = await locateForAttendance();
      let photoFileId: number | undefined;
      if (photo) {
        if (uploaded.current?.file !== photo) {
          const attachment = await uploadAttendancePhoto(photo);
          uploaded.current = { file: photo, fileId: attachment.fileId };
        }
        photoFileId = uploaded.current?.fileId;
      }
      const id = await submitAttendanceCheckin({ logType, latitude: position.coords.latitude,
        longitude: position.coords.longitude, ...(photoFileId ? { photoFileId } : {}) });
      submitted = true; setPhoto(null); uploaded.current = null;
      setResult('打卡已提交，正在读取服务器核验结果');
      const updated = await load();
      const record = updated.checkins.find(row => String(row.checkinId) === String(id));
      const message = `打卡已提交：${attendanceLocationMessage(record?.locationValidFlag)}`;
      setResult(message); toast.success('打卡已提交');
    } catch (failure) {
      const message = submitted ? '打卡已经提交，结果刷新失败，请点击刷新查看记录，无需重复打卡'
        : getErrorMessage(failure, '打卡失败，请重试');
      setError(message); if (submitted) setResult('打卡已提交'); toast.error(message);
    } finally { submitting.current = false; setBusy(false); }
  };

  return <section className="space-y-4 px-4 pb-36 pt-4 text-cf-text">
    <header className="flex items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">考勤打卡</h1><p className="text-sm text-cf-muted">{today?.today || '今日'} · 以服务器时间为准</p></div>
      <Button variant="outline" className="min-h-11 min-w-11" disabled={loading || busy} aria-label="刷新今日考勤"
        onClick={() => void load().catch(() => undefined)}><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></Button>
    </header>
    <div className="space-y-3 rounded-xl border border-cf-border bg-cf-surface p-4">
      <h2 className="font-medium">本人班次</h2>
      <p className="text-sm">{shiftText(today?.shift)}</p>
      {today?.inShift && today.inShift.attendanceDate !== today.today && <p className="text-sm text-cf-muted">上班卡匹配：{shiftText(today.inShift)}</p>}
      {today?.outShift && today.outShift.attendanceDate !== today.today && <p className="text-sm text-cf-muted">下班卡匹配：{shiftText(today.outShift)}</p>}
      <p className="flex items-start gap-2 text-sm text-cf-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />点击打卡时才获取一次位置，提交后显示服务器核验结果。</p>
    </div>
    <div className="space-y-3 rounded-xl border border-cf-border bg-cf-surface p-4">
      <label htmlFor="attendance-photo" className="flex min-h-11 items-center gap-2 font-medium"><Camera className="h-5 w-5" />打卡照片（选填）</label>
      <input id="attendance-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="user" disabled={busy}
        className="block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:px-4"
        onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          const invalid = validateAttendancePhoto(file);
          if (invalid) { setError(invalid); return; }
          setPhoto(file); uploaded.current = null; setError('');
        }} />
      <p className="text-xs text-cf-muted">JPG、PNG或WebP，最大5MiB；照片通过考勤专用接口存储并校验本人权限。</p>
      {photo && <div className="space-y-2">{preview && <img src={preview} alt="待提交的打卡照片" className="max-h-48 rounded-lg object-contain" />}
        <p className="break-all text-sm">{photo.name}</p><Button variant="outline" className="min-h-11" disabled={busy}
          onClick={() => { setPhoto(null); uploaded.current = null; }}>移除照片</Button></div>}
    </div>
    {error && <p role="alert" className="rounded-lg border border-cf-border bg-cf-surface p-3 text-sm text-cf-text">{error}</p>}
    {result && <p role="status" className="rounded-lg border border-cf-border bg-cf-surface p-3 text-sm">{result}</p>}
    <div className="space-y-3"><h2 className="font-medium">今日打卡记录</h2>
      {!loading && today && today.checkins.length === 0 && <p className="text-sm text-cf-muted">今日尚无打卡记录</p>}
      {today?.checkins.map(row => <article key={row.checkinId} className="space-y-2 rounded-xl border border-cf-border bg-cf-surface p-4">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{row.logType === 'IN' ? '上班' : '下班'}打卡</strong><time>{displayTime(row.checkTime)}</time></div>
        <p className="text-sm">{attendanceLocationMessage(row.locationValidFlag)}</p>
        <p className="text-xs text-cf-muted">归属考勤日：{row.attendanceDate}{row.offshiftFlag === 1 ? ' · 不在排班打卡窗口内' : ''}</p>
        {row.photoFileId && <Button variant="outline" className="min-h-11" onClick={() => void downloadAttendancePhoto(row.photoFileId!, row.checkinId)
          .catch(failure => toast.error(getErrorMessage(failure, '照片读取失败')))}>下载本人照片</Button>}
      </article>)}
    </div>
    <Button variant="outline" className="min-h-11 w-full" onClick={onShowHistory}>每日考勤与申诉</Button>
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-3 border-t border-cf-border bg-cf-surface px-4 py-3">
      <Button className="min-h-12" disabled={busy || loading || !today} onClick={() => void punch('IN')}>{busy ? '正在处理…' : '上班打卡'}</Button>
      <Button variant="outline" className="min-h-12" disabled={busy || loading || !today} onClick={() => void punch('OUT')}>下班打卡</Button>
    </div>
  </section>;
}
