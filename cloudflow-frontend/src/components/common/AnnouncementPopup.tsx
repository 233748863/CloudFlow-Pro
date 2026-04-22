import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Clock3 } from 'lucide-react';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { Button } from '@/components/ui';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import { lockBodyScroll } from '@/utils/bodyScrollLock';
import './announcement-overlays.css';

export const AnnouncementPopup: React.FC = () => {
  const currentPopup = useAnnouncementStore((state) => state.currentPopup);
  const dismissPopup = useAnnouncementStore((state) => state.dismissPopup);

  useEffect(() => {
    if (!currentPopup) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void dismissPopup();
      }
    };

    const unlockBodyScroll = lockBodyScroll();
    window.addEventListener('keydown', handleEscape);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleEscape);
    };
  }, [currentPopup, dismissPopup]);

  if (!currentPopup || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="cf-announcement-popup-overlay fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-[8vh] backdrop-blur-[3px]">
      <div className="cf-announcement-popup-panel w-full max-w-[680px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800/80 dark:shadow-[0_28px_56px_rgba(2,6,23,0.56)]">
        <div className="border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              <Bell size={18} />
            </div>
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
              未读
            </span>
          </div>

          <h2 className="mb-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
            {currentPopup.title}
          </h2>

          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
            <Clock3 size={16} />
            <time>{formatAnnouncementRelativeWithDateTime(currentPopup.publishTime || currentPopup.createTime)}</time>
          </div>
        </div>

        <div className="cf-announcement-scroll max-h-[50vh] overflow-y-auto bg-white px-5 py-5 dark:bg-slate-950">
          <div className="relative">
            <div className="absolute bottom-0 left-0 top-0 w-0.5 rounded-full bg-cyan-500 dark:bg-cyan-400" />
            <div className="pl-5">
              <AnnouncementContent content={currentPopup.content} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-center justify-end">
            <Button onClick={() => void dismissPopup()} className="rounded-lg px-5">
              <span className="flex items-center gap-2">
                <Check size={16} />
                标记已读
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
