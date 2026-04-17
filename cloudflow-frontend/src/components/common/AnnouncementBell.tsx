import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Inbox, X } from 'lucide-react';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { AnnouncementListItem } from '@/components/common/AnnouncementListItem';
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
          className="cf-announcement-modal-overlay fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="cf-announcement-modal-panel w-full max-w-[620px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative overflow-hidden border-b border-gray-100/80 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 px-6 py-5">
              <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent" />

              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                      <Bell size={16} />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">公告</h2>
                  </div>
                  {unreadCount > 0 ? (
                    <p className="mt-2 text-sm text-gray-600">
                      <span className="font-medium text-blue-600">{unreadCount}</span>
                      {' '}未读
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleMarkAllAsRead()}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:shadow-xl disabled:opacity-50"
                    >
                      全部已读
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700"
                    aria-label="关闭公告弹层"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="relative">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
                    <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-blue-400/30" />
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
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200">
                      <Inbox size={28} className="text-gray-400" />
                    </div>
                    <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                      <Check size={14} />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-900">暂无公告</p>
                  <p className="mt-1 text-xs text-gray-500">新公告发布后会显示在这里</p>
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
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all hover:scale-105 hover:bg-gray-100 ${
          unreadCount > 0 ? 'text-blue-600' : ''
        }`}
        aria-label="公告"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        ) : null}
      </button>

      {modal}

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onMarkAsRead={handleMarkAsReadAndClose}
        zIndexClassName="z-[110]"
        footerReadText="已同步为已读状态"
        footerUnreadText="打开后会自动标记为已读"
      />
    </>
  );
};
