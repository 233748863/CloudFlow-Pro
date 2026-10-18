import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { BaseDialog, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { getPrintTemplate, previewPrintTemplate } from '@/services/api/print';
import type { PrintFormat, PrintTemplate } from '@/services/api/print';
import { getErrorMessage } from '@/utils/errorMessage';
import { downloadPrintOutput, printOutputFormats } from '@/utils/printOutput';
import { PrintOutputPreview } from './PrintOutputPreview';

export function PrintTemplatePreviewDialog({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const [template, setTemplate] = useState<PrintTemplate>();
  const [sample, setSample] = useState('{}');
  const [format, setFormat] = useState<PrintFormat>('PDF');
  const [output, setOutput] = useState<{ blob: Blob; format: PrintFormat }>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    void getPrintTemplate(templateId).then(saved => {
      if (active) { setTemplate(saved); setFormat(saved.outputFormat); }
    }).catch(reason => { if (active) setError(getErrorMessage(reason, '读取已保存模板失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; request.current?.abort(); };
  }, [templateId]);

  const generate = async () => {
    if (!template || busy) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(sample);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('示例数据须为 JSON 对象，例如 {}');
    } catch (reason) { setError(getErrorMessage(reason, '示例数据格式无效')); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setOutput(undefined);
    try {
      const blob = await previewPrintTemplate(templateId, parsed as Record<string, unknown>, format, controller.signal);
      if (!controller.signal.aborted) setOutput({ blob, format });
    } catch (reason) { if (!controller.signal.aborted) setError(getErrorMessage(reason, '模板预览生成失败')); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return <BaseDialog open title={'示例预览 · ' + (template?.templateName || '打印模板')} width="extra-wide" zIndex={60} onClose={() => { if (!busy) onClose(); }} description="预览服务器上已保存的模板，编辑框中未保存的修改不会生效。示例数据由您填写，不读取业务数据，也不产生业务打印记录。" footer={<>
    <Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>关闭</Button>
    {output && <Button variant="outline" className="min-h-11" onClick={() => downloadPrintOutput(output.blob, 'template-preview-' + templateId + (output.format === 'EXCEL' ? '.xlsx' : '.' + output.format.toLowerCase()))}><Download size={16} />下载示例</Button>}
    <Button className="min-h-11" disabled={loading || busy || !template} onClick={() => void generate()}><Eye size={16} />{busy ? '正在生成…' : '生成预览'}</Button>
  </>}>
    <div className="space-y-4" aria-busy={loading || busy}>
      {loading && <p role="status">正在读取已保存模板…</p>}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <label className="block space-y-2"><span className="text-sm font-medium">示例数据（JSON 对象）</span><Textarea rows={6} maxLength={1048576} disabled={loading || busy} value={sample} onChange={event => { setSample(event.target.value); setOutput(undefined); }} /></label>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">预览输出格式</legend>
        <Select value={format} disabled={loading || busy || !template} onValueChange={value => { setFormat(value as PrintFormat); setOutput(undefined); }}><SelectTrigger aria-label="预览输出格式" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{printOutputFormats(template?.templateFormat || 'HTML').map(value => <SelectItem key={value} value={value}>{value === 'EXCEL' ? 'Excel' : value}</SelectItem>)}</SelectContent></Select>
      </fieldset>
      {output && <PrintOutputPreview blob={output.blob} format={output.format} />}
    </div>
  </BaseDialog>;
}
