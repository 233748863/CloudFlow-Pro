import type { PrintFormat } from '@/services/api/print';

export const printOutputFormats = (templateFormat: 'HTML' | 'EXCEL'): PrintFormat[] =>
  templateFormat === 'HTML' ? ['PDF', 'HTML'] : ['EXCEL', 'PDF'];

export function downloadPrintOutput(blob: Blob, fallbackName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = blob instanceof File ? blob.name : fallbackName;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // 下载接管后释放；点击失败也不能留下持有文件内容的对象 URL。
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
