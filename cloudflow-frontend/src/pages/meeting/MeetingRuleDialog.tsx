import { useEffect, useState } from 'react';
import { BaseDialog, Button, Input } from '@/components/common';
import { meetingApi, type MeetingId, type MeetingRoomView, type MeetingRule, type MeetingRulePreview } from '@/services/api/meeting';
import { getErrorMessage } from '@/utils/errorMessage';
import { MeetingError, MeetingField, readArray, sameId } from './meetingUi';
import MeetingRuleFields from './MeetingRuleFields';
import { useAuth } from '@/context/AuthContext';
import './meeting.css';

export function MeetingPhoto({ roomId, fileId }: { roomId: MeetingId; fileId: MeetingId }) {
  const { user } = useAuth();
  const [url, setUrl] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let current = true; let created = ''; setError(''); setUrl('');
    const cancel = () => { current = false; controller.abort(); if (created) URL.revokeObjectURL(created); setUrl(''); };
    window.addEventListener('cloudflow:auth-expired', cancel);
    meetingApi.photo(roomId, fileId, controller.signal).then((blob) => { if (current) { created = URL.createObjectURL(blob); setUrl(created); } })
      .catch((failure) => { if (current) setError(getErrorMessage(failure, '照片暂不可读取')); });
    return () => { cancel(); window.removeEventListener('cloudflow:auth-expired', cancel); };
  }, [roomId, fileId, user?.id, user?.tenantId]);
  return error ? <MeetingError message={error} /> : url ? <img src={url} className="meeting-photo" alt="会议室实际照片" /> : <p role="status">正在读取私有照片…</p>;
}

export default function MeetingRuleDialog({ room, onClose, onSaved }: { room: MeetingRoomView; onClose: () => void; onSaved: () => void }) {
  const [rule, setRule] = useState<MeetingRule>(() => ({ version: room.version, equipmentTags: readArray(room.equipmentTags), bookableWeekdays: readArray(room.bookableWeekdays),
    openTime: room.openTime ?? null, closeTime: room.closeTime ?? null, holidayCalendarId: room.holidayCalendarId ?? null, holidayBookableFlag: room.holidayBookableFlag ?? 1,
    minBookingMinutes: room.minBookingMinutes ?? 1, maxBookingMinutes: room.maxBookingMinutes ?? null, advanceBookingDays: room.advanceBookingDays ?? null,
    needApprovalFlag: room.needApprovalFlag ?? 0, approverId: room.approverId ?? null, bufferMinutes: room.bufferMinutes ?? 0, photoFileId: room.photoFileId ?? null, confirmExistingConflicts: false }));
  const [preview, setPreview] = useState<MeetingRulePreview>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [uploadedName, setUploadedName] = useState('');
  const changed = (values: Partial<MeetingRule>) => { setRule((previous) => ({ ...previous, ...values, confirmExistingConflicts: false, impactDigest: undefined })); setPreview(undefined); setError(''); };
  const inspect = async () => {
    setBusy(true); setError(''); setPreview(undefined);
    try { setPreview(await meetingApi.previewRule(room.roomId, rule)); }
    catch (failure) { setError(getErrorMessage(failure, '规则预检失败')); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!preview) { setError('请先预览新规则对已有预约的影响'); return; }
    if (preview.affected.length && !rule.confirmExistingConflicts) { setError('请查看并确认已有预约影响清单'); return; }
    setBusy(true); setError('');
    try { await meetingApi.saveRule(room.roomId, { ...rule, impactDigest: preview.impactDigest }); onSaved(); }
    catch (failure) { setError(getErrorMessage(failure, '规则保存失败，请刷新后重新预览')); }
    finally { setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return; setBusy(true); setError('');
    try { const result = await meetingApi.uploadPhoto(room.roomId, file); changed({ photoFileId: result.fileId }); setUploadedName(result.fileName); }
    catch (failure) { setError(getErrorMessage(failure, '照片上传失败，原照片保持不变')); }
    finally { setBusy(false); }
  };
  return <BaseDialog open title={`预约规则 · ${room.name}`} width="extra-wide" panelClassName="meeting-dialog" onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button><Button variant="outline" disabled={busy} onClick={() => void inspect()}>预览存量影响</Button><Button disabled={busy} onClick={() => void save()}>{busy ? '处理中…' : '确认保存规则'}</Button></>}>
    <div className="space-y-5"><MeetingError message={error} /><p className="text-sm text-cf-subtle">现有预约保持原来的会后间隔；新规则用于后续新增、改期和提交。</p>
    <MeetingRuleFields rule={rule} busy={busy} onChange={changed} />
    <MeetingField label="会议室私有照片" hint="仅允许PNG/JPEG；保存规则后才替换展示照片，文件由统一存储管理。">{room.photoFileId && sameId(room.photoFileId, rule.photoFileId) && <MeetingPhoto roomId={room.roomId} fileId={room.photoFileId} />}<Input aria-label="上传会议室照片" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} />{uploadedName && <p role="status">已上传：{uploadedName}，等待保存规则。</p>}{rule.photoFileId && <Button variant="outline" disabled={busy} onClick={() => { changed({ photoFileId: null }); setUploadedName(''); }}>不再展示照片</Button>}</MeetingField>
    {preview && <section className="meeting-review"><h3 className="font-medium">存量预约影响 · {preview.affected.length}项</h3><p className="text-sm">{preview.explanation}</p><ul className="max-h-64 space-y-2 overflow-y-auto">{preview.affected.map((affected) => <li key={affected.eventId} className="text-sm">{affected.startTime} · {affected.title}：{affected.reason}</li>)}</ul>{preview.affected.length > 0 && <label className="meeting-checkbox"><input type="checkbox" checked={rule.confirmExistingConflicts} disabled={busy} onChange={(event) => setRule((previous) => ({ ...previous, confirmExistingConflicts: event.target.checked }))} />已核对存量影响，仅对后续预约应用新规则</label>}</section>}
    </div>
  </BaseDialog>;
}
