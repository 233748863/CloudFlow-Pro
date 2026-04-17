import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check } from 'lucide-react';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { useAnnouncementStore } from '@/stores/announcementStore';

function formatPopupTime(value?: string) {
  if (!value) {
    return '刚刚';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

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
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md">
      <div className="w-full max-w-[680px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="relative overflow-hidden border-b border-amber-100/80 bg-gradient-to-br from-amber-50/80 via-orange-50/50 to-yellow-50/30 px-8 py-6">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-orange-100/30 to-transparent" />

          <div className="relative z-10">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30">
                <Bell size={18} />
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-2.5 py-1 text-xs font-medium text-white shadow-lg shadow-amber-500/30">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                未读公告
              </span>
            </div>

            <h2 className="mb-2 text-2xl font-bold leading-tight text-slate-900">
              {currentPopup.title}
            </h2>

            <div className="text-sm text-slate-600">
              {formatPopupTime(currentPopup.publishTime || currentPopup.createTime)}
            </div>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto bg-white px-8 py-8">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-amber-500 via-orange-500 to-yellow-500" />
            <div className="pl-6">
              <AnnouncementContent content={currentPopup.content} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void dismissPopup()}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.02] hover:shadow-xl"
            >
              <span className="flex items-center gap-2">
                <Check size={16} />
                标记已读
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

