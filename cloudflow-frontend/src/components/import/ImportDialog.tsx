import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Monitor, RefreshCw, Upload } from 'lucide-react';
import { BaseDialog, Button, ConfirmDialog, Input, Pagination } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  cancelImportTask, downloadImportFile, downloadImportTemplate, executeImportTask, getImportTask,
  importStatusNames, isImportRunning, loadImportBusinesses, previewImportTask, uploadImportFile, validateImportTask,
} from '@/services/api/importTask';
import type { ImportBusiness, ImportPreview, ImportService, ImportTask } from '@/services/api/importTask';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';

interface ImportDialogProps {
  open: boolean;
  bizType: string;
  service?: ImportService;
  taskId?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

const errorNames: Record<string, string> = { REQUIRED: '必填', FORMAT: '格式', RANGE: '范围', DUPLICATE: '重复', REFERENCE: '引用', BUSINESS: '业务规则' };

export function ImportDialog(props: ImportDialogProps) {
  const breakpoint = useBreakpoint();
  if (!props.open) return null;
  if (breakpoint === 'mobile') return (
    <BaseDialog open title="批量导入" onClose={props.onClose} width="normal">
      <div className="flex flex-col items-center gap-3 py-12 text-center text-cf-muted">
        <Monitor className="h-10 w-10" aria-hidden="true" />
        <p className="font-medium text-cf-title">请到桌面端导入</p>
        <p className="text-sm">需要核对表格字段和错误明细，请使用电脑完成操作。</p>
      </div>
    </BaseDialog>
  );
  return <ImportSession key={`${props.service || ''}:${props.bizType}:${props.taskId || 'new'}`} {...props} />;
}

function ImportSession({ bizType, service, taskId, onClose, onSuccess }: ImportDialogProps) {
  const { hasPermission } = useAuth();
  const inputId = useId();
  const active = useRef(true);
  const busyRef = useRef(false);
  const successRef = useRef(onSuccess);
  const notified = useRef('');
  const [business, setBusiness] = useState<ImportBusiness | null>(null);
  const [task, setTask] = useState<ImportTask | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [errorPage, setErrorPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [initialRevision, setInitialRevision] = useState(0);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [updateKeyword, setUpdateKeyword] = useState('');
  const [confirmation, setConfirmation] = useState<'execute' | 'cancel' | null>(null);
  const canExecute = hasPermission('system:import:execute');
  const running = Boolean(task && isImportRunning(task));
  const processed = task ? task.successRows + task.failRows : 0;
  const validated = task ? task.validRows + task.invalidRows : 0;
  const canValidate = task && (task.status === 'UPLOADED' || (task.status === 'FAILED' && processed === 0 && validated < task.totalRows));
  const canImport = task && (task.status === 'VALIDATED' || (task.status === 'FAILED' && validated === task.totalRows && processed < task.totalRows));
  const canCancel = task && ['UPLOADED', 'VALIDATED', 'FAILED'].includes(task.status);
  const stage = !task || task.status === 'UPLOADED' ? 0 : ['VALIDATING', 'VALIDATED'].includes(task.status) ? 1 : 2;

  useEffect(() => { successRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadImportBusinesses(controller.signal).then(async (result) => {
      if (controller.signal.aborted) return;
      const matches = result.businesses.filter((item) => item.bizType === bizType && (!service || item.service === service));
      if (matches.length !== 1) throw new Error(result.unavailable.length ? '导入服务未就绪，请稍后重试' : '未找到有权限的导入业务');
      setBusiness(matches[0]);
      if (taskId) {
        const current = await getImportTask(matches[0].service, taskId, controller.signal);
        if (current.bizType !== matches[0].bizType) throw new Error('任务与所选导入业务不匹配');
        if (!controller.signal.aborted) setTask(current);
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) { setBusiness(null); setError(getErrorMessage(reason, '导入业务加载失败')); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bizType, service, taskId, initialRevision]);

  useEffect(() => {
    if (!task || running || task.successRows === 0) return;
    const marker = `${task.taskId}:${task.successRows}`;
    if (notified.current !== marker) { notified.current = marker; successRef.current?.(); }
  }, [task, running]);

  useEffect(() => {
    if (!business || !task || !running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await getImportTask(business.service, task.taskId, controller.signal);
        if (controller.signal.aborted) return;
        setTask(current);
        if (isImportRunning(current)) timer = setTimeout(poll, 2000);
      } catch (reason) {
        if (!controller.signal.aborted) setError(getErrorMessage(reason, '进度读取失败，请刷新任务'));
      }
    };
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [business, task?.taskId, running, revision]);

  useEffect(() => {
    if (!business || !task || (!task.fileUrl && !['SUCCESS', 'PARTIAL'].includes(task.status)) || running || busy) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    previewImportTask(business.service, task.taskId, errorPage, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setPreview(result); setTask(result.task); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(reason, '导入预览加载失败'));
    }).finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [business, task?.taskId, task?.status, task?.fileUrl, running, busy, errorPage, revision]);

  const perform = async (label: string, work: () => Promise<ImportTask | void>, recoveredStatuses: ImportTask['status'][] = []) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    try {
      const result = await work();
      if (active.current && result) { setTask(result); setPreview(null); setErrorPage(1); }
    } catch (reason) {
      if (active.current) setError(getErrorMessage(reason, '操作未完成，请刷新任务确认进度'));
      if (task && business) {
        try {
          const current = await getImportTask(business.service, task.taskId);
          if (active.current) {
            setTask(current);
            if (recoveredStatuses.includes(current.status)) setError('');
          }
        } catch { }
      }
    } finally {
      busyRef.current = false;
      if (active.current) setBusy('');
    }
  };

  const selectFile = (selected?: File) => {
    if (!selected || !business || busy) return;
    if (selected.size === 0 || selected.size > business.maxFileSize) {
      setError(`请选择非空文件，大小不能超过 ${business.maxFileSize / 1048576} MiB`);
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(selected.name)) { setError('请选择 .xlsx、.xls 或 UTF-8 CSV 文件'); return; }
    setFile(selected); setError('');
  };

  const download = (errors: boolean) => {
    if (!task || !business) return;
    void perform('下载中', async () => {
      downloadBlob(await downloadImportFile(business.service, task.taskId, errors), errors ? `错误_${task.fileName}` : task.fileName);
    });
  };

  const confirm = () => {
    if (!task || !business || !confirmation) return;
    const operation = confirmation;
    setConfirmation(null);
    void perform(operation === 'execute' ? '提交导入中' : '取消中', () => operation === 'execute'
      ? executeImportTask(business.service, task.taskId, skipInvalid)
      : cancelImportTask(business.service, task.taskId), operation === 'execute' ? ['IMPORTING', 'SUCCESS', 'PARTIAL'] : ['CANCELLED']);
  };

  const close = () => { if (!busy) onClose(); };
  return (
    <>
      <BaseDialog open title={business ? `${business.bizName}导入` : '批量导入'} onClose={close} width="extra-wide"
        description={business?.instructions?.[0] || '只新增数据，已有记录不会覆盖。请先校验，确认后再导入。'} closeOnEscape={!busy} hideCloseButton={Boolean(busy)}
        footer={<div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {canCancel && canExecute ? <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setConfirmation('cancel')}>取消任务</Button> : null}
            {task && !running && canExecute ? <Button variant="outline" disabled={Boolean(busy)} onClick={() => { setTask(null); setPreview(null); setFile(null); setError(''); setSkipInvalid(false); }}>重新上传</Button> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={Boolean(busy)} onClick={close}>{running ? '关闭并在后台继续' : '关闭'}</Button>
            {!task && business && canExecute ? <Button disabled={!file || Boolean(busy) || loading} onClick={() => { if (file) void perform('上传中', () => uploadImportFile(business, file)); }}><Upload size={16} />上传文件</Button> : null}
            {canValidate && business && canExecute ? <Button disabled={Boolean(busy)} onClick={() => void perform('校验中', () => validateImportTask(business.service, task.taskId), ['VALIDATING', 'VALIDATED'])}>校验文件</Button> : null}
            {canImport && canExecute ? <Button disabled={Boolean(busy) || (task.invalidRows > 0 && !skipInvalid)} onClick={() => setConfirmation('execute')}>{processed > 0 ? '继续未处理行' : '确认导入'}</Button> : null}
          </div>
        </div>}
      >
        <div className="space-y-5">
          <ol className="grid grid-cols-3 gap-2 text-sm" aria-label="导入步骤">
            {['上传文件', '校验预览', '导入结果'].map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined}
              className={`rounded-lg border px-3 py-2 ${stage === index ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-100' : 'border-slate-200 text-cf-muted dark:border-slate-800'}`}>
              {index + 1}. {label}
            </li>)}
          </ol>
          {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle size={18} className="shrink-0" /><span className="flex-1">{error}</span><Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => { setError(''); business ? setRevision((value) => value + 1) : setInitialRevision((value) => value + 1); }}>重试</Button></div> : null}
          {loading || busy ? <p role="status" className="flex items-center gap-2 text-sm text-cf-muted"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" />{busy || '加载导入业务'}</p> : null}
          {!task && business && !loading ? <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-cf-muted">最多 {business.maxRows.toLocaleString()} 行、{business.maxFileSize / 1048576} MiB，支持 .xlsx、.xls、UTF-8 CSV。</p>
              {canExecute ? <Button variant="outline" size="sm" style={{ minHeight: 44 }} disabled={Boolean(busy)} onClick={() => void perform('模板生成中', async () => { downloadBlob(await downloadImportTemplate(business), `${business.bizName}_导入模板.xlsx`); })}><Download size={16} />{business.supportsUpdates ? '下载新增模板' : '下载模板'}</Button> : null}
            </div>
            {business.instructions && business.instructions.length > 1 ? <ul className="list-disc space-y-2 pl-5 text-sm text-cf-muted">
              {business.instructions.slice(1).map(instruction => <li key={instruction}>{instruction}</li>)}
            </ul> : null}
            {canExecute && business.canDownloadUpdateTemplate ? <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--cf-border)] p-4">
              <label htmlFor={`${inputId}-updates`} className="min-w-0 flex-1 text-sm text-cf-title">
                <span className="mb-2 block">按{business.bizName}名称筛选更新模板</span>
                <Input id={`${inputId}-updates`} value={updateKeyword} maxLength={120} disabled={Boolean(busy)}
                  onChange={event => setUpdateKeyword(event.target.value)} placeholder={`留空下载全部可更新${business.bizName}`} style={{ height: 44, minHeight: 44 }} />
              </label>
              <Button variant="outline" style={{ minHeight: 44 }} disabled={Boolean(busy)} onClick={() => void perform('更新模板生成中', async () => {
                downloadBlob(await downloadImportTemplate(business, { updates: true, keyword: updateKeyword.trim() || undefined }), `${business.bizName}_更新模板.xlsx`);
              })}><Download size={16} />下载更新模板</Button>
            </div> : null}
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-[var(--cf-surface-muted)] p-8 text-center dark:border-slate-700"
              onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (canExecute) selectFile(event.dataTransfer.files[0]); }}>
              <FileSpreadsheet className="mx-auto mb-3 h-9 w-9 text-cf-muted" aria-hidden="true" />
              <label htmlFor={inputId} className="mb-3 block text-sm font-medium text-cf-title">选择或拖入导入文件</label>
              <input id={inputId} type="file" accept=".xlsx,.xls,.csv" disabled={!canExecute || Boolean(busy)} onChange={(event) => selectFile(event.target.files?.[0])} className="mx-auto block max-w-full text-sm text-cf-muted" />
              {file ? <p className="mt-3 break-all text-sm text-cf-title">{file.name} · {(file.size / 1024).toFixed(1)} KiB</p> : null}
              <p className="mt-3 text-xs text-cf-subtle">使用模板字段填写；引用对象可以填写有效编号，重名对象请使用编号。</p>
            </div>
          </section> : null}
          {task ? <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0"><p className="break-all font-medium text-cf-title">{task.fileName}</p><p className="mt-1 break-all text-xs text-cf-subtle">任务编号：{task.taskNo}</p></div>
              <div className="flex items-center gap-2"><span role="status" className="text-sm font-medium text-cf-title">{importStatusNames[task.status]}</span><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => setRevision((value) => value + 1)} aria-label="刷新导入进度"><RefreshCw size={16} /></Button></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[['总行数', task.totalRows], ['校验有效', task.validRows], ['成功写入', task.successRows], ['错误或跳过', Math.max(task.invalidRows, task.failRows)]].map(([label, value]) =>
                <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-cf-subtle">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-cf-title">{value}</p></div>)}
            </div>
            {running ? <div className="space-y-2"><progress aria-label="导入处理进度" value={task.status === 'VALIDATING' ? validated : processed} max={task.totalRows || 1} className="h-2 w-full accent-cyan-600" /><p className="text-xs text-cf-muted">任务正在处理，关闭窗口后仍会继续；完成后会发送站内消息。运行中的任务不能取消。</p></div> : null}
            {task.errorMessage ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{task.errorMessage}</p> : null}
            {!task.fileUrl && ['SUCCESS', 'PARTIAL'].includes(task.status) ? <p role="status" className="text-sm text-cf-muted">原文件已按业务保留策略删除，任务结果与错误明细仍可查看。</p> : null}
            {task.status === 'SUCCESS' ? <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={18} />{task.successRows} 行数据已成功{business?.supportsUpdates ? '写入' : '新增'}。</p> : null}
            {['PARTIAL', 'FAILED'].includes(task.status) && !running ? <p className="text-sm text-cf-muted">已写入 {task.successRows} 行，已处理 {processed} 行。已处理的失败行不会重复执行；修正数据后请创建新任务，仅上传需要重导的行。</p> : null}
            {canImport && task.invalidRows > 0 ? <label className="flex items-start gap-3 rounded-lg border border-amber-200 p-3 text-sm text-cf-title dark:border-amber-900"><input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-600" checked={skipInvalid} disabled={!canExecute || Boolean(busy)} onChange={(event) => setSkipInvalid(event.target.checked)} /><span>跳过已标记的 {task.invalidRows} 行校验错误，导入其余有效数据；未勾选时不会写入。</span></label> : null}
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!task.fileUrl || Boolean(busy)} onClick={() => download(false)}><Download size={15} />原始文件</Button>{task.errorFileUrl ? <Button variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => download(true)}><Download size={15} />下载错误文件</Button> : null}</div>
          </section> : null}
          {previewLoading && !running ? <p role="status" className="text-sm text-cf-muted">正在读取前20行预览与错误明细…</p> : null}
          {preview && business && !running ? <>
            {task?.fileUrl ? <section className="space-y-2"><h4 className="text-sm font-medium text-cf-title">数据预览（前20行）</h4><div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="min-w-full whitespace-nowrap text-left text-xs"><thead className="bg-[var(--cf-surface-muted)] text-cf-muted"><tr><th className="px-3 py-2">原行号</th>{business.columns.map((column) => <th key={column.field} className="px-3 py-2">{column.name}{column.required ? '*' : ''}</th>)}</tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNo} className="border-t border-slate-200 dark:border-slate-800"><td className="px-3 py-2">{row.rowNo}</td>{business.columns.map((column) => <td key={column.field} className="max-w-64 truncate px-3 py-2">{row.values[column.field] || '—'}</td>)}</tr>)}</tbody></table></div></section> : null}
            {preview.errors.total > 0 ? <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium text-cf-title">错误明细（{preview.errors.total} 条）</h4><p className="text-xs text-cf-muted">{Object.entries(preview.errorCounts).map(([type, count]) => `${errorNames[type] || type} ${count}`).join(' · ')}</p></div><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="min-w-full text-left text-xs"><thead className="bg-[var(--cf-surface-muted)] text-cf-muted"><tr>{['原行号', '字段', '原值', '问题说明'].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{preview.errors.rows.map((item) => <tr key={item.errorId} className="border-t border-slate-200 dark:border-slate-800"><td className="px-3 py-2">{item.rowNo}</td><td className="px-3 py-2">{item.columnName || '整行'}</td><td className="max-w-64 break-all px-3 py-2">{item.cellValue?.slice(0, 200) || '—'}</td><td className="px-3 py-2 text-rose-700 dark:text-rose-300">{item.errorMessage}</td></tr>)}</tbody></table></div><Pagination total={preview.errors.total} page={errorPage} pageSize={20} showPageSizeSelector={false} onPageChange={setErrorPage} onPageSizeChange={() => { }} /></section> : null}
          </> : null}
        </div>
      </BaseDialog>
      <ConfirmDialog open={confirmation !== null} title={confirmation === 'cancel' ? '取消导入任务？' : '确认写入数据？'}
        message={confirmation === 'cancel' ? '任务将停止后续操作，已经提交的数据会保留。' : `${business?.supportsUpdates ? '本次按文件中的操作列新增或更新数据' : '本次只新增数据'}，已提交的行不会自动撤回。${skipInvalid ? '已选择跳过校验错误行。' : '校验错误时不写入任何数据。'}`}
        confirmText={confirmation === 'cancel' ? '取消任务' : '开始导入'} onCancel={() => setConfirmation(null)} onConfirm={confirm} />
    </>
  );
}
