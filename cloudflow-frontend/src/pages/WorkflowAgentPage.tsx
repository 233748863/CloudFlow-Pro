import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, Plus, RefreshCw, ShieldCheck, UserRoundCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, EmptyState, Input, PageLoading, Pagination, Textarea, UserSelector } from '@/components/common';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { SelectorShell } from '@/components/common/SelectorShell';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getErrorStatus } from '@/utils/errorMessage';
import { disableAgentSetting, getAgentDefinitions, getAgentSettings, previewAgentSetting, readLatestAgentSetting, saveAgentSetting, type AgentDefinitionOption, type AgentMode, type AgentSetting, type AgentSettingInput, type AgentSettingPreview } from '@/services/api/workflow/agent';

const statusLabels: Record<AgentSetting['effectiveStatus'], string> = { SCHEDULED: '待生效', EFFECTIVE: '生效中', EXPIRED: '已到期', DISABLED: '已停用' };
const modeLabels: Record<AgentMode, string> = { AGENT: '审批代理', AGENT_ASSIST: '仅协办意见' };
const controlClass = 'min-h-11 transition-colors duration-150 motion-reduce:transition-none';

const isConflict = (error: unknown) => getErrorStatus(error) === 409;
const inputTime = (value: string) => value.replace(' ', 'T');
const serverTime = (value: string) => `${value.replace('T', ' ')}${value.length === 16 ? ':00' : ''}`;
const localTime = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;

export const WorkflowAgentPage = () => {
  const { user } = useAuth();
  return <AgentSettingsContent key={`${user?.tenantId ?? ''}:${user?.id ?? ''}`} />;
};

