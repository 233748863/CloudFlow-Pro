import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/common';
import { financePublicationApi as api } from '@/services/api/financePublication';
import type { FinanceKind, FinancePublication } from '@/services/portalFinanceTypes';
import { getErrorMessage } from '@/utils/errorMessage';
import PortalFinanceContent from './PortalFinanceContent';

const same = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const status = { PRIVATE: '仅内部可见', PUBLISHED: '已向本公司客户公开', STALE: '单据已变化，待重新确认' };
export default function FinancePublicationPanel({ kind, id, onProtectionChange, onSaved }: {
  kind: FinanceKind; id: string | number; onProtectionChange: (protectedDraft: boolean) => void; onSaved?: (value: FinancePublication) => void;
}) {
  const [value, setValue] = useState<FinancePublication>();
  const [draft, setDraft] = useState<string[]>([]);
  const [review, setReview] = useState<FinancePublication>();
  const [busy, setBusy] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const dirty = !!value && !same(draft, value.fileIds);
  const protectedDraft = dirty || busy || needsReview;
  useLayoutEffect(() => {
    onProtectionChange(protectedDraft);
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (protectedDraft) window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [protectedDraft, onProtectionChange]);
  useLayoutEffect(() => () => onProtectionChange(false), [onProtectionChange]);

  const refresh = useCallback(async (preserve: boolean) => {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    const current = ++generation.current;
    try {
      const result = await api.read(kind, id);
      if (current !== generation.current) return;
      if (preserve) { setReview(result); setNeedsReview(true); }
      else { setValue(result); setDraft(result.fileIds); setNeedsReview(false); setReview(undefined); setError(''); }
    } catch (failure) {
      if (current === generation.current) { setError(getErrorMessage(failure, '读取失败，当前选择已保留')); if (preserve) setNeedsReview(true); }
    } finally { if (current === generation.current) { operation.current = false; setBusy(false); } }
  }, [kind, id]);
  useEffect(() => {
    void refresh(false);
    return () => { generation.current++; operation.current = false; };
  }, [refresh]);

  const confirm = async (publish: boolean) => {
    if (operation.current || !value || needsReview || error) return;
    operation.current = true; setBusy(true); setNotice('');
    const current = ++generation.current;
    try {
      const result = await api.confirm(kind, id, { version: value.version, publish, fileIds: publish ? draft : [] });
      if (current !== generation.current) return;
      setValue(result); setDraft(result.fileIds); setError(''); setDiscard(false);
      setNotice(publish ? '已确认公开，客户可查看以下内容及选中的票据。' : '已撤回公开，客户无法继续读取该记录及票据。');
      onSaved?.(result);
    } catch (failure) {
      if (current === generation.current) { setError(getErrorMessage(failure, '操作结果尚未确认，请先核对结果')); setNeedsReview(true); setReview(undefined); }
    } finally { if (current === generation.current) { operation.current = false; setBusy(false); } }
  };
  const upload = async (file: File) => {
    if (operation.current || needsReview || !value) return;
    operation.current = true; setBusy(true); setNotice('');
    const current = ++generation.current;
    try {
      const stored = await api.upload(kind, id, file);
      if (current !== generation.current) return;
      setValue(previous => previous ? { ...previous, availableFiles: [...previous.availableFiles.filter(item => item.fileId !== stored.fileId), stored] } : previous);
      setDraft(previous => [...previous.filter(fileId => fileId !== stored.fileId), stored.fileId]);
      setNotice('票据已上传并勾选，确认公开后客户才可读取。');
    } catch (failure) {
      if (current === generation.current) { setError(getErrorMessage(failure, '上传结果尚未确认，请核对已上传票据')); setNeedsReview(true); setReview(undefined); }
    } finally { if (current === generation.current) { operation.current = false; setBusy(false); } }
  };
  const adopt = (preserve: boolean) => {
    if (!review || operation.current) return;
    setValue(review);
    setDraft(preserve ? draft.filter(fileId => review.availableFiles.some(file => file.fileId === fileId)) : review.fileIds);
    setReview(undefined); setNeedsReview(false); setError(''); setDiscard(false);
    setNotice(preserve ? '已保留仍可选的票据，请核对内容后再次确认公开。' : '已采用服务器当前结果。');
    onSaved?.(review);
  };
  const unavailableSelection = !!value && draft.some(fileId => !value.availableFiles.some(file => file.fileId === fileId));
  return <section className="finance-controls finance-item space-y-4" aria-label="财务对外公开确认">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">财务对外公开确认</h3>
      <Button variant="outline" disabled={busy} onClick={() => void refresh(dirty || needsReview)}>核对最新结果</Button></div>
    <p className="text-sm text-cf-muted">客户只能查看本公司已确认公开的记录。回款和发票分别确认，单据内容变化后需要重新核对。</p>
    {value && <><p role="status" className="text-sm">{status[value.publicationStatus]} · 客户：{value.customerName}{value.publishedTime ? ` · 确认时间：${value.publishedTime.replace('T', ' ')}` : ''}</p>
      <h4 className="text-sm font-medium">客户可见内容预览</h4><PortalFinanceContent record={value.record} />
      <fieldset disabled={busy || needsReview || !!error} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">选择允许客户读取的票据</legend>
        {value.availableFiles.map(file => <label className="finance-choice text-sm" key={file.fileId}>
          <input type="checkbox" checked={draft.includes(file.fileId)} onChange={event => { setDraft(previous => event.target.checked ? [...previous, file.fileId] : previous.filter(id => id !== file.fileId)); setDiscard(false); }} />
          <span>{file.fileName}</span></label>)}
        {!value.availableFiles.length && <p className="text-sm text-cf-muted">尚未上传票据，可直接确认公开上述内容。</p>}
        <label className="block space-y-2 text-sm"><span>上传本单据票据</span><input type="file" className="block max-w-full" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} /></label>
      </fieldset>
      {unavailableSelection && <aside className="space-y-2 text-sm"><p>原公开票据包含其他操作者上传或已失效的文件。重新公开时只能选择本人上传的有效票据。</p>
        <Button variant="outline" disabled={busy || needsReview} onClick={() => setDraft(previous => previous.filter(fileId => value.availableFiles.some(file => file.fileId === fileId)))}>移除当前不可选票据</Button></aside>}
    </>}
    {busy && <p role="status" className="text-sm">正在处理，请稍候…</p>}
    {error && <p role="alert" className="break-words text-sm text-cf-danger">{error}</p>}
    {notice && <p role="status" className="text-sm text-cf-muted">{notice}</p>}
    {needsReview && <p className="text-sm">当前选择已保留。请先核对最新结果，再决定是否继续公开。</p>}
    {review && <aside className="finance-item space-y-3 text-sm"><p>服务器当前状态：{status[review.publicationStatus]}；已选 {review.fileIds.length} 份票据。</p>
      <PortalFinanceContent record={review.record} /><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => adopt(false)}>采用服务器结果</Button><Button variant="outline" disabled={busy} onClick={() => adopt(true)}>保留仍有效的选择</Button></div></aside>}
    <div className="flex flex-wrap gap-3"><Button disabled={!value || busy || needsReview || !!error || unavailableSelection} onClick={() => void confirm(true)}>确认公开</Button>
      <Button variant="outline" disabled={!value || value.publicationStatus === 'PRIVATE' || busy || needsReview || !!error} onClick={() => void confirm(false)}>撤回公开</Button>
      {(dirty || needsReview) && <Button variant="outline" disabled={busy} onClick={() => setDiscard(true)}>放弃本地选择</Button>}</div>
    {discard && <aside className="finance-item space-y-3 text-sm"><p>放弃本地选择不会撤销已送达服务器的操作，未核对的结果仍需重新读取。</p>
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setDiscard(false)}>继续核对</Button><Button variant="outline" onClick={() => { setDraft(value?.fileIds || []); setNeedsReview(false); setReview(undefined); setDiscard(false); if (needsReview) { setValue(undefined); setDraft([]); } setNotice('本地选择已放弃。'); }}>确认放弃</Button></div></aside>}
    {protectedDraft && <p className="text-xs text-cf-muted">正在处理或尚有待核对的选择，完成确认、核对或明确放弃后可关闭详情。</p>}
  </section>;
}
