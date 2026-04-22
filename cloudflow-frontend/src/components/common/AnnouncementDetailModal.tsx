import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Clock3, Eye, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { Button } from '@/components/ui';
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
  footerReadText = '你已阅读该公告。',
  footerUnreadText = '打开后会自动标记为已读。',
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
        'cf-announcement-modal-overlay fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/44 p-4 pt-[6vh] backdrop-blur-[3px]',
        zIndexClassName,
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'cf-announcement-modal-panel w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_48px_rgba(15,23,42,0.16)] ring-1 ring-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800/80 dark:shadow-[0_28px_56px_rgba(2,6,23,0.56)]',
          maxWidthClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                  <Bell size={15} />
                </div>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                  {titleBadgeLabel}
                </span>
                {headerBadges}
                {!announcement.isRead ? (
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                    未读
                  </span>
                ) : null}
              </div>

              <h2 className="text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
                {announcement.title}
              </h2>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 dark:border-slate-800 dark:bg-slate-900">
                  <Clock3 size={13} />
                  {formatAnnouncementRelativeWithDateTime(
                    announcement.publishTime || announcement.createTime,
                  )}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 dark:border-slate-800 dark:bg-slate-900">
                  <Eye size={13} />
                  {announcement.isRead ? '已读' : '未读'}
                </span>
              </div>

              {extraInfo ? <div className="mt-3">{extraInfo}</div> : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
              aria-label="关闭公告详情"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="cf-announcement-scroll max-h-[60vh] overflow-y-auto bg-white px-5 py-5 dark:bg-slate-950">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <AnnouncementContent content={announcement.content} />
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {announcement.isRead ? footerReadText : footerUnreadText}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" className="rounded-lg" onClick={onClose}>
                关闭
              </Button>
              {!announcement.isRead && onMarkAsRead ? (
                <Button
                  size="lg"
                  className="rounded-lg px-5"
                  onClick={() => void onMarkAsRead(announcement.announcementId)}
                >
                  <span className="flex items-center gap-2">
                    <Check size={16} />
                    标记已读
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
