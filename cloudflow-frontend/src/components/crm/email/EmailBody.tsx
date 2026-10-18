import React from 'react';
import DOMPurify from 'dompurify';

export const emailStates: Record<string, string> = {
  DRAFT: '草稿 · 未发送', QUEUED: '排队中 · 尚未确认发送', SENDING: '正在投递', SENT: '邮件服务器已接纳',
  FAILED: '发送失败', UNKNOWN: '发送结果未明', MANUAL: '手工来信',
};
export const emailBusinessNames = { CUSTOMER: '客户', OPPORTUNITY: '商机', TICKET: '工单', QUOTE: '报价' };
const safeHtml = (value: string) => DOMPurify.sanitize(value, {
  ALLOWED_TAGS: ['p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'],
  ALLOWED_ATTR: [],
});
export const emailPlainText = (html: string) => new DOMParser().parseFromString(safeHtml(html).replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n'), 'text/html').body.textContent?.trim() || '';
export const emailTextHtml = (value: string) => `<p>${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>')}</p>`;

export function EmailBody({ html, title = '客户邮件正文' }: { html: string; title?: string }) {
  const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'"><style>body{font:14px/1.7 system-ui,sans-serif;padding:12px;overflow-wrap:anywhere;color:#202124}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:6px}</style></head><body>${safeHtml(html)}</body></html>`;
  return <iframe title={title} sandbox="" referrerPolicy="no-referrer" className="h-64 w-full min-w-0 rounded-lg border border-cf-border bg-white" srcDoc={document} />;
}

export function EmailStatus({ value }: { value: string }) {
  return <span className={`inline-flex rounded-md border border-cf-border px-2 py-1 text-xs ${['FAILED', 'UNKNOWN'].includes(value) ? 'text-cf-danger' : 'text-cf-body'}`}>{emailStates[value] || value}</span>;
}
