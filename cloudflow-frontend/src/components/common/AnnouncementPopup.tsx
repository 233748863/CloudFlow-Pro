import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Clock3 } from 'lucide-react';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { Button } from '@/components/ui';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [currentPopup, dismissPopup]);

  if (!currentPopup || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="cf-announcement-popup-overlay fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/32 p-4 pt-[8vh]">
      <div className="cf-announcement-popup-panel w-full max-w-[680px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-white px-6 py-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-50 text-cyan-700">
              <Bell size={18} />
            </div>
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
              未读
            </span>
          </div>

          <h2 className="mb-2 text-2xl font-semibold leading-tight text-slate-900">
            {currentPopup.title}
          </h2>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-500">
            <Clock3 size={16} />
            <time>{formatAnnouncementRelativeWithDateTime(currentPopup.publishTime || currentPopup.createTime)}</time>
          </div>
        </div>

        <div className="cf-announcement-scroll max-h-[50vh] overflow-y-auto bg-slate-50 px-6 py-6">
          <div className="relative">
            <div className="absolute bottom-0 left-0 top-0 w-1 rounded-full bg-cyan-500" />
            <div className="pl-5">
              <AnnouncementContent content={currentPopup.content} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-6 py-5">
          <div className="flex items-center justify-end">
            <Button onClick={() => void dismissPopup()} className="rounded-xl px-6">
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
