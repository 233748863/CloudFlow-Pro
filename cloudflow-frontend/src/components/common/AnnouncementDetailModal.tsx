import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Clock3, Eye, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { Button } from '@/components/ui';
import { WorkspaceIconButton } from '@/components/workspace/WorkspaceControls';
import { cn } from '@/utils/cn';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
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
  footerReadText = '你已阅读该公告',
  footerUnreadText = '打开后会自动标记为已读',
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [announcement, onClose]);

  if (!announcement || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'cf-announcement-modal-overlay fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-900/32 p-4 pt-[6vh]',
        zIndexClassName,
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'cf-announcement-modal-panel w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl',
          maxWidthClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 bg-white px-6 pb-4 pt-5">
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700">
                  <Bell size={18} />
                </div>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                  {titleBadgeLabel}
                </span>
                {headerBadges}
                {!announcement.isRead ? (
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                    未读
                  </span>
                ) : null}
              </div>

              <h2 className="text-xl font-semibold leading-tight text-slate-900">
                {announcement.title}
              </h2>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1">
                  <Clock3 size={13} />
                  {formatAnnouncementRelativeWithDateTime(announcement.publishTime || announcement.createTime)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1">
                  <Eye size={13} />
                  {announcement.isRead ? '已读' : '未读'}
                </span>
              </div>

              {extraInfo ? <div className="mt-3">{extraInfo}</div> : null}
            </div>

            <WorkspaceIconButton icon={<X size={18} />} label="关闭公告详情" shape="circle" onClick={onClose} />
          </div>
        </div>

        <div className="cf-announcement-scroll max-h-[60vh] overflow-y-auto bg-slate-50 px-6 py-6">
          <div className="relative">
            <div className="absolute bottom-0 left-0 top-0 w-1 rounded-full bg-cyan-500" />
            <div className="pl-5">
              <AnnouncementContent content={announcement.content} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              {announcement.isRead ? footerReadText : footerUnreadText}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" className="rounded-xl" onClick={onClose}>
                关闭
              </Button>
              {!announcement.isRead && onMarkAsRead ? (
                <Button
                  size="lg"
                  className="rounded-xl px-5"
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
