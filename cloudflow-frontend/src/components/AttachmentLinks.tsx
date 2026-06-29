import React from 'react';
import { Paperclip } from 'lucide-react';
import { getAttachmentDisplayName, normalizeAttachmentUrls } from '@/utils/attachment';

export const getAttachmentList = (attachmentUrl?: string) =>
  normalizeAttachmentUrls(attachmentUrl);

interface AttachmentLinksProps {
  value?: string;
  emptyText?: string;
  compact?: boolean;
}

export const AttachmentLinks: React.FC<AttachmentLinksProps> = ({
  value,
  emptyText = '暂无附件',
  compact = false,
}) => {
  const attachments = getAttachmentList(value);

  if (!attachments.length) {
    return <span className="text-sm text-slate-400">{emptyText}</span>;
  }

  return (
    <div className={compact ? 'flex flex-wrap gap-1.5' : 'grid gap-2'}>
      {attachments.map((url) => {
        const label = getAttachmentDisplayName(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={[
              'admin-option-surface inline-flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300',
              compact ? 'max-w-[12rem] px-2.5 py-1.5' : 'w-full px-4 py-3',
            ].join(' ')}
          >
            <Paperclip size={14} className="shrink-0" />
            <span className="truncate">{label}</span>
          </a>
        );
      })}
    </div>
  );
};

export default AttachmentLinks;
