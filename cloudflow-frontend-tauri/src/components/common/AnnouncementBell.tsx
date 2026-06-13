import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, ChevronRight, Inbox, Info, X } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import type { Announcement } from '@/types';
import { formatAnnouncementRelativeTime } from '@/utils/announcementFormat';
import { lockBodyScroll } from '@/utils/bodyScrollLock';
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
      if (event.key === 'Escape' && !selectedAnnouncement) {
        setIsModalOpen(false);
      }
    };

    const unlockBodyScroll = lockBodyScroll();
    window.addEventListener('keydown', handleEscape);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isModalOpen, selectedAnnouncement]);

  function openModal() {
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  async function openDetail(announcement: Announcement) {
    const nextAnnouncement = announcement.isRead ? announcement : { ...announcement, isRead: true };
    setSelectedAnnouncement(nextAnnouncement);

    if (!announcement.isRead) {
      await markAsRead(announcement.announcementId);
    }
  }

  function closeDetail() {
    setSelectedAnnouncement(null);
  }

  async function markAsReadAndClose(announcementId: number) {
    await markAsRead(announcementId);
    closeDetail();
  }

  async function handleMarkAllAsRead() {
    try {
      await markAllAsRead();
      toast.success('所有公告已标记为已读');
      setSelectedAnnouncement((previous) => (previous ? { ...previous, isRead: true } : previous));
    } catch (error) {
      toast.error(getErrorMessage(error, '标记公告已读失败'));
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openModal}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all hover:scale-105 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 ${
          unreadCount > 0 ? 'text-blue-600 dark:text-blue-400' : ''
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

      {isModalOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="cf-announcement-layer fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
            onClick={closeModal}
          >
            <div
              className="cf-announcement-panel w-full max-w-[620px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-950 dark:ring-slate-700/70"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative overflow-hidden border-b border-gray-100/80 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 px-6 py-5 dark:border-slate-800 dark:from-blue-950/25 dark:to-slate-950">
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                        <Bell size={16} />
                      </div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        公告
                      </h2>
                    </div>
                    {unreadCount > 0 ? (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-blue-600 dark:text-blue-400">{unreadCount}</span>
                        <span className="ml-1">未读</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllAsRead()}
                        disabled={loading}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:shadow-xl disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        全部已读
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label="关闭"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent dark:from-indigo-900/10" />
              </div>

              <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="relative">
                      <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400" />
                      <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-blue-400/30" />
                    </div>
                  </div>
                ) : announcements.length > 0 ? (
                  <div>
                    {announcements.map((item) => (
                      <div
                        key={item.announcementId}
                        className={`group relative flex min-h-[72px] items-center gap-4 border-b border-gray-100 px-6 py-4 transition-all hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-900/70 ${
                          !item.isRead ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''
                        }`}
                        onClick={() => void openDetail(item)}
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                          {!item.isRead ? (
                            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-blue-400 opacity-75" />
                              <Info className="relative z-10 h-5 w-5" strokeWidth={2.5} />
                            </div>
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-slate-900 dark:text-slate-500">
                              <Check className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {item.title}
                            </h3>
                            <div className="mt-1 flex items-center gap-2">
                              <time className="text-xs text-gray-500 dark:text-gray-400">
                                {formatAnnouncementRelativeTime(item.publishTime || item.createTime)}
                              </time>
                              {!item.isRead ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
                                  </span>
                                  未读
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 dark:text-gray-600" />
                          </div>
                        </div>

                        {!item.isRead ? (
                          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="relative mb-4">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900">
                        <Inbox size={28} className="text-gray-400 dark:text-gray-500" />
                      </div>
                      <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">暂无公告</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">暂时没有任何系统公告</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={closeDetail}
        onMarkAsRead={markAsReadAndClose}
        zIndexClassName="z-[110]"
      />
    </div>
  );
};
