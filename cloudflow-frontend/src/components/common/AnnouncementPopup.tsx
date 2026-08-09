import React from 'react';
import { Bell, Check, Clock3 } from 'lucide-react';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button } from '@/components/common/button';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import './announcement-overlays.css';

export const AnnouncementPopup: React.FC = () => {
  const currentPopup = useAnnouncementStore((state) => state.currentPopup);
  const dismissPopup = useAnnouncementStore((state) => state.dismissPopup);

  return (
    <BaseDialog
      open={Boolean(currentPopup)}
      title={currentPopup?.title || '公告'}
      description={currentPopup ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-cf-subtle">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-cyan-600 px-2.5 py-1 font-medium text-white">
            <span className="h-2 w-2 rounded-sm bg-cyan-100" />
            未读
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4" />
            <time>{formatAnnouncementRelativeWithDateTime(currentPopup.publishTime || currentPopup.createTime)}</time>
          </span>
        </div>
      ) : undefined}
      headerAside={<Bell className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />}
      onClose={() => void dismissPopup()}
      hideCloseButton
      maxWidthClassName="w-full max-w-[680px]"
      bodyClassName="cf-announcement-scroll"
      zIndex={120}
      footer={(
        <Button onClick={() => void dismissPopup()}>
          <Check className="mr-2 h-4 w-4" />
          标记已读
        </Button>
      )}
    >
      {currentPopup ? (
        <div className="border border-slate-200 bg-[var(--cf-surface-strong)] p-5 dark:border-slate-800 dark:bg-slate-950">
          <AnnouncementContent content={currentPopup.content} />
        </div>
      ) : null}
    </BaseDialog>
  );
};
