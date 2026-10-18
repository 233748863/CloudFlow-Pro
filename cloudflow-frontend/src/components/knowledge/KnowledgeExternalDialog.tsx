import { useCallback, useEffect, useRef, useState } from 'react';
import { BaseDialog, Button, ConfirmDialog } from '@/components/common';
import { knowledgeApi, type KnowledgeExternalState } from '@/services/api/knowledge';
import { getErrorMessage } from '@/utils/errorMessage';
import KnowledgeExternalContent from './KnowledgeExternalContent';
import './KnowledgeExternalDialog.css';

export default function KnowledgeExternalDialog({ documentId, onClose, onChanged }: {
  documentId: number; onClose: () => void; onChanged: () => void;
}) {
  const [state, setState] = useState<KnowledgeExternalState>();
  const [selected, setSelected] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [confirmation, setConfirmation] = useState<'withdraw' | 'close'>();
  const requestNumber = useRef(0);
  const writeLock = useRef(false);
  const load = useCallback(async (versionId: string, preserveSelection = false) => {
    const current = ++requestNumber.current;
    setLoading(true); setError(''); setAcknowledged(false); setState(undefined);
    try {
      const result = await knowledgeApi.externalPreview(documentId, versionId ? Number(versionId) : undefined);
      if (requestNumber.current === current) {
        setState(result); setUncertain(false);
        if (!preserveSelection) setSelectedFiles(Number(versionId) === result.externalVersionId ? result.externalAttachmentFileIds : []);
      }
    } catch (failure) {
      if (requestNumber.current === current) setError(getErrorMessage(failure, '读取发布状态失败，未进行发布'));
    } finally { if (requestNumber.current === current) setLoading(false); }
  }, [documentId]);
  useEffect(() => { void load(selected); return () => { requestNumber.current++; }; }, [load, selected]);
  const write = async (action: 'publish' | 'withdraw') => {
    if (writeLock.current || !state || uncertain || loading) return;
    if (action === 'publish' && (!acknowledged || state.preview?.versionId !== Number(selected)
      || selectedFiles.some(fileId => !state.attachmentCandidates.some(file => file.fileId === fileId)))) return;
    writeLock.current = true; setBusy(true); setError(''); setNotice(''); setConfirmation(undefined);
    try {
      const result = action === 'publish'
        ? await knowledgeApi.externalPublish(documentId, { version: state.version, versionId: Number(selected), attachmentFileIds: selectedFiles })
        : await knowledgeApi.externalWithdraw(documentId, state.version);
      setState(current => current ? { ...current, ...result, versions: current.versions, preview: current.preview,
        attachmentCandidates: current.attachmentCandidates, attachmentUnavailableReason: current.attachmentUnavailableReason } : result);
      setAcknowledged(false); setDirty(false);
      setNotice(action === 'publish' ? `已对外发布所选版本正文及 ${result.externalAttachmentFileIds.length} 个附件，其他附件保持内部可见。` : '已撤回，客户再次读取正文或下载附件时将无法访问。');
      onChanged();
    } catch (failure) {
      setUncertain(true);
      setError(`${getErrorMessage(failure, '未能确认处理结果')}；请核对最新状态后再操作。当前版本选择已保留。`);
    } finally { writeLock.current = false; setBusy(false); }
  };
  const invalidFiles = selectedFiles.some(fileId => !state?.attachmentCandidates.some(file => file.fileId === fileId));
  const close = () => { if (busy) return; if (acknowledged || dirty) setConfirmation('close'); else onClose(); };
  return <>
    <BaseDialog open title="对外发布知识版本" onClose={close} panelClassName="knowledge-external-controls" width="wide"
      footer={<><Button variant="outline" disabled={busy} onClick={close}>关闭</Button><Button variant="outline" disabled={busy || loading} onClick={() => void load(selected, true)}>核对最新状态</Button>
        <Button variant="outline" disabled={busy || loading || uncertain || !state?.externalVisible} onClick={() => setConfirmation('withdraw')}>撤回对外发布</Button>
        <Button disabled={busy || loading || uncertain || invalidFiles || !acknowledged || state?.status !== 'PUBLISHED' || state?.preview?.versionId !== Number(selected)} onClick={() => void write('publish')}>{busy ? '正在处理…' : '确认发布'}</Button></>}>
      <div className="space-y-4 text-sm">
        {loading && <p role="status">正在读取指定版本…</p>}
        {error && <p role="alert" className="rounded-lg border border-cf-border p-3">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-cf-border p-3">{notice}</p>}
        {state && <>
          <p>对外状态：{state.externalVisible ? `已发布 v${state.versions?.find(version => version.id === state.externalVersionId)?.versionNo ?? '待核对'}` : '未对外发布'}；{state.status === 'PUBLISHED' ? '内部审批已发布' : '当前文档未处于内部已发布状态，暂不可对外发布'}。</p>
          <p>当前公开附件：{state.externalAttachmentFileIds.length} 个。切换到其他版本后需重新勾选附件。</p>
          <label className="flex flex-col gap-2"><span>选择客户可见版本</span><select aria-label="选择客户可见版本" className="w-full rounded-lg border border-cf-border bg-cf-surface px-3" value={selected} disabled={busy || loading} onChange={event => { setNotice(''); setSelectedFiles([]); setDirty(true); setSelected(event.target.value); }}>
            <option value="">请明确选择版本</option>{state.versions?.map(version => <option key={version.id} value={version.id}>v{version.versionNo} · {version.title}</option>)}
          </select></label>
          {!state.versions?.length && <p>尚无已生成的发布版本，请先完成知识文档审批。</p>}
          {state.preview && <section className="rounded-lg border border-cf-border p-4" aria-label="客户正文预览"><h2 className="mb-3 break-words font-semibold">{state.preview.title}</h2><KnowledgeExternalContent content={state.preview.content || ''} /></section>}
          {state.attachmentUnavailableReason && <p className="rounded-lg border border-cf-border p-3 text-cf-muted">{state.attachmentUnavailableReason}</p>}
          {state.preview && <>
            <fieldset className="rounded-lg border border-cf-border p-3" disabled={busy || loading || uncertain}>
              <legend className="px-1 font-medium">选择公开附件（最多5个）</legend>
              {state.attachmentCandidates.map(file => <label key={file.fileId} className="flex min-h-11 items-center gap-3 py-2">
                <input type="checkbox" aria-label={`公开附件 ${file.fileName}`} checked={selectedFiles.includes(file.fileId)} onChange={event => {
                  setSelectedFiles(current => event.target.checked ? [...current, file.fileId] : current.filter(fileId => fileId !== file.fileId));
                  setAcknowledged(false); setDirty(true);
                }} /><span className="min-w-0 break-words">{file.fileName}<span className="ml-2 text-cf-muted">{file.fileSize.toLocaleString()} 字节</span></span>
              </label>)}
              {!state.attachmentCandidates.length && <p className="py-2 text-cf-muted">该版本没有可以公开的附件，可仅发布正文。</p>}
              {invalidFiles && <p role="alert" className="py-2">已选附件发生变化，请清空后重新勾选。</p>}
              {!!selectedFiles.length && <Button variant="outline" onClick={() => { setSelectedFiles([]); setAcknowledged(false); setDirty(true); }}>清空附件选择</Button>}
            </fieldset>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={acknowledged} disabled={busy || loading || uncertain || invalidFiles} onChange={event => setAcknowledged(event.target.checked)} /><span>确认公开本页预览正文和勾选附件，其他附件仅内部可见。</span></label>
            <p className="text-cf-muted">正文中的链接和图片地址不对外提供。</p>
          </>}
        </>}
      </div>
    </BaseDialog>
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation === 'withdraw' ? '撤回对外知识版本？' : '放弃当前发布选择？'}
      message={confirmation === 'withdraw' ? '客户再次读取该文档时将无法访问，内部文档及历史版本保持不变。' : '当前选择尚未发布，关闭后需要重新选择并确认。'}
      confirmText={confirmation === 'withdraw' ? '确认撤回' : '放弃选择'} onCancel={() => setConfirmation(undefined)}
      onConfirm={() => { if (confirmation === 'withdraw') void write('withdraw'); else onClose(); }} />
  </>;
}
