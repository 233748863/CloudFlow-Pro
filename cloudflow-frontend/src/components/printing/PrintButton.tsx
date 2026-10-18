import React, { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { listBusinessPrintTemplates, printBusinessDocument } from '@/services/api/print';
import type { PrintFormat, PrintTemplateOption } from '@/services/api/print';
import { getErrorMessage } from '@/utils/errorMessage';
import { downloadPrintOutput, printOutputFormats } from '@/utils/printOutput';

export function PrintButton({ bizType, bizId, disabled = false }: { bizType: string; bizId: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PrintTemplateOption[]>([]);
  const [templateCode, setTemplateCode] = useState('');
  const [format, setFormat] = useState<PrintFormat>('PDF');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const selected = options.find(option => option.templateCode === templateCode);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setGenerating(false); setError(''); setOptions([]); setTemplateCode('');
    void listBusinessPrintTemplates(bizType, bizId, controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setOptions(rows);
      const initial = rows.find(row => row.defaultFlag === 1);
      if (initial) { setTemplateCode(initial.templateCode); setFormat(initial.outputFormat); }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(getErrorMessage(reason, '读取可用模板失败'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [open, bizType, bizId, revision]);

  const generate = async () => {
    if (!selected || loading || generating || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    setGenerating(true); setError('');
    try {
      const blob = await printBusinessDocument(bizType, bizId, templateCode, format, controller.signal);
      if (controller.signal.aborted) return;
      downloadPrintOutput(blob, bizType + '-' + bizId + (format === 'EXCEL' ? '.xlsx' : '.' + format.toLowerCase()));
      toast.success('打印文件已生成，打印记录已保存');
      setOpen(false);
    } catch (reason) {
      if (!controller.signal.aborted) setError(getErrorMessage(reason, '打印生成失败'));
    } finally { if (!controller.signal.aborted) setGenerating(false); }
  };

  return <>
    <Button type="button" variant="outline" className="min-h-11 min-w-11" disabled={disabled} onClick={() => setOpen(true)}><Printer size={16} />打印</Button>
    <BaseDialog open={open} title="打印业务单据" zIndex={60} description="选择模板并生成文件；成功生成后保存打印记录。" onClose={() => { if (!generating) setOpen(false); }} footer={<>
      <Button variant="outline" className="min-h-11" disabled={generating} onClick={() => setOpen(false)}>取消</Button>
      <Button className="min-h-11" disabled={!selected || loading || generating || disabled} onClick={() => void generate()}>{generating ? '正在生成…' : '生成并下载'}</Button>
    </>}>
      <div className="space-y-4" aria-busy={loading || generating}>
        {loading ? <p role="status">正在读取可用模板…</p> : !error && options.length === 0 ? <p role="status">暂无启用模板，请联系管理员配置此业务的打印模板。</p> : null}
        {error && <div role="alert"><p className="text-red-600">{error}</p>{!options.length && <Button variant="outline" onClick={() => setRevision(value => value + 1)}>重新加载</Button>}</div>}
        <fieldset disabled={loading || generating || disabled} className="space-y-2"><legend className="mb-2 text-sm font-medium">打印模板</legend>
          <Select value={templateCode} disabled={loading || generating || disabled || options.length === 0} onValueChange={value => {
            const next = options.find(option => option.templateCode === value);
            setTemplateCode(value); if (next) setFormat(next.outputFormat);
          }}><SelectTrigger className="min-h-11" aria-label="打印模板"><SelectValue placeholder="请选择模板" /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.templateCode} value={option.templateCode}>{option.templateName}{option.defaultFlag === 1 ? '（默认）' : ''}</SelectItem>)}</SelectContent></Select>
        </fieldset>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">输出格式</legend>
          <Select value={format} disabled={!selected || generating || disabled} onValueChange={value => setFormat(value as PrintFormat)}><SelectTrigger className="min-h-11" aria-label="输出格式"><SelectValue /></SelectTrigger><SelectContent>{printOutputFormats(selected?.templateFormat || 'HTML').map(value => <SelectItem key={value} value={value}>{value === 'EXCEL' ? 'Excel' : value}</SelectItem>)}</SelectContent></Select>
        </fieldset>
      </div>
    </BaseDialog>
  </>;
}
