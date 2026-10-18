import React, { useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, PermissionGuard, WarningConfirmDialog } from '@/components/common';
import { downloadCodegenTable, writeCodegenTable } from '@/services/api/codegen';
import type { CodegenTable, CodegenWriteResult } from '@/services/api/codegen';
import { downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureField, InfrastructureSelect } from '../_components/InfrastructurePrimitives';

const codeTokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:package|import|public|private|protected|class|interface|extends|implements|return|if|else|new|void|static|final|throw|throws|SELECT|FROM|WHERE|CREATE|TABLE|INSERT|INTO|VALUES|UPDATE|DELETE|NOT|NULL)\b|@[A-Za-z][A-Za-z0-9]*)/g;

function CodePreview({ source }: { source: string }) {
  return <pre className="max-h-[50vh] overflow-auto rounded-md border bg-[var(--cf-surface-muted)] p-4 text-xs leading-6" tabIndex={0} aria-label="生成代码内容"><code>{source.split(codeTokens).map((token, index) => (
    <span key={index} className={token.startsWith('"') || token.startsWith("'") ? 'text-cf-muted' : /^(@|[A-Z]+$)/.test(token) || /^(package|import|public|private|protected|class|interface|extends|implements|return|if|else|new|void|static|final|throw|throws)$/.test(token) ? 'font-semibold text-cf-title' : 'text-cf-subtle'}>{token}</span>
  ))}</code></pre>;
}

export function PreviewDialog({ table, files, onClose }: {
  table: CodegenTable;
  files: Record<string, string>;
  onClose: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState(Object.keys(files)[0] || '');
  const [targetRoot, setTargetRoot] = useState('generated');
  const [writtenRoot, setWrittenRoot] = useState('');
  const [writeResult, setWriteResult] = useState<CodegenWriteResult | null>(null);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const overwriteFiles = writeResult
    ? Array.from(new Set([...writeResult.written, ...writeResult.skipped, ...writeResult.overwritten]))
    : [];

  const download = async () => {
    if (!table.tableId || busy) return;
    setBusy(true);
    try { downloadBlob(await downloadCodegenTable(table.tableId), `${table.tableName}.zip`); }
    catch (reason) { toast.error(getErrorMessage(reason, '下载生成代码失败')); }
    finally { setBusy(false); }
  };

  const write = async (overwrite: boolean) => {
    if (!table.tableId || busy) return;
    setBusy(true);
    try {
      const result = await writeCodegenTable(table.tableId, targetRoot.trim(), overwrite);
      setWriteResult(result);
      setWrittenRoot(targetRoot.trim());
      toast.success(`新写入 ${result.written.length} 个文件，跳过 ${result.skipped.length} 个，覆盖 ${result.overwritten.length} 个`);
    } catch (reason) { toast.error(getErrorMessage(reason, '写入生成代码失败')); }
    finally { setBusy(false); }
  };

  const requestWrite = () => {
    const target = targetRoot.trim();
    if (!target || target.includes('..') || /^([a-z]:|[\\/])/i.test(target)) {
      toast.error('请填写项目内的相对目录，禁止绝对路径或上级目录');
      return;
    }
    setConfirmWrite(true);
  };

  return <>
    <BaseDialog open title={`生成代码：${table.tableName}`} description={`${Object.keys(files).length} 个文件；预览与下载不会改动业务代码。`} width="full" onClose={() => { if (!busy) onClose(); }} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button><PermissionGuard permissions={['system:codegen:generate']} hidden><Button disabled={busy} onClick={() => void download()}>下载压缩包</Button></PermissionGuard></>}>
      <div className="space-y-4">
        <InfrastructureField label="预览文件"><InfrastructureSelect value={selectedFile} options={Object.keys(files).map((value) => ({ value, label: value }))} onValueChange={setSelectedFile} /></InfrastructureField>
        <CodePreview source={files[selectedFile] || ''} />
        <PermissionGuard permissions={['system:codegen:generate']} hidden>
          <div className="grid items-end gap-3 border-t pt-4 sm:grid-cols-[1fr_auto]">
            <InfrastructureField label="写入目录" hint="相对于项目根目录；首次写入会跳过所有已存在文件"><Input disabled={busy} value={targetRoot} onChange={(event) => { setTargetRoot(event.target.value); setWriteResult(null); }} /></InfrastructureField>
            <Button variant="outline" disabled={busy} onClick={requestWrite}>安全写入</Button>
          </div>
          {writeResult && <div className="space-y-3 rounded-md border p-4 text-sm" role="status">
            <p>已写入 {writeResult.written.length} 个，已跳过 {writeResult.skipped.length} 个，已覆盖 {writeResult.overwritten.length} 个文件。</p>
            {writeResult.skipped.length > 0 && <>
              <p className="font-medium text-cf-title">再次生成将覆盖以下 {overwriteFiles.length} 个文件，包含刚才新写入的文件，请逐项核对：</p>
              <ul aria-label="本次将覆盖的文件" className="max-h-40 overflow-auto break-all font-mono text-xs leading-6 text-cf-muted">{overwriteFiles.map((file) => <li key={file}>{file}</li>)}</ul>
              <Button variant="destructive" disabled={busy || writtenRoot !== targetRoot.trim()} onClick={() => setConfirmOverwrite(true)}>确认覆盖已存在文件</Button>
            </>}
          </div>}
        </PermissionGuard>
      </div>
    </BaseDialog>
    <WarningConfirmDialog open={confirmWrite} onClose={() => setConfirmWrite(false)} title="写入生成代码" message={`将向项目内目录“${targetRoot}”写入 ${Object.keys(files).length} 个候选文件。`} description="已存在的文件会跳过，返回跳过清单后再决定是否覆盖。" onConfirm={() => void write(false)} />
    <WarningConfirmDialog open={confirmOverwrite} onClose={() => setConfirmOverwrite(false)} title="覆盖确认" message={`将覆盖刚才列出的 ${overwriteFiles.length} 个现有文件。`} description="包含刚才新写入的文件；确认前请确保清单内所有文件的现有内容可以被替换。" requireDoubleConfirm doubleConfirmText="我已核对文件清单，确认覆盖" severity="danger" onConfirm={() => void write(true)} />
  </>;
}
