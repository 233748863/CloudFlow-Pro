import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ExternalLink, Inbox, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { BaseDialog } from '@/components/common/BaseDialog';
import { AnnouncementListItem } from '@/components/common/AnnouncementListItem';
import { Button, SegmentedControl, SegmentedControlItem } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import { Role, type Announcement } from '@/types';
import './announcement-overlays.css';

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

export const AnnouncementBell: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const announcements = useAnnouncementStore((state) => state.announcements);
  const loading = useAnnouncementStore((state) => state.loading);
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const markAsRead = useAnnouncementStore((state) => state.markAsRead);
  const markAllAsRead = useAnnouncementStore((state) => state.markAllAsRead);
  const unreadCount = useAnnouncementUnreadCount();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void fetchAnnouncements(true);
  }, [fetchAnnouncements, isModalOpen]);

  const displayList = useMemo(() => {
    if (showUnreadOnly) {
      return announcements.filter((item) => !item.isRead);
    }
    return announcements;
  }, [announcements, showUnreadOnly]);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          unreadCount > 0
            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200 dark:hover:bg-cyan-950/50'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900'
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

      <BaseDialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="公告"
        description="统一查看未读消息、标记已读并进入公告中心或管理端。"
        maxWidthClassName="max-w-[680px]"
        headerAside={
          <div className="flex flex-wrap gap-2">
            <span className={surfaceChipClassName}>总计 {announcements.length} 条</span>
            <span className={surfaceChipClassName}>未读 {unreadCount} 条</span>
          </div>
        }
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <SegmentedControl className="min-h-9">
                <SegmentedControlItem size="sm" active={!showUnreadOnly} onClick={() => setShowUnreadOnly(false)}>
                  全部公告
                </SegmentedControlItem>
                <SegmentedControlItem size="sm" active={showUnreadOnly} onClick={() => setShowUnreadOnly(true)}>
                  仅看未读
                </SegmentedControlItem>
              </SegmentedControl>
              {unreadCount > 0 ? (
                <Button size="sm" onClick={() => void handleMarkAllAsRead()} disabled={loading}>
                  <Check size={14} />
                  全部已读
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsModalOpen(false);
                  navigate('/announcement', { state: { viewMode: 'user' } });
                }}
              >
                <ExternalLink size={14} />
                公告中心
              </Button>
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsModalOpen(false);
                    navigate('/announcement', { state: { viewMode: 'manage' } });
                  }}
                >
                  <Settings2 size={14} />
                  管理端
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">顶部公告入口</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  顶部铃铛入口现在和公告中心共享同一套阅读状态与跳转语法，不再只是一个孤立弹层。
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={surfaceChipClassName}>{showUnreadOnly ? '仅看未读' : '默认视图'}</span>
                {canManage ? <span className={surfaceChipClassName}>支持进入管理端</span> : null}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            {loading ? (
              <div className="px-4 py-14">
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Bell size={16} className="animate-pulse" />
                  正在加载公告...
                </div>
              </div>
            ) : displayList.length > 0 ? (
              <div className="max-h-[58vh] overflow-y-auto">
                {displayList.map((item, index) => (
                  <AnnouncementListItem
                    key={item.announcementId}
                    announcement={item}
                    variant="compact"
                    onClick={() => void openDetail(item)}
                    className={index === displayList.length - 1 ? 'border-b-0' : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative mb-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                    <Inbox size={28} className="text-slate-400 dark:text-slate-500" />
                  </div>
                  <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check size={14} />
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {showUnreadOnly ? '暂无未读公告' : '暂无公告'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {showUnreadOnly ? '当前公告都已处理完成。' : '新公告发布后会显示在这里。'}
                </p>
              </div>
            )}
          </div>
        </div>
      </BaseDialog>

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onMarkAsRead={handleMarkAsReadAndClose}
        zIndexClassName="z-[110]"
        footerReadText="当前公告已同步为已读状态。"
        footerUnreadText="打开后会自动同步为已读状态。"
      />
    </>
  );
};
