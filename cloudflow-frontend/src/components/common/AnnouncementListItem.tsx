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
  const timeText = formatAnnouncementRelativeTime(announcement.publishTime || announcement.createTime);

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          `group relative flex min-h-[72px] w-full items-center gap-4 border-b border-slate-100 px-5 py-4 text-left transition-colors ${
            unread ? 'bg-cyan-50 hover:bg-cyan-100' : 'bg-white hover:bg-slate-50'
          }`,
          className,
        )}
      >
        {unread ? <div className="absolute left-0 top-0 h-full w-1 bg-cyan-500" /> : null}

        <div
          className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border',
              unread
                ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                : 'border-slate-200 bg-slate-50 text-slate-400',
          )}
        >
          {unread ? <Bell size={16} /> : <CheckCircle2 size={16} />}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-medium text-slate-900">{announcement.title}</h3>
              {unread ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                  未读
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <time>{timeText}</time>
              {announcement.isTop === 1 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <Pin size={10} />
                  置顶
                </span>
              ) : null}
            </div>
          </div>

          <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500" />
        </div>
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
            ? 'border-cyan-200 bg-white shadow-sm hover:border-cyan-300 hover:bg-cyan-50/70'
            : 'border-slate-200 bg-white shadow-sm hover:bg-slate-50'
        }`,
        className,
      )}
    >
      {unread ? <div className="absolute left-0 top-0 h-full w-1.5 bg-cyan-500" /> : null}

      <div
        className={cn(
          'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border',
          unread
            ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
            : 'border-slate-200 bg-slate-50 text-slate-400',
        )}
      >
        {unread ? <Bell size={18} /> : <CheckCircle2 size={18} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.isTop === 1 ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Pin size={10} />
              置顶
            </span>
          ) : null}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityMeta.className)}>
            {priorityMeta.label}
          </span>
          {unread ? (
            <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
              未读
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-xs text-slate-400">{timeText}</span>
        </div>

        <h3 className={cn('mt-3 line-clamp-1 text-base', unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
          {announcement.title}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
          {getAnnouncementExcerpt(announcement.content, 110)}
        </p>
      </div>

      <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500" />
    </button>
  );
};