const AgentSettingsContent = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('workflow:agent:mine');
  const [records, setRecords] = useState<AgentSetting[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'DISABLED'>('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<AgentSetting | 'new' | null>(null);
  const [disableTarget, setDisableTarget] = useState<AgentSetting | null>(null);
  const [disableError, setDisableError] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [disableConflict, setDisableConflict] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const refresh = useCallback(() => setReload(value => value + 1), []);

  useLayoutEffect(() => () => { mutation.current?.abort(); }, []);

  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    getAgentSettings(pageNum, pageSize, status || undefined, abort.signal).then(page => {
      if (abort.signal.aborted) return;
      setRecords(page.rows);
      setTotal(page.total);
      if (pageNum > Math.max(1, Math.ceil(page.total / pageSize))) setPageNum(Math.max(1, Math.ceil(page.total / pageSize)));
    }).catch(failure => { if (!abort.signal.aborted) setError(getErrorMessage(failure, '读取代理设置失败')); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [allowed, pageNum, pageSize, status, reload]);

  const disable = async () => {
    if (!disableTarget || mutation.current || disableConflict || !hasPermission('workflow:agent:remove')) return;
    const abort = new AbortController();
    mutation.current = abort;
    setDisabling(true);
    setDisableError('');
    try {
      await disableAgentSetting(disableTarget.settingId, disableTarget.version, abort.signal);
      if (abort.signal.aborted) return;
      toast.success('代理设置已停用，未完成任务保留给本人处理');
      setDisableTarget(null);
      refresh();
    } catch (failure) {
      if (abort.signal.aborted) return;
      setDisableError(getErrorMessage(failure, '停用失败，请重试'));
      setDisableConflict(isConflict(failure));
      refresh();
    } finally {
      if (!abort.signal.aborted) { setDisabling(false); mutation.current = null; }
    }
  };

  return <section className="admin-source-page space-y-4">
    <header className="admin-source-header">
      <div><p className="admin-source-kicker">个人审批安排</p><h2>我的代理设置</h2><span>保留本人的审批归属，按流程及时间安排代理或协办</span></div>
      <div className="admin-source-controls">
        <Button variant="outline" className={controlClass} disabled={!allowed || loading} onClick={refresh}><RefreshCw size={16} />刷新</Button>
        {hasPermission('workflow:agent:save') && <Button className={controlClass} onClick={() => setEditor('new')}><Plus size={16} />新增设置</Button>}
      </div>
    </header>
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <label className="flex flex-wrap items-center gap-3 text-sm text-cf-body">设置状态
        <select aria-label="设置状态" className={`rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface)] px-3 ${controlClass}`} value={status} disabled={!allowed} onChange={event => { setStatus(event.target.value as typeof status); setPageNum(1); }}>
          <option value="">全部</option><option value="ACTIVE">启用的设置</option><option value="DISABLED">已停用</option>
        </select>
      </label>
      <p className="flex items-center gap-2 text-xs text-cf-subtle"><ShieldCheck size={16} />禁止代理的节点仍由本人处理</p>
    </div>
    {!allowed ? <EmptyState title="暂无代理设置权限" /> : loading ? <PageLoading tip="正在读取本人代理设置…" /> : error ? <div className="card space-y-4 p-6"><p role="alert" className="text-sm text-red-600">{error}</p><Button variant="outline" className={controlClass} onClick={refresh}>重新读取</Button></div> : !records.length ? <EmptyState icon={<UserRoundCheck size={40} />} title="暂无代理设置" description="新增设置后，只会为允许代理的本人待办建立关系。" /> : <div className="grid gap-3 lg:grid-cols-2">
      {records.map(setting => <article key={setting.settingId} className="card min-w-0 space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="break-words font-semibold text-cf-title">{setting.agentUserName}</h3><p className="mt-1 text-sm text-cf-subtle">{modeLabels[setting.agentMode]}</p></div>
          <span className={`badge shrink-0 ${setting.effectiveStatus === 'EFFECTIVE' ? 'badge-success' : setting.effectiveStatus === 'SCHEDULED' ? 'badge-warning' : ''}`}>{statusLabels[setting.effectiveStatus]}</span>
        </div>
        <div className="space-y-2 text-sm text-cf-body"><p className="flex items-start gap-2"><CalendarClock size={16} className="mt-0.5 shrink-0" /><span className="break-words">{setting.startTime}<br />至 {setting.endTime}（截止时刻失效）</span></p><p>流程范围：{setting.definitionIds.length ? `指定 ${setting.definitionIds.length} 个已发布版本` : '全部允许代理的流程'}</p><p>当前覆盖 {setting.affectedTaskIds.length} 个本人待办</p>{setting.reason && <p className="break-words text-cf-subtle">原因：{setting.reason}</p>}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--cf-border)] pt-3">
          <Button variant="outline" className={controlClass} onClick={() => setEditor(setting)}>{setting.status === 'ACTIVE' && hasPermission('workflow:agent:save') ? '查看与修改' : '查看设置'}</Button>
          {setting.status === 'ACTIVE' && hasPermission('workflow:agent:remove') && <Button variant="ghost" className={controlClass} onClick={() => { setDisableTarget(setting); setDisableError(''); setDisableConflict(false); }}>停用</Button>}
        </div>
      </article>)}
    </div>}
    {allowed && !loading && !error && <Pagination total={total} page={pageNum} pageSize={pageSize} onPageChange={setPageNum} onPageSizeChange={size => { setPageSize(size); setPageNum(1); }} />}
    {editor && <AgentSettingEditor setting={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh(); }} />}
    <BaseDialog open={Boolean(disableTarget)} title="停用本人代理设置" width="narrow" onClose={() => { if (!disabling) setDisableTarget(null); }} footer={<><Button variant="outline" className={controlClass} disabled={disabling} onClick={() => setDisableTarget(null)}>取消</Button><Button variant="destructive" className={controlClass} disabled={disabling || disableConflict} onClick={() => void disable()}>{disabling ? '停用中…' : '确认停用'}</Button></>}>
      <p className="text-sm text-cf-body">停止由{disableTarget?.agentUserName}代理后，未完成任务保留给本人，已完成记录不变。</p>
      {disableError && <p role="alert" className="mt-3 text-sm text-red-600">{disableError}{disableConflict ? '请关闭后从已刷新的列表重新确认。' : ''}</p>}
    </BaseDialog>
  </section>;
};

