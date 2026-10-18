import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { portal, PortalError, type PortalFile, type PortalTicket, type PortalTicketRequest } from '@/services/portal';

interface UploadDraft {
  requestKey: string;
  source: File;
  saved?: PortalFile;
  state: 'ready' | 'uncertain' | 'absent' | 'remove-uncertain';
  message?: string;
}

export function PortalTicketComposer({ tenantCode, open, onClose, onCreated }: {
  tenantCode: string; open: boolean; onClose: () => void; onCreated: (ticket: PortalTicket) => void;
}) {
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploads, setUploads] = useState<UploadDraft[]>([]);
  const [attempt, setAttempt] = useState<PortalTicketRequest>();
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const dirty = Boolean(title || description || uploads.length || attempt);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || Boolean(busy))
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  useEffect(() => { if (busy && blocker.state === 'blocked') blocker.reset(); }, [busy, blocker]);
  const run = async (label: string, operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError('');
    try { await operation(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '处理结果未确认，输入仍保留'); }
    finally { lock.current = false; setBusy(''); }
  };
  const replaceUpload = (key: string, patch: Partial<UploadDraft>) => setUploads(current => current.map(entry => entry.requestKey === key ? { ...entry, ...patch } : entry));
  const upload = async (entry: UploadDraft) => {
    try { replaceUpload(entry.requestKey, { saved: await portal.ticketUpload(tenantCode, entry.requestKey, entry.source), state: 'ready', message: '' }); }
    catch (failure) {
      replaceUpload(entry.requestKey, { state: 'uncertain', message: failure instanceof Error ? failure.message : '上传结果未确认' });
    }
  };
  const selectFiles = (files: File[]) => void run('正在上传附件…', async () => {
    if (attempt || uploads.length + files.length > 10) throw new Error('最多选择10个附件；提交结果未确认时不能更换附件');
    for (const source of files) {
      const entry: UploadDraft = { requestKey: crypto.randomUUID(), source, state: 'uncertain' };
      setUploads(current => [...current, entry]);
      await upload(entry);
    }
  });
  const reconcileUpload = (entry: UploadDraft) => void run('正在核对上传结果…', async () => {
    try {
      const saved = await portal.ticketUploaded(tenantCode, entry.requestKey);
      replaceUpload(entry.requestKey, { saved, state: 'ready', message: entry.state === 'remove-uncertain' ? '附件仍存在，可明确重试移除' : '已核对上传结果' });
    } catch (failure) {
      if (!(failure instanceof PortalError) || failure.code !== 404) throw failure;
      if (entry.state === 'remove-uncertain') setUploads(current => current.filter(candidate => candidate.requestKey !== entry.requestKey));
      else replaceUpload(entry.requestKey, { saved: undefined, state: 'absent', message: '未查到本次上传，可使用同一文件和标识重试' });
    }
  });
  const removeUpload = (entry: UploadDraft) => void run('正在移除暂存附件…', async () => {
    if (attempt) throw new Error('请先核对工单提交结果，再处理附件');
    if (!entry.saved) { setUploads(current => current.filter(candidate => candidate.requestKey !== entry.requestKey)); return; }
    try {
      await portal.ticketRemoveUpload(tenantCode, entry.saved.fileId);
      setUploads(current => current.filter(candidate => candidate.requestKey !== entry.requestKey));
    } catch (failure) { replaceUpload(entry.requestKey, { state: 'remove-uncertain', message: '移除结果未确认，请先核对' }); throw failure; }
  });
  const accepted = (ticket: PortalTicket) => {
    setTitle(''); setDescription(''); setUploads([]); setAttempt(undefined); setRetryAllowed(false); setRequestKey(crypto.randomUUID()); setError('');
    onCreated(ticket);
  };
  const send = (input: PortalTicketRequest) => void run('正在提交工单…', async () => {
    setAttempt(input); setRetryAllowed(false);
    try { accepted(await portal.ticketCreate(tenantCode, input)); }
    catch (failure) {
      if (failure instanceof PortalError && failure.code === 400) setAttempt(undefined);
      throw failure;
    }
  });
  const submit = () => {
    if (attempt || !title.trim() || !description.trim() || uploads.some(entry => entry.state !== 'ready' || !entry.saved)) return;
    send({ requestKey, title: title.trim(), description: description.trim(), fileIds: uploads.map(entry => entry.saved!.fileId) });
  };
  const reconcile = () => void run('正在核对原提交结果…', async () => {
    if (!attempt) return;
    setRetryAllowed(false);
    try {
      const result = await portal.ticketSubmission(tenantCode, attempt.requestKey);
      const sameFiles = result.attachments.map(file => String(file.fileId)).sort().join(',') === attempt.fileIds.map(String).sort().join(',');
      if (result.title !== attempt.title || result.description !== attempt.description || !sameFiles) throw new Error('原提交内容与本页不一致，请在工单列表核对，勿再次新建');
      accepted(result);
    } catch (failure) {
      if (failure instanceof PortalError && failure.code === 404) { setRetryAllowed(true); return; }
      throw failure;
    }
  });
  const download = (file: PortalFile) => void run('正在下载暂存附件…', async () => {
    const data = await portal.ticketDownload(tenantCode, undefined, file.fileId);
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.fileName;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return <><BaseDialog open={open} title="提交客户工单" width="wide" panelClassName="portal-controls" hideCloseButton={Boolean(busy)} closeOnEscape={!busy}
    onClose={() => { if (!lock.current) onClose(); }} footerClassName="flex-wrap"
    footer={<><Button variant="outline" disabled={Boolean(busy)} onClick={onClose}>返回列表（保留本页草稿）</Button><Button disabled={Boolean(busy) || Boolean(attempt) || !title.trim() || !description.trim() || uploads.some(entry => entry.state !== 'ready' || !entry.saved)} onClick={submit}>提交工单</Button></>}>
    <p className="text-sm leading-6 text-cf-muted">提交后由管理员或客服分派处理；标题与问题描述将作为客户原始记录保存。附件仅对本公司门户账号和有权处理此工单的内部人员可见。</p>
    {busy && <p role="status" className="portal-notice">{busy}</p>}{error && <p role="alert" className="portal-notice">{error}；输入和请求标识仍保留。</p>}
    {attempt && <section className="portal-notice space-y-3" aria-label="核对工单提交结果"><p>尚未确认工单是否已保存。请先只读核对，不重复新建。</p>
      <Button variant="outline" disabled={Boolean(busy)} onClick={reconcile}>核对原提交结果</Button>
      {retryAllowed && <><p>本次查询未找到记录；重试将发送完全相同的内容与请求标识，即使原请求稍后成功也只生成一张工单。</p><Button disabled={Boolean(busy)} onClick={() => send(attempt)}>使用原标识重试提交</Button></>}
    </section>}
    <fieldset disabled={Boolean(busy) || Boolean(attempt)} className="mt-5 min-w-0 space-y-4">
      <label className="portal-field"><span>工单标题（最多120字符）</span><Input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required /></label>
      <label className="portal-field"><span>问题描述（最多1000字符）</span><Textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} rows={6} required /></label>
      <label className="portal-field"><span>添加私有附件（{uploads.length}/10）</span><input className="cf-control w-full min-w-0 rounded-md p-2" type="file" multiple disabled={uploads.length >= 10}
        onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) selectFiles(files); }} /></label>
      <p className="text-xs leading-5 text-cf-muted">文件大小和类型按企业上传配置核验；上传未确认时保留原文件，先核对再重试。请移除不再需要的暂存附件。</p>
      <ul className="space-y-3" aria-label="待提交附件">{uploads.map(entry => <li key={entry.requestKey} className="portal-ticket-file">
        <div className="min-w-0"><p className="break-words text-sm font-medium">{entry.source.name}</p><p className="mt-1 text-xs text-cf-muted">{entry.source.size.toLocaleString()} 字节 · {entry.state === 'ready' ? '已上传，待随工单提交' : entry.state === 'absent' ? '待重试上传' : '结果待核对'}</p>{entry.message && <p className="mt-2 break-words text-xs" role="status">{entry.message}</p>}</div>
        <div className="flex flex-wrap gap-2">{entry.state === 'ready' && entry.saved && <Button variant="outline" onClick={() => download(entry.saved!)}>下载核对</Button>}
          {['uncertain', 'remove-uncertain'].includes(entry.state) && <Button variant="outline" onClick={() => reconcileUpload(entry)}>核对上传结果</Button>}
          {entry.state === 'absent' && <Button variant="outline" onClick={() => void run('正在重试原附件…', () => upload(entry))}>原文件重试上传</Button>}
          {['ready', 'absent'].includes(entry.state) && <Button variant="outline" aria-label={`移除附件 ${entry.source.name}`} onClick={() => removeUpload(entry)}>移除</Button>}
        </div>
      </li>)}</ul>
    </fieldset>
  </BaseDialog><BaseDialog open={blocker.state === 'blocked' && !busy} title="离开客户工单页面？" panelClassName="portal-controls" zIndex={60}
    onClose={() => { if (blocker.state === 'blocked') blocker.reset(); }} footerClassName="flex-wrap"
    footer={<><Button variant="outline" onClick={() => { if (blocker.state === 'blocked') blocker.reset(); }}>保留草稿，继续处理</Button><Button onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); }}>确认离开</Button></>}>
    <p className="text-sm leading-6">本页未提交输入与附件清单将丢失；已上传附件仍为私有。{attempt ? '提交结果仍需在工单列表核对，离开不会撤销已到达服务器的请求。' : '返回列表按钮可在本页保留草稿；离开前请移除不再需要的暂存附件。'}</p>
  </BaseDialog></>;
}
