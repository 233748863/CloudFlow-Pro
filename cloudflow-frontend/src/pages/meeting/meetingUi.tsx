import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button, Input, Pagination } from '@/components/common';
import { contactApi, type Contact } from '@/services/api/contact';
import type { MeetingAcceptance, MeetingConflicts, MeetingId, MeetingPage, MeetingStatus } from '@/services/api/meeting';
import { getErrorMessage } from '@/utils/errorMessage';

export const meetingStatus: Record<MeetingStatus, string> = { PLANNED: '计划中', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消', NOT_HELD: '未举行' };
export const acceptanceStatus: Record<MeetingAcceptance, string> = { NONE: '未回应', ACCEPTED: '接受', DECLINED: '拒绝', TENTATIVE: '暂定' };
export const approvalStatus: Record<string, string> = { DRAFT: '预约草稿', NOT_REQUIRED: '无需审批', PENDING: '待审批占位', APPROVED: '审批通过', REJECTED: '审批拒绝', CANCELLED: '审批已撤销' };
export const deliveryStatus: Record<string, string> = { PENDING: '未到期 / 待审批', DISPATCHED: '等待投递结果', SENT: '已送达', FAILED: '未全部送达', CANCELLED: '已取消', QUEUED: '已排队', UNKNOWN: '结果未知', SKIPPED: '已跳过' };
export const meetingRows = <Value,>(page?: MeetingPage<Value>): Value[] => page?.rows ?? page?.records ?? [];
export const sameId = (first?: MeetingId | null, second?: MeetingId | null) => first != null && second != null && String(first) === String(second);
export const localTime = (value: string) => value.replace(' ', 'T').slice(0, 16);
export const backendTime = (value: string) => `${value.replace('T', ' ').slice(0, 16)}:00`;
export const dayString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function nextDay(value: string, offset = 1) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + offset); return dayString(date); }
export function readArray<Value>(value?: string | null): Value[] { try { const result: unknown = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } }

export function MeetingField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const labelId = useId();
  return <div className="meeting-field" role="group" aria-labelledby={labelId}><span id={labelId} className="text-sm font-medium">{label}</span>{children}{hint && <span className="text-xs text-cf-subtle">{hint}</span>}</div>;
}

export function MeetingError({ message }: { message?: string }) { return message ? <p role="alert" className="meeting-alert">{message}</p> : null; }

export function useMeetingData<Value>(loader: () => Promise<Value>) {
  const [data, setData] = useState<Value>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true; setLoading(true); setData(undefined); setError('');
    loader().then((value) => { if (current) setData(value); }).catch((failure) => { if (current) setError(getErrorMessage(failure, '数据加载失败，请重试')); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [loader, revision]);
  return { data, loading, error, refresh: () => setRevision((value) => value + 1) };
}

export function MeetingPagination({ total, page, pageSize = 50, onChange }: { total: number; page: number; pageSize?: number; onChange: (page: number) => void }) {
  return <Pagination total={total} page={page} pageSize={pageSize} showPageSizeSelector={false} onPageChange={onChange} onPageSizeChange={() => undefined} />;
}

export function MeetingConflictNotice({ value, confirmed, onConfirm, names = {} }: { value?: MeetingConflicts | null; confirmed: boolean; onConfirm: (value: boolean) => void; names?: Record<string, string> }) {
  if (!value) return null;
  const requiresConfirmation = !value.crmVerified || value.busy.length > 0;
  return <section className="meeting-review" aria-label="参与者冲突核查"><h3 className="font-medium">参与者时间核查</h3>{value.warning && <p role="status">{value.warning}</p>}
    {value.busy.length > 0 ? <ul className="max-h-48 overflow-y-auto space-y-2">{value.busy.map((busy, index) => <li key={`${busy.module}:${busy.userId}:${busy.startTime}:${index}`} className="text-sm">{names[String(busy.userId)] || '参与者'} · {busy.title} · {busy.startTime} — {busy.endTime}</li>)}</ul> : value.crmVerified && <p className="text-sm">本次核查未发现参与者时间冲突；提交时仍会重新核查。</p>}
    {requiresConfirmation && <label className="meeting-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} />我已查看提示，仍继续预约（会议室冲突必须解决）</label>}
  </section>;
}

export function MeetingPeoplePicker({ value, onChange, names, onNamesChange, single = false }: { value: MeetingId[]; onChange: (value: MeetingId[]) => void; names: Record<string, string>; onNamesChange: (names: Record<string, string>) => void; single?: boolean }) {
  const [search, setSearch] = useState(''); const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1);
  const [people, setPeople] = useState<Contact[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let current = true; setLoading(true); setError(''); setPeople([]);
    contactApi.list({ keyword, pageNum: page, pageSize: 20 }).then((result) => { if (current) { setPeople(result.records ?? result.rows ?? []); setTotal(result.total); } })
      .catch((failure) => { if (current) setError(getErrorMessage(failure, '人员列表加载失败')); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [keyword, page]);
  const toggle = (person: Contact) => {
    const id = String(person.user_id); const selected = value.some((selectedId) => sameId(selectedId, id));
    onNamesChange({ ...names, [id]: person.nick_name || person.user_name });
    onChange(selected ? value.filter((selectedId) => !sameId(selectedId, id)) : single ? [id] : [...value, id]);
  };
  return <div className="meeting-people"><div className="flex flex-wrap gap-2" aria-label="已选人员">{value.length ? value.map((id) => <Button key={id} type="button" variant="outline" onClick={() => onChange(value.filter((selectedId) => !sameId(id, selectedId)))} aria-label={`移除${names[String(id)] || `用户${id}`}`}>{names[String(id)] || `用户 #${id}`} ×</Button>) : <span className="text-sm text-cf-subtle">{single ? '未指定' : '尚未选择其他参与者，发起人自动加入'}</span>}</div>
    <div className="flex gap-2"><Input aria-label="搜索参与者姓名或部门" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setKeyword(search.trim()); setPage(1); } }} placeholder="搜索姓名或部门" /><Button type="button" variant="outline" onClick={() => { setKeyword(search.trim()); setPage(1); }}>搜索</Button></div>
    <MeetingError message={error} />{loading ? <p role="status">正在加载人员…</p> : <div className="grid gap-1 sm:grid-cols-2">{people.map((person) => <Button key={person.user_id} type="button" variant={value.some((id) => sameId(id, person.user_id)) ? 'secondary' : 'ghost'} aria-pressed={value.some((id) => sameId(id, person.user_id))} className="justify-start text-left" onClick={() => toggle(person)}><span className="truncate">{person.nick_name || person.user_name}<span className="ml-2 text-xs text-cf-subtle">{person.dept_name || '未填写部门'}</span></span></Button>)}{!people.length && !error && <p className="text-sm text-cf-subtle">未找到匹配的在职用户</p>}</div>}
    <MeetingPagination total={total} page={page} pageSize={20} onChange={setPage} />
  </div>;
}