const AgentSettingEditor = ({ setting, onClose, onSaved }: { setting?: AgentSetting; onClose: () => void; onSaved: () => void }) => {
  const { user, hasPermission } = useAuth();
  const [latest, setLatest] = useState(setting);
  const [form, setForm] = useState<AgentSettingInput>(() => setting ? { ...setting, agentUserId: String(setting.agentUserId) } : { agentUserId: '', agentMode: 'AGENT', definitionIds: [], startTime: localTime(new Date()), endTime: localTime(new Date(Date.now() + 86400000)), reason: '' });
  const [allDefinitions, setAllDefinitions] = useState(!setting?.definitionIds.length);
  const [options, setOptions] = useState<AgentDefinitionOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AgentSettingPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const editable = hasPermission('workflow:agent:save') && latest?.status !== 'DISABLED';
  useLayoutEffect(() => () => { mutation.current?.abort(); }, []);

  useEffect(() => {
    const abort = new AbortController();
    getAgentDefinitions(abort.signal).then(values => { if (!abort.signal.aborted) setOptions(values); })
      .catch(failure => { if (!abort.signal.aborted) setOptionsError(getErrorMessage(failure, '流程版本选项读取失败')); })
      .finally(() => { if (!abort.signal.aborted) setLoadingOptions(false); });
    return () => abort.abort();
  }, []);

  useEffect(() => { setPreviewPage(1); }, [form.agentUserId, form.agentMode, form.definitionIds, form.startTime, form.endTime, allDefinitions]);

  useEffect(() => {
    const abort = new AbortController();
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    if (!editable || !form.agentUserId || !form.startTime || !form.endTime
      || serverTime(form.endTime) <= serverTime(form.startTime) || (!allDefinitions && !form.definitionIds.length)) return () => abort.abort();
    setPreviewLoading(true);
    const timeout = window.setTimeout(() => {
      previewAgentSetting(latest?.settingId, { ...form, definitionIds: allDefinitions ? [] : form.definitionIds, startTime: serverTime(form.startTime), endTime: serverTime(form.endTime) }, previewPage, abort.signal)
        .then(value => {
          if (abort.signal.aborted) return;
          setPreview(value);
          const lastPage = Math.max(1, Math.ceil(value.total / 20));
          if (previewPage > lastPage) setPreviewPage(lastPage);
        })
        .catch(failure => { if (!abort.signal.aborted) setPreviewError(getErrorMessage(failure, '影响预览暂不可用，保存时仍会重新核实')); })
        .finally(() => { if (!abort.signal.aborted) setPreviewLoading(false); });
    }, 350);
    return () => { abort.abort(); window.clearTimeout(timeout); };
  }, [editable, latest?.settingId, form, allDefinitions, previewPage]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editable || mutation.current || conflict) return;
    if (!form.agentUserId || form.agentUserId === String(user?.id)) { setError('请选择其他启用用户作为代理人'); return; }
    if (!form.startTime || !form.endTime || serverTime(form.endTime) <= serverTime(form.startTime)) { setError('失效时间必须晚于生效时间'); return; }
    if (!allDefinitions && !form.definitionIds.length) { setError('请选择至少一个流程版本，或选择全部流程'); return; }
    const abort = new AbortController();
    mutation.current = abort;
    setBusy(true);
    setError('');
    try {
      await saveAgentSetting(latest?.settingId, { agentUserId: form.agentUserId, agentMode: form.agentMode, definitionIds: allDefinitions ? [] : form.definitionIds, startTime: serverTime(form.startTime), endTime: serverTime(form.endTime), reason: form.reason?.trim(), version: latest?.version }, abort.signal);
      if (!abort.signal.aborted) { toast.success('代理设置已保存'); onSaved(); }
    } catch (failure) {
      if (!abort.signal.aborted) { setError(getErrorMessage(failure, '保存失败，已保留填写内容')); setConflict(Boolean(latest) && isConflict(failure)); }
    } finally {
      if (!abort.signal.aborted) { setBusy(false); mutation.current = null; }
    }
  };

  const readLatest = async () => {
    if (!latest || mutation.current) return;
    const abort = new AbortController();
    mutation.current = abort;
    setBusy(true);
    try {
      const value = await readLatestAgentSetting(latest.settingId, abort.signal);
      if (!abort.signal.aborted) { setLatest(value); setForm({ ...value, agentUserId: String(value.agentUserId) }); setAllDefinitions(!value.definitionIds.length); setConflict(false); setError(''); }
    } catch (failure) {
      if (!abort.signal.aborted) setError(getErrorMessage(failure, '读取最新设置失败，已保留填写内容'));
    } finally {
      if (!abort.signal.aborted) { setBusy(false); mutation.current = null; }
    }
  };

  const selectedOptions = [...options.map(option => ({ id: option.definitionId, label: option.processName, subLabel: `已发布版本 ${option.version}` })),
    ...form.definitionIds.filter(identifier => !options.some(option => option.definitionId === identifier)).map(identifier => ({ id: identifier, label: `原选择：${identifier}`, subLabel: '当前版本不可选，保存前请重新核实', disabled: true }))];

  return <ModalOverlay className="!items-stretch !justify-end !p-0" aria-label={latest ? '本人代理设置' : '新增本人代理设置'} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => void save(event)} className="flex h-[100dvh] w-full min-w-0 flex-col bg-[var(--cf-surface-strong)] shadow-xl duration-200 motion-reduce:transition-none sm:max-w-xl">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--cf-border)] p-4"><div><h2 className="font-semibold text-cf-title">{latest ? '本人代理设置' : '新增本人代理设置'}</h2><p className="mt-1 text-xs text-cf-subtle">只影响本人被分派且允许代理的待办</p></div><Button type="button" variant="ghost" className="min-h-11 min-w-11" aria-label="关闭代理设置" disabled={busy} onClick={onClose}><X size={18} /></Button></header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <label className="block space-y-2"><span className="input-label">代理人</span><UserSelector single value={form.agentUserId} disabled={!editable || busy} placeholder="选择其他启用用户" onChange={identifier => setForm(current => ({ ...current, agentUserId: identifier || '' }))} /></label>
        <fieldset className="space-y-2" disabled={!editable || busy}><legend className="input-label">处理方式</legend>{(['AGENT', 'AGENT_ASSIST'] as AgentMode[]).map(mode => <label key={mode} className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--cf-border)] p-3 text-sm"><input type="radio" name="agentMode" value={mode} checked={form.agentMode === mode} onChange={() => setForm(current => ({ ...current, agentMode: mode }))} /><span>{modeLabels[mode]}<small className="mt-1 block text-cf-subtle">{mode === 'AGENT' ? '代理人可处理获准任务，审批归属保留给本人' : '协办人只追加意见，不能通过、驳回或转办'}</small></span></label>)}</fieldset>
        <fieldset className="space-y-2" disabled={!editable || busy}><legend className="input-label">流程范围</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="agentScope" checked={allDefinitions} onChange={() => setAllDefinitions(true)} />全部允许代理的流程</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="agentScope" checked={!allDefinitions} onChange={() => setAllDefinitions(false)} />指定已发布的流程版本</label>
          {!allDefinitions && <SelectorShell options={selectedOptions} value={form.definitionIds} loading={loadingOptions} disabled={!editable || busy || Boolean(optionsError)} multiple showAvatar={false} placeholder="选择流程及版本" onToggle={identifier => setForm(current => ({ ...current, definitionIds: current.definitionIds.includes(identifier) ? current.definitionIds.filter(value => value !== identifier) : [...current.definitionIds, identifier] }))} onRemove={identifier => setForm(current => ({ ...current, definitionIds: current.definitionIds.filter(value => value !== identifier) }))} />}
          {optionsError && <p role="alert" className="text-sm text-red-600">{optionsError}</p>}<p className="text-xs text-cf-subtle">指定范围固定到发布版本，流程升级后需重新核定。</p>
        </fieldset>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="min-w-0 space-y-2"><span className="input-label">生效时间（包含此刻）</span><Input type="datetime-local" step="1" required value={inputTime(form.startTime)} disabled={!editable || busy} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} className="min-h-11 min-w-0" /></label><label className="min-w-0 space-y-2"><span className="input-label">失效时间（不包含此刻）</span><Input type="datetime-local" step="1" required value={inputTime(form.endTime)} disabled={!editable || busy} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))} className="min-h-11 min-w-0" /></label></div>
        <label className="block space-y-2"><span className="input-label">安排原因（选填）</span><Textarea maxLength={500} rows={3} value={form.reason || ''} disabled={!editable || busy} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} /></label>
        <div className="space-y-3 rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-3 text-sm text-cf-body" aria-live="polite" aria-busy={previewLoading}>
          <p className="flex items-center gap-2 font-medium"><ShieldCheck size={16} />当前待办影响预览</p>
          <p className="text-xs leading-6 text-cf-subtle">按当前填写内容核实，保存时再次校验；未来任务在分派时判定。同一时间与流程不能安排重叠代理。</p>
          {previewLoading ? <p className="text-xs">正在核对本人待办…</p> : previewError ? <p role="alert" className="text-xs text-red-600">{previewError}</p> : preview ? <>
            <p className="text-xs">{statusLabels[preview.effectiveStatus]} · 本页可代理 {preview.rows.filter(task => task.allowed).length} 项 · 共 {preview.total} 个本人待办</p>
            {!preview.rows.length ? <p className="text-xs text-cf-subtle">当前没有本人待办</p> : <ul className="divide-y divide-[var(--cf-border)]">{preview.rows.map(task => <li key={task.taskId} className="space-y-1 py-2"><p className="break-words text-xs font-medium">{task.nodeName}</p><p className="break-all text-xs text-cf-subtle">{task.taskId}</p><p className={`text-xs ${task.allowed ? 'text-[var(--cf-chart-good)]' : 'text-cf-subtle'}`}>{task.reason}</p></li>)}</ul>}
            {preview.total > 20 && <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" className={controlClass} disabled={previewPage <= 1} onClick={() => setPreviewPage(page => page - 1)}>上一页</Button><span className="text-xs">{previewPage} / {Math.max(1, Math.ceil(preview.total / 20))}</span><Button type="button" variant="outline" className={controlClass} disabled={previewPage * 20 >= preview.total} onClick={() => setPreviewPage(page => page + 1)}>下一页</Button></div>}
            <p className="text-xs text-cf-subtle">核对时间：{preview.evaluatedAt}</p>
          </> : <p className="text-xs text-cf-subtle">{editable ? '选好代理人、流程范围及有效时间后显示预览' : `当前已覆盖 ${latest?.affectedTaskIds.length ?? 0} 个本人待办`}</p>}
        </div>
        {error && <div role="alert" className="space-y-2 rounded-md border border-red-200 p-3 text-sm text-red-700 dark:text-red-300"><p className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</p>{conflict && <p className="text-xs">已保留填写内容。读取最新设置会替换当前内容，请核对后再保存。</p>}{conflict && latest && <Button type="button" variant="outline" className={controlClass} disabled={busy} onClick={() => void readLatest()}>读取最新设置</Button>}</div>}
      </div>
      <footer className="flex justify-end gap-3 border-t border-[var(--cf-border)] p-4"><Button type="button" variant="outline" className={controlClass} disabled={busy} onClick={onClose}>关闭</Button>{editable && <Button type="submit" className={controlClass} disabled={busy || conflict}>{busy ? '处理中…' : '保存设置'}</Button>}</footer>
    </form>
  </ModalOverlay>;
};

export default WorkflowAgentPage;
