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
    <div className={compact ? 'flex flex-wrap gap-1.5' : 'space-y-2'}>
      {attachments.map((url) => {
        const label = getAttachmentDisplayName(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={[
              'inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 transition hover:border-cyan-200 hover:bg-slate-50 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-cyan-800 dark:hover:text-cyan-200',
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
