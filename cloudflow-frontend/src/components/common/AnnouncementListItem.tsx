import React from 'react';
import { Bell, CheckCircle2, ChevronRight, Pin } from 'lucide-react';
import type { Announcement } from '@/types';
import { cn } from '@/utils/cn';
import { getAnnouncementExcerpt } from '@/utils/announcementContent';
import { formatAnnouncementRelativeTime } from '@/utils/announcementFormat';
import { useAnnouncementPriorityMeta, useAnnouncementTypeMeta } from '@/utils/announcementMeta';

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
  const getPriorityMeta = useAnnouncementPriorityMeta();
  const getTypeMeta = useAnnouncementTypeMeta();
  const priorityMeta = getPriorityMeta(announcement.priority);
  const typeMeta = getTypeMeta(announcement.type);
  const timeText = formatAnnouncementRelativeTime(
    announcement.publishTime || announcement.createTime,
  );
  const excerpt = getAnnouncementExcerpt(announcement.content, variant === 'compact' ? 96 : 110);

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          `group flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors dark:border-slate-800 ${
            unread
              ? 'bg-teal-50/55 hover:bg-teal-50 dark:bg-teal-950/12 dark:hover:bg-teal-950/22'
              : 'bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70'
          }`,
          className,
        )}
      >
        <div
          className={cn(
            'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border',
            unread
              ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/80 dark:bg-teal-950/30 dark:text-teal-200'
              : 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500',
          )}
        >
          {unread ? typeMeta.icon : <CheckCircle2 size={16} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeMeta.className}`}>
                  {unread ? <Bell size={11} /> : typeMeta.icon}
                  {typeMeta.label}
                </span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityMeta.className}`}>
                  {priorityMeta.label}
                </span>
                {announcement.isTop === 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <Pin size={10} />
                    置顶
                  </span>
                ) : null}
                {unread ? (
                  <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:border-teal-900/80 dark:bg-teal-950/30 dark:text-teal-200">
                    未读
                  </span>
                ) : null}
              </div>

              <div className="mt-2 flex items-start justify-between gap-3">
                <h3 className="min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
                  <span className="line-clamp-1">{announcement.title}</span>
                </h3>
                <time className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{timeText}</time>
              </div>

              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {excerpt}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{announcement.isRead ? '已读' : '待处理'}</span>
              </div>
            </div>

            <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-300" />
          </div>
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
