import React, { useEffect, useMemo, useRef, useState } from 'react';
import { History, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { compareFormVersions, getFormVersion, getFormVersions, rollbackFormVersion, type FormVersionDifference } from '@/services/api/workflow/form-versions';
import { getErrorMessage } from '@/utils/errorMessage';
import type { FormDefinition } from '@/types';

const labels: Record<string, string> = { ADD_FIELD: '新增字段', REMOVE_FIELD: '删除字段', MODIFY_FIELD: '修改字段', LAYOUT_CHANGE: '布局变更', MIXED: '多类变更', UNCHANGED: '内容未变' };
const showValue = (value: unknown) => value === undefined || value === null ? '（无）' : JSON.stringify(value, null, 2);
const colorFor = { 新增: 'var(--cf-chart-good)', 删除: 'var(--cf-chart-critical)', 修改: 'var(--cf-chart-warning)', 布局: 'var(--cf-chart-warning)' };

const DifferenceView: React.FC<{ difference: FormVersionDifference }> = ({ difference }) => {
  const changes = [
    ...difference.added.map((change) => ({ ...change, kind: '新增' as const })),
    ...difference.removed.map((change) => ({ ...change, kind: '删除' as const })),
    ...difference.modified.map((change) => ({ ...change, kind: '修改' as const })),
    ...difference.layoutChanges.map((change) => ({ ...change, kind: '布局' as const, properties: { 布局位置: { before: change.from, after: change.to }, 布局属性: { before: change.before, after: change.after } } })),
  ];
  return <section aria-label="表单版本差异" className="space-y-3">
    <p className="text-sm text-cf-subtle">v{difference.fromVersion} → v{difference.toVersion} · {difference.summary}</p>
    {changes.length ? changes.map((change) => <article key={`${change.kind}-${change.fieldId}`} className="overflow-hidden rounded-md border border-[var(--cf-border)] border-l-4" style={{ borderLeftColor: colorFor[change.kind] }}>
      <h4 className="bg-[var(--cf-surface-muted)] px-3 py-2 text-sm font-medium"><span style={{ color: colorFor[change.kind] }}>{change.kind}</span> · {change.label} <span className="text-xs text-cf-faint">{change.fieldId}</span></h4>
      <div className="overflow-x-auto"><table className="w-full min-w-[440px] table-fixed text-left text-xs">
        <thead><tr className="border-b border-[var(--cf-border)]"><th className="w-1/5 p-3">属性</th><th className="p-3">变更前 · v{difference.fromVersion}</th><th className="p-3">变更后 · v{difference.toVersion}</th></tr></thead>
        <tbody>{Object.entries(change.properties).map(([property, values]) => <tr key={property} className="border-b border-[var(--cf-border)] last:border-0"><th className="break-words p-3 align-top font-medium">{property}</th><td className="p-3 align-top"><pre className="whitespace-pre-wrap break-all font-mono">{showValue(values.before)}</pre></td><td className="p-3 align-top"><pre className="whitespace-pre-wrap break-all font-mono">{showValue(values.after)}</pre></td></tr>)}</tbody>
      </table></div>
    </article>) : <p className="rounded-md border border-dashed border-[var(--cf-border)] p-4 text-sm text-cf-faint">两个版本的字段和布局相同</p>}
  </section>;
};

interface Props {
  latest: FormDefinition;
  viewedVersion?: number;
  disabled?: boolean;
  onPreview: (form: FormDefinition | undefined) => void;
  onRollback: (form: FormDefinition) => void;
}

export const FormVersionHistory: React.FC<Props> = ({ latest, viewedVersion, disabled, onPreview, onRollback }) => {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<FormDefinition[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [difference, setDifference] = useState<FormVersionDifference>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(String(latest.version || ''));
  const [rollbackTarget, setRollbackTarget] = useState<FormDefinition>();
  const [changeLog, setChangeLog] = useState('');
  const requestEpoch = useRef(0);
  const available = Boolean(latest.version);
  const identity = `${latest.id}:${latest.version}:${latest.versionLock}`;
  useEffect(() => () => { requestEpoch.current++; }, [identity]);
  useEffect(() => {
    let cancelled = false;
    setRecords([]); setDifference(undefined); setError('');
    if (!available) return;
    setLoading(true);
    getFormVersions(latest.id, pageNum).then((page) => {
      if (!cancelled) { setRecords(page.records); setTotal(page.total); }
    }).catch((failure) => { if (!cancelled) setError(getErrorMessage(failure, '版本列表读取失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [identity, available, pageNum, revision]);
  useEffect(() => { setPageNum(1); setTo(String(latest.version || '')); setFrom(''); setRollbackTarget(undefined); }, [identity]);
  const options = useMemo(() => {
    const values = new Map<number, FormDefinition>();
    if (latest.version) values.set(latest.version, latest);
    for (const form of records) if (form.version) values.set(form.version, form);
    if (viewedVersion && !values.has(viewedVersion)) values.set(viewedVersion, { ...latest, version: viewedVersion, isLatest: false });
    return [...values.values()].sort((left, right) => (right.version || 0) - (left.version || 0));
  }, [latest, records, viewedVersion]);
  const previewVersion = async (version: number) => {
    if (busy || disabled) return;
    if (version === latest.version) { onPreview(undefined); setOpen(false); return; }
    setBusy(true); setError('');
    const epoch = requestEpoch.current;
    try { const form = await getFormVersion(latest.id, version); if (epoch === requestEpoch.current) { onPreview(form); setOpen(false); } }
    catch (failure) { if (epoch === requestEpoch.current) setError(getErrorMessage(failure, '历史版本读取失败')); }
    finally { if (epoch === requestEpoch.current) setBusy(false); }
  };
  const compare = async (start = Number(from), end = Number(to)) => {
    if (busy) return;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) { setError('请输入有效的两个版本号'); return; }
    setBusy(true); setError(''); setDifference(undefined);
    const epoch = requestEpoch.current;
    try { const result = await compareFormVersions(latest.id, start, end); if (epoch === requestEpoch.current) { setDifference(result); setFrom(String(start)); setTo(String(end)); } }
    catch (failure) { if (epoch === requestEpoch.current) setError(getErrorMessage(failure, '版本比较失败')); }
    finally { if (epoch === requestEpoch.current) setBusy(false); }
  };
  const rollback = async () => {
    if (busy || disabled || !rollbackTarget?.version || latest.versionLock === undefined) return;
    setBusy(true); setError('');
    const epoch = requestEpoch.current;
    try {
      const saved = await rollbackFormVersion(latest.id, rollbackTarget.version, latest.versionLock, changeLog.trim() || undefined);
      if (epoch !== requestEpoch.current) return;
      onRollback(saved); setRollbackTarget(undefined); setDifference(undefined); setPageNum(1); setRevision((value) => value + 1);
      toast.success(`已创建回滚版本 v${saved.version}，历史版本保持不变`);
    } catch (failure) { if (epoch === requestEpoch.current) setError(getErrorMessage(failure, '回滚失败，请重新读取最新版后重试')); }
    finally { if (epoch === requestEpoch.current) setBusy(false); }
  };
  return <>
    <div className="flex flex-wrap items-center gap-2 [&_button]:min-h-11">
      <Select value={String(viewedVersion || latest.version || 'new')} disabled={!available || busy || disabled} onValueChange={(value) => void previewVersion(Number(value))}>
        <SelectTrigger aria-label="查看表单版本" className="min-h-11 w-44"><SelectValue placeholder="尚未保存版本" /></SelectTrigger>
        <SelectContent>{available ? options.map((form) => <SelectItem key={form.version} value={String(form.version)}>v{form.version}{form.version === latest.version ? ' · 最新版' : ' · 只读'}</SelectItem>) : <SelectItem value="new">尚未保存版本</SelectItem>}</SelectContent>
      </Select>
      <Button type="button" variant="outline" disabled={!available || disabled || busy} onClick={() => setOpen(true)}><History size={16} className="mr-1" />版本历史</Button>
      {error && !open ? <span role="alert" className="max-w-xs text-xs text-[var(--cf-chart-critical)]">{error}</span> : null}
    </div>
    <BaseDialog open={open} title="表单版本历史" description={`${latest.name} · 历史版本只读，回滚会生成新版本`} onClose={() => { if (!busy) setOpen(false); }} width="extra-wide" panelClassName="ml-auto !mr-0 !max-h-[94vh] [&_button]:min-h-11" closeOnEscape={!busy} hideCloseButton={busy}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-cf-subtle">共 {total} 个版本 · 第 {pageNum} / {Math.max(1, Math.ceil(total / 10))} 页</span><Button type="button" variant="ghost" disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14} className="mr-1" />刷新列表</Button></div>
        {error ? <p role="alert" className="text-sm text-[var(--cf-chart-critical)]">{error}</p> : null}
        {loading ? <p role="status" className="py-6 text-center text-sm text-cf-faint">正在读取版本历史…</p> : <div className="space-y-2">{records.map((form) => <article key={form.version} className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--cf-border)] p-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">v{form.version} · {labels[form.changeType || ''] || form.changeType || '版本记录'}{form.isLatest ? ' · 最新版' : ''}{form.isRollback ? ` · 回滚自v${form.rollbackFromVersion}` : ''}</p><p className="mt-1 break-words text-sm text-cf-subtle">{form.changeLog || '未填写变更说明'}</p><p className="mt-1 text-xs text-cf-faint">{form.createBy || '创建人未记录'} · {form.createTime?.replace('T', ' ') || '时间未记录'}</p></div>
          <div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void previewVersion(form.version!)}>查看 v{form.version}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void compare(form.version!, latest.version!)}>与最新版比较</Button><Button type="button" size="sm" variant="outline" disabled={busy || disabled || form.isLatest || latest.versionLock === undefined} onClick={() => { setChangeLog(`回滚至v${form.version}`); setError(''); setRollbackTarget(form); }}><RotateCcw size={14} className="mr-1" />回滚 v{form.version}</Button></div>
        </article>)}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pageNum === 1 || loading || busy} onClick={() => setPageNum((page) => page - 1)}>上一页</Button><Button type="button" variant="outline" disabled={pageNum * 10 >= total || loading || busy} onClick={() => setPageNum((page) => page + 1)}>下一页</Button></div>
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--cf-border)] pt-4"><label className="space-y-1 text-xs text-cf-subtle">变更前版本<Input aria-label="变更前版本" type="number" min={1} step={1} value={from} disabled={busy} onChange={(event) => setFrom(event.target.value)} className="w-28" /></label><label className="space-y-1 text-xs text-cf-subtle">变更后版本<Input aria-label="变更后版本" type="number" min={1} step={1} value={to} disabled={busy} onChange={(event) => setTo(event.target.value)} className="w-28" /></label><Button type="button" disabled={busy || !from || !to} onClick={() => void compare()}>比较版本</Button></div>
        {difference ? <DifferenceView difference={difference} /> : null}
      </div>
    </BaseDialog>
    <BaseDialog open={Boolean(rollbackTarget)} title={`确认回滚至 v${rollbackTarget?.version}`} description="将以目标版本内容创建新版本；当前未保存的编辑将被丢弃，中间版本及历史实例保持不变。" onClose={() => { if (!busy) setRollbackTarget(undefined); }} closeOnEscape={!busy} hideCloseButton={busy} panelClassName="[&_button]:min-h-11" zIndex={60} footer={<><Button type="button" variant="outline" disabled={busy} onClick={() => setRollbackTarget(undefined)}>取消回滚</Button><Button type="button" disabled={busy || disabled} onClick={() => void rollback()}>{busy ? '正在回滚…' : '确认并创建新版本'}</Button></>}>
      <label className="space-y-2 text-sm">回滚说明<Textarea aria-label="回滚说明" value={changeLog} maxLength={500} disabled={busy} onChange={(event) => setChangeLog(event.target.value)} /></label>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--cf-chart-critical)]">{error}</p> : null}
    </BaseDialog>
  </>;
};
