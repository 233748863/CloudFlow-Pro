import React from 'react';
import { CheckCircle2, ChevronRight, Info, Pin } from 'lucide-react';
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
          `group relative flex min-h-[72px] w-full items-center gap-4 border-b border-gray-100 px-6 py-4 text-left transition-all hover:bg-gray-50 ${
            unread ? 'bg-blue-50/30' : ''
          }`,
          className,
        )}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
          {unread ? (
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-blue-400 opacity-75" />
              <Info size={18} className="relative z-10" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <CheckCircle2 size={18} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-gray-900">
              {announcement.title}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              <time className="text-xs text-gray-500">{timeText}</time>
              {unread ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
                  </span>
                  未读
                </span>
              ) : null}
            </div>
          </div>

          <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1" />
        </div>

        {unread ? (
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        `group relative flex w-full items-start gap-4 overflow-hidden rounded-[28px] border px-5 py-5 text-left transition-all ${
          unread
            ? 'border-blue-100 bg-white shadow-[0_16px_42px_rgba(59,130,246,0.08)] hover:border-blue-200 hover:bg-blue-50/30'
            : 'border-slate-200/80 bg-white/92 shadow-[0_14px_36px_rgba(15,23,42,0.05)] hover:bg-slate-50/80'
        }`,
        className,
      )}
    >
      {unread ? (
        <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-blue-500 to-indigo-600" />
      ) : null}

      <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center">
        {unread ? (
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-blue-400 opacity-70" />
            <Info size={18} className="relative z-10" />
          </div>
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <CheckCircle2 size={18} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.isTop === 1 ? <Pin size={14} className="text-rose-500" /> : null}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', priorityMeta.className)}>
            {priorityMeta.label}
          </span>
          {unread ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
              </span>
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
