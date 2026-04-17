import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, Inbox, Megaphone, Shield } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  AnnouncementDetailModal,
  AnnouncementListItem,
} from '@/components/common';
import { AnnouncementManageView } from '@/components/admin/announcements';
import { useAuth } from '../context/AuthContext';
import { AnnouncementScope, Role, type Announcement } from '../types';
import {
  useAnnouncementStore,
  useAnnouncementUnreadCount,
} from '@/stores/announcementStore';
import { cn } from '@/utils/cn';
import { getAnnouncementPriorityMeta } from '@/utils/announcementMeta';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import '@/components/common/announcement-overlays.css';

type ViewMode = 'user' | 'manage';

export const AnnouncementPage = () => {
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;

  const announcements = useAnnouncementStore((state) => state.announcements);
  const loading = useAnnouncementStore((state) => state.loading);
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const markAsRead = useAnnouncementStore((state) => state.markAsRead);
  const markAllAsRead = useAnnouncementStore((state) => state.markAllAsRead);
  const unreadCount = useAnnouncementUnreadCount();

  const [viewMode, setViewMode] = useState<ViewMode>('user');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    if (viewMode === 'user') {
      void fetchAnnouncements(true);
    }
  }, [fetchAnnouncements, viewMode]);

  const displayList = useMemo(() => {
    if (showUnreadOnly) {
      return announcements.filter((item) => !item.isRead);
    }
    return announcements;
  }, [announcements, showUnreadOnly]);

  const listTitle = showUnreadOnly ? '未读公告' : '全部公告';
  const listDescription = showUnreadOnly
    ? '仅显示未读内容，帮助你优先处理新消息。'
    : '查看全部系统公告，置顶和高优先级内容会优先展示。';

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

  if (!user) {
    return null;
  }

  if (viewMode === 'manage' && canManage) {
    return (
      <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_38%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-6">
        <div className="mx-auto max-w-[1180px]">
          <AnnouncementManageView onExitManage={() => setViewMode('user')} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_36%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="relative overflow-hidden border-b border-gray-100/80 bg-gradient-to-br from-blue-50/60 to-indigo-50/30 px-6 py-5 sm:px-8">
            <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent" />

            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">公告</h1>
                    <p className="mt-1 text-sm text-gray-600">查看系统公告</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 font-medium text-blue-600 ring-1 ring-blue-100">
                    {unreadCount > 0 ? `有 ${unreadCount} 条新公告` : '当前没有未读公告'}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 text-gray-500 ring-1 ring-gray-200/80">
                    共 {announcements.length} 条公告
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnreadOnly((previous) => !previous)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                    showUnreadOnly
                      ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {showUnreadOnly ? <Check size={16} /> : null}
                  仅显示未读
                </button>

                {unreadCount > 0 ? (
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl bg-white/85"
                    onClick={() => void handleMarkAllAsRead()}
                  >
                    <CheckCheck size={16} className="mr-2" />
                    全部已读
                  </Button>
                ) : null}

                {canManage ? (
                  <Button className="h-10 rounded-xl" onClick={() => setViewMode('manage')}>
                    <Shield size={16} className="mr-2" />
                    公告管理
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-b border-gray-100 bg-white px-6 py-4 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{listTitle}</h2>
                <p className="mt-1 text-sm text-gray-500">{listDescription}</p>
              </div>

              {showUnreadOnly && announcements.length > displayList.length ? (
                <button
                  type="button"
                  onClick={() => setShowUnreadOnly(false)}
                  className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                >
                  查看全部公告
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="relative">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
                  <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-blue-400/30" />
                </div>
              </div>
            ) : displayList.length > 0 ? (
              <div>
                {displayList.map((item) => (
                  <AnnouncementListItem
                    key={item.announcementId}
                    announcement={item}
                    variant="compact"
                    onClick={() => void openDetail(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16">
                <div className="relative mb-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200">
                    <Inbox size={28} className="text-gray-400" />
                  </div>
                  <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                    <Check size={14} />
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {showUnreadOnly ? '暂无未读公告' : '暂无公告'}
                </p>
                <p className="mt-1 text-center text-xs text-gray-500">
                  {showUnreadOnly ? '当前所有公告都已经处理完成。' : '暂时没有任何系统公告。'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onMarkAsRead={handleMarkAsReadAndClose}
        zIndexClassName="z-[110]"
        headerBadges={selectedAnnouncement ? (
          <>
            {selectedAnnouncement.isTop === 1 ? (
              <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-100">
                置顶
              </span>
            ) : null}
            <span
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium',
                getAnnouncementPriorityMeta(selectedAnnouncement.priority).className,
              )}
            >
              {getAnnouncementPriorityMeta(selectedAnnouncement.priority).label}
            </span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {selectedAnnouncement.scopeType === AnnouncementScope.ALL ? '全员' : '定向'}
            </span>
          </>
        ) : null}
        extraInfo={selectedAnnouncement ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-white/75 px-3 py-1 ring-1 ring-white/80">
              发布时间：{formatAnnouncementRelativeWithDateTime(selectedAnnouncement.publishTime || selectedAnnouncement.createTime)}
            </span>
            {selectedAnnouncement.expireTime ? (
              <span className="rounded-full bg-white/75 px-3 py-1 ring-1 ring-white/80">
                有效期至：{new Date(selectedAnnouncement.expireTime).toLocaleString()}
              </span>
            ) : null}
          </div>
        ) : null}
        footerReadText="您已阅读此公告"
        footerUnreadText="点击“已读”标记此公告"
      />
    </div>
  );
};

export default AnnouncementPage;
