import React from 'react';
import { Bell, CheckCircle2, ChevronRight, Pin } from 'lucide-react';
import type { Announcement } from '@/types';
import { cn } from '@/utils/cn';
import { getAnnouncementExcerpt } from '@/utils/announcementContent';
import { formatAnnouncementRelativeTime } from '@/utils/announcementFormat';
import { getAnnouncementPriorityMeta } from '@/utils/announcementMeta';

interface AnnouncementListItemProps {
  announcement: Announcement;
  onClick: () => void;
  variant?: 'compact' | 'page';
  className?: string;
}

export const AnnouncementListItem: React.FC<AnnouncementListItemProps> = ({
  announcement,
  onClick,
  variant = 'compact',
  className,
}) => {
  const unread = !announcement.isRead;
  const priorityMeta = getAnnouncementPriorityMeta(announcement.priority);
  const timeText = formatAnnouncementRelativeTime(
    announcement.publishTime || announcement.createTime,
  );
  const excerpt = getAnnouncementExcerpt(announcement.content, variant === 'compact' ? 72 : 110);

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          `group flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors dark:border-slate-800 ${
            unread
              ? 'bg-cyan-50/40 hover:bg-cyan-50 dark:bg-cyan-950/10 dark:hover:bg-cyan-950/20'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70'
          }`,
          className,
        )}
      >
        <div
          className={cn(
            'mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border',
            unread
              ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
              : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500',
          )}
        >
          {unread ? <Bell size={14} /> : <CheckCircle2 size={14} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {announcement.title}
            </h3>
            {announcement.isTop === 1 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <Pin size={10} />
                置顶
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                priorityMeta.className,
              )}
            >
              {priorityMeta.label}
            </span>
            {unread ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                未读
              </span>
            ) : null}
          </div>

          <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
            {excerpt}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>#{announcement.announcementId}</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <time>{timeText}</time>
          </div>
        </div>

        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-300" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        `group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border px-4 py-4 text-left transition-colors ${
          unread
            ? 'border-cyan-200 bg-white shadow-sm hover:border-cyan-300 hover:bg-cyan-50/70 dark:border-cyan-900 dark:bg-slate-950 dark:hover:bg-cyan-950/20'
            : 'border-slate-200 bg-white shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900'
        }`,
        className,
      )}
    >
      {unread ? <div className="absolute left-0 top-0 h-full w-1.5 bg-cyan-500" /> : null}

      <div
        className={cn(
          'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border',
          unread
            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
            : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500',
        )}
      >
        {unread ? <Bell size={18} /> : <CheckCircle2 size={18} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.isTop === 1 ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <Pin size={10} />
              置顶
            </span>
          ) : null}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityMeta.className)}>
            {priorityMeta.label}
          </span>
          {unread ? (
            <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              未读
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
            {timeText}
          </span>
        </div>

        <h3
          className={cn(
            'mt-3 line-clamp-1 text-base',
            unread
              ? 'font-semibold text-slate-900 dark:text-slate-100'
              : 'font-medium text-slate-700 dark:text-slate-200',
          )}
        >
          {announcement.title}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {excerpt}
        </p>
      </div>

      <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-300" />
    </button>
  );
};
