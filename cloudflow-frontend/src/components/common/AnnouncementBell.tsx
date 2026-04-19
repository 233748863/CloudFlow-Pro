import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Inbox, X } from 'lucide-react';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { AnnouncementListItem } from '@/components/common/AnnouncementListItem';
import { Button } from '@/components/ui';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import type { Announcement } from '@/types';
import './announcement-overlays.css';

export const AnnouncementBell: React.FC = () => {
  const announcements = useAnnouncementStore((state) => state.announcements);
  const loading = useAnnouncementStore((state) => state.loading);
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const markAsRead = useAnnouncementStore((state) => state.markAsRead);
  const markAllAsRead = useAnnouncementStore((state) => state.markAllAsRead);
  const unreadCount = useAnnouncementUnreadCount();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void fetchAnnouncements(true);
  }, [fetchAnnouncements, isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedAnnouncement) {
          setSelectedAnnouncement(null);
          return;
        }

        setIsModalOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isModalOpen, selectedAnnouncement]);

  async function openDetail(announcement: Announcement) {
    const nextAnnouncement = announcement.isRead ? announcement : { ...announcement, isRead: true };
    setSelectedAnnouncement(nextAnnouncement);

    if (!announcement.isRead) {
      await markAsRead(announcement.announcementId);
    }
  }

  async function handleMarkAllAsRead() {
    await markAllAsRead();
    setSelectedAnnouncement((previous) => (previous ? { ...previous, isRead: true } : previous));
  }

  async function handleMarkAsReadAndClose(announcementId: number) {
    await markAsRead(announcementId);
    setSelectedAnnouncement(null);
  }

  const modal = isModalOpen
    ? createPortal(
        <div
          className="cf-announcement-modal-overlay fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 pt-[8vh] backdrop-blur-[2px]"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="cf-announcement-modal-panel w-full max-w-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/80"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-100 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700">
                      <Bell size={16} />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">公告</h2>
                  </div>
                  {unreadCount > 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      <span className="font-semibold text-cyan-700">{unreadCount}</span>
                      {' '}条未读
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {unreadCount > 0 ? (
                    <Button
                      size="sm"
                      className="h-8 rounded-lg px-3.5"
                      disabled={loading}
                      onClick={() => void handleMarkAllAsRead()}
                    >
                      全部已读
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setIsModalOpen(false)}
                    aria-label="关闭公告弹层"
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="relative">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" />
                    <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-cyan-300/30" />
                  </div>
                </div>
              ) : announcements.length > 0 ? (
                <div>
                  {announcements.map((item) => (
                    <AnnouncementListItem
                      key={item.announcementId}
                      announcement={item}
                      variant="compact"
                      onClick={() => void openDetail(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-4">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                      <Inbox size={28} className="text-slate-400" />
                    </div>
                    <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check size={14} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-900">暂无公告</p>
                  <p className="mt-1 text-xs text-slate-500">新公告发布后会显示在这里</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          unreadCount > 0
            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        }`}
        aria-label="公告"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        ) : null}
      </button>

      {modal}

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onMarkAsRead={handleMarkAsReadAndClose}
        zIndexClassName="z-[110]"
        footerReadText="当前公告已同步为已读状态"
        footerUnreadText="打开后会自动同步为已读状态"
      />
    </>
  );
};
