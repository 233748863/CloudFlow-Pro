import React from 'react';
import { Check, Eye, Info, Pin, Clock3 } from 'lucide-react';
import type { Announcement } from '@/types';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button } from '@/components/common/button';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
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
  footerReadText = '您已阅读此公告',
  footerUnreadText = '点击"已读"标记此公告',
  titleBadgeLabel = '公告',
  zIndexClassName = 'z-[110]',
  maxWidthClassName = 'max-w-[780px]',
}) => {
  const zIndex = zIndexClassName.includes('120') ? 120 : zIndexClassName.includes('110') ? 110 : 100;

  return (
    <BaseDialog
      open={Boolean(announcement)}
      title={announcement?.title || '公告详情'}
      description={announcement ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
              {titleBadgeLabel}
            </span>
            {!announcement.isRead ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white">
                <span className="h-2 w-2 rounded-sm bg-cyan-100" />
                未读
              </span>
            ) : null}
            {announcement.isTop === 1 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                <Pin size={12} />
                置顶
              </span>
            ) : null}
            {headerBadges}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              <time>{formatAnnouncementRelativeWithDateTime(announcement.publishTime || announcement.createTime)}</time>
            </span>
            <span className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {announcement.isRead ? '已读' : '未读'}
            </span>
          </div>
          {extraInfo ? <div>{extraInfo}</div> : null}
        </div>
      ) : undefined}
      headerAside={<Info className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />}
      onClose={onClose}
      closeOnClickOutside
      maxWidthClassName={`w-full ${maxWidthClassName}`}
      bodyClassName="cf-announcement-scroll"
      zIndex={zIndex}
      footer={announcement ? (
        <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Info className="h-4 w-4" />
              <span>{announcement.isRead ? footerReadText : footerUnreadText}</span>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
              {!announcement.isRead && onMarkAsRead ? (
                <Button
                  onClick={() => void onMarkAsRead(announcement.announcementId)}
                >
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    标记已读
                  </span>
                </Button>
              ) : null}
            </div>
        </div>
      ) : undefined}
    >
      {announcement ? (
        <div className="border border-slate-200 bg-[var(--cf-surface-strong)] p-5 dark:border-slate-800 dark:bg-slate-950">
          <AnnouncementContent content={announcement.content} />
        </div>
      ) : null}
    </BaseDialog>
  );
};
