import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Button } from '@/components/common/button';
import { Textarea } from '@/components/common/textarea';
import { cn } from '@/utils/cn';

export const sanitizeFormRichText = (value: string): string => DOMPurify.sanitize(value, {
  ALLOWED_TAGS: ['p', 'br', 'div', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'del', 'a', 'hr'],
  ALLOWED_ATTR: ['href', 'title'],
});

export const renderFormMarkdown = (value: string): string => sanitizeFormRichText(marked.parse(value, { async: false, breaks: true, gfm: true }));

interface FormRichTextProps extends React.AriaAttributes {
  id: string;
  value: string;
  disabled: boolean;
  className?: string;
  onChange: (value: string) => void;
}

export const FormRichText: React.FC<FormRichTextProps> = ({ id, value, disabled, className, onChange, ...accessibility }) => {
  const [preview, setPreview] = useState(false);
  return <div className={cn('overflow-hidden rounded-md border border-[var(--cf-border)] bg-[var(--cf-surface)]', className)}>
    <div className="flex items-center justify-between gap-2 border-b border-[var(--cf-border)] bg-[var(--cf-surface-muted)] px-2 py-1">
      <span className="text-xs text-cf-subtle">支持标题、加粗和列表</span>
      <div className="flex gap-1"><Button type="button" variant={preview ? 'ghost' : 'secondary'} size="sm" onClick={() => setPreview(false)}>编辑</Button><Button type="button" variant={preview ? 'secondary' : 'ghost'} size="sm" onClick={() => setPreview(true)}>预览</Button></div>
    </div>
    {preview ? <div className="min-h-32 break-words px-3 py-2 text-sm text-cf-title [&_ul]:list-inside [&_ul]:list-disc [&_ol]:list-inside [&_ol]:list-decimal [&_pre]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderFormMarkdown(value) }} />
      : <Textarea id={id} {...accessibility} value={value} rows={6} disabled={disabled} className="rounded-none border-0 font-mono shadow-none" onChange={(event) => onChange(event.target.value)} />}
  </div>;
};
