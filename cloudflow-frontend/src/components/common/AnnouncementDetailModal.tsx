import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, Info, Pin, Clock3, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { cn } from '@/utils/cn';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import { lockBodyScroll } from '@/utils/bodyScrollLock';
import './announcement-overlays.css';

interface AnnouncementDetailModalProps {
  announcement: Announcement | null;
  onClose: () => void;
  onMarkAsRead?: (announcementId: number) => void | Promise<void>;
  headerBadges?: React.ReactNode;
  extraInfo?: React.ReactNode;
  footerReadText?: string;
  footerUnreadText?: string;
  titleBadgeLabel?: string;
  zIndexClassName?: string;
  maxWidthClassName?: string;
}

export const AnnouncementDetailModal: React.FC<AnnouncementDetailModalProps> = ({
  announcement,
  onClose,
  onMarkAsRead,
  headerBadges,
  extraInfo,
  footerReadText = '您已阅读此公告',
  footerUnreadText = '点击"已读"标记此公告',
  titleBadgeLabel = '公告',
  zIndexClassName = 'z-[110]',
  maxWidthClassName = 'max-w-[780px]',
}) => {
  useEffect(() => {
    if (!announcement) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const unlockBodyScroll = lockBodyScroll();
    window.addEventListener('keydown', handleEscape);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleEscape);
    };
  }, [announcement, onClose]);

  if (!announcement || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'cf-announcement-layer fixed inset-0 flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[6vh] backdrop-blur-md',
        zIndexClassName,
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'cf-announcement-panel w-full overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-950 dark:ring-slate-700/70',
          maxWidthClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-purple-50/30 px-8 py-6 dark:border-slate-800 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-slate-950">
          <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-indigo-100/30 to-transparent dark:from-indigo-900/20" />
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 blur-3xl" />
          <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-gradient-to-tr from-purple-400/20 to-pink-500/20 blur-2xl" />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                  <Info className="h-5 w-5" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {titleBadgeLabel}
                  </span>
                  {!announcement.isRead ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-lg shadow-blue-500/30">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                      </span>
                      未读
                    </span>
                  ) : null}
                  {announcement.isTop === 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                      <Pin size={12} />
                      置顶
                    </span>
                  ) : null}
                  {headerBadges}
                </div>
              </div>

              <h2 className="mb-3 text-2xl font-bold leading-tight text-gray-900 dark:text-white">
                {announcement.title}
              </h2>

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4" />
                  <time>{formatAnnouncementRelativeWithDateTime(announcement.publishTime || announcement.createTime)}</time>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  <span>{announcement.isRead ? '已读' : '未读'}</span>
                </div>
              </div>

              {extraInfo ? <div className="mt-4">{extraInfo}</div> : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700 hover:shadow-lg dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="cf-announcement-scroll max-h-[60vh] overflow-y-auto bg-white px-8 py-8 dark:bg-slate-950">
          <div className="relative">
            <div className="absolute bottom-0 left-0 top-0 w-1 rounded-full bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-500" />
            <div className="pl-6">
              <AnnouncementContent content={announcement.content} />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 bg-gray-50/50 px-8 py-5 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Info className="h-4 w-4" />
              <span>{announcement.isRead ? footerReadText : footerUnreadText}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                关闭
              </button>
              {!announcement.isRead && onMarkAsRead ? (
                <button
                  type="button"
                  onClick={() => void onMarkAsRead(announcement.announcementId)}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-105 hover:shadow-xl"
                >
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    标记已读
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
