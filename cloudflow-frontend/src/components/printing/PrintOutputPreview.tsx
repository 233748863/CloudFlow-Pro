import React, { lazy, Suspense, useEffect, useState } from 'react';
import type { PrintFormat } from '@/services/api/print';

const PdfFilePreview = lazy(() => import('@/components/file-preview/PdfFilePreview'));

export function PrintOutputPreview({ blob, format }: { blob: Blob; format: PrintFormat }) {
  const [data, setData] = useState<Uint8Array>();
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setData(undefined); setHtml(''); setError('');
    // Excel 只提供下载，不再复制一份完整 ArrayBuffer。
    if (format === 'EXCEL') return () => { active = false; };
    void (format === 'HTML' ? blob.text() : blob.arrayBuffer()).then(value => {
      if (!active) return;
      if (typeof value === 'string') setHtml(value); else setData(new Uint8Array(value));
    }).catch(() => { if (active) setError('预览读取失败，请重新生成'); });
    return () => { active = false; };
  }, [blob, format]);
  if (error) return <p role="alert">{error}</p>;
  if (format === 'EXCEL') return <p>Excel 已生成，可下载检查；选择 PDF 可在线预览。</p>;
  if (format === 'HTML') return <iframe title="打印模板 HTML 示例预览" sandbox="" referrerPolicy="no-referrer" srcDoc={html} className="h-[55vh] w-full border border-[var(--cf-border)] bg-white" />;
  return data ? <Suspense fallback={<p>正在加载 PDF 预览…</p>}><PdfFilePreview data={data} fileName="打印模板示例.pdf" onError={setError} /></Suspense> : <p>正在读取预览…</p>;
}
