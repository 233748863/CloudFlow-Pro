import React, { useEffect, useState } from 'react';
import { Bell, Check, ChevronRight, Inbox, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import type { Announcement } from '@/types';
import { formatAnnouncementRelativeTime } from '@/utils/announcementFormat';
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

    window.addEventListener('keydown', handleEscape);

    return () => {
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
        className={`relative flex h-9 w-9 items-center justify-center rounded-md text-cf-muted transition-colors hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-800 ${
 unreadCount > 0 ? 'text-cyan-600 dark:text-cyan-400' : ''
 }`}
        aria-label="公告"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-sm bg-red-500" />
        ) : null}
      </button>

      <BaseDialog
        open={isModalOpen}
        title="公告"
        description={unreadCount > 0 ? `${unreadCount} 条未读` : undefined}
        onClose={closeModal}
        closeOnEscape={false}
        maxWidthClassName="w-full max-w-[620px]"
        bodyClassName="p-0 !overflow-hidden"
        headerAside={(
          <>
            <Bell size={16} className="text-cyan-600 dark:text-cyan-300" />
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => void handleMarkAllAsRead()}
                disabled={loading}
                className="rounded-md bg-cyan-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50 dark:bg-cyan-500 dark:hover:bg-cyan-600"
              >
                全部已读
              </button>
            ) : null}
          </>
        )}
        zIndex={100}
      >
              <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-600 dark:text-cyan-300" />
                  </div>
                ) : announcements.length > 0 ? (
                  <div>
                    {announcements.map((item) => (
                      <div
                        key={item.announcementId}
                        className={`group relative flex min-h-[72px] items-center gap-4 border-b border-slate-200 px-6 py-4 transition-colors hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:hover:bg-slate-900/70 ${
 !item.isRead ? 'bg-cyan-50/30 dark:bg-cyan-950/10' : ''
 }`}
                        onClick={() => void openDetail(item)}
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                          {!item.isRead ? (
                            <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-cyan-600 text-white">
                              <Info className="h-5 w-5" strokeWidth={2.5} />
                            </div>
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-cf-faint dark:bg-slate-900">
                              <Check className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-medium text-cf-title">
                              {item.title}
                            </h3>
                            <div className="mt-1 flex items-center gap-2">
                              <time className="text-xs text-cf-subtle">
                                {formatAnnouncementRelativeTime(item.publishTime || item.createTime)}
                              </time>
                              {!item.isRead ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-cyan-100 px-1.5 py-0.5 text-xs font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
                                  <span className="h-1.5 w-1.5 rounded-sm bg-cyan-600" />
                                  未读
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <ChevronRight className="h-5 w-5 text-cf-faint transition-transform group-hover:translate-x-1" />
                          </div>
                        </div>

                        {!item.isRead ? (
                          <div className="absolute left-0 top-0 h-full w-1 bg-cyan-600" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="relative mb-4">
                      <div className="flex h-20 w-20 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
                        <Inbox size={28} className="text-cf-faint" />
                      </div>
                      <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-md bg-cyan-600 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-cf-title">暂无公告</p>
                    <p className="mt-1 text-xs text-cf-subtle">暂时没有任何系统公告</p>
                  </div>
                )}
              </div>
      </BaseDialog>

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={closeDetail}
        onMarkAsRead={markAsReadAndClose}
        zIndexClassName="z-[110]"
      />
    </div>
  );
};
