import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Inbox, Megaphone, RefreshCw, Shield } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AnnouncementDetailModal, AnnouncementListItem } from '@/components/common';
import { AnnouncementManageView } from '@/components/admin/announcements';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { AnnouncementScope, Role, type Announcement } from '@/types';
import {
  useAnnouncementStore,
  useAnnouncementUnreadCount,
} from '@/stores/announcementStore';
import { getAnnouncementPriorityMeta } from '@/utils/announcementMeta';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import '@/components/common/announcement-overlays.css';

type ViewMode = 'user' | 'manage';

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Inbox className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
);

export const AnnouncementPage = () => {
  const location = useLocation();
  const { user } = useAuth();
  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;

  const announcements = useAnnouncementStore((state) => state.announcements);
  const loading = useAnnouncementStore((state) => state.loading);
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const markAsRead = useAnnouncementStore((state) => state.markAsRead);
  const markAllAsRead = useAnnouncementStore((state) => state.markAllAsRead);
  const unreadCount = useAnnouncementUnreadCount();

  const [viewMode, setViewMode] = useState<ViewMode>(
    location.state?.viewMode === 'manage' && canManage ? 'manage' : 'user',
  );
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    if (viewMode === 'user') {
      void fetchAnnouncements(true);
    }
  }, [fetchAnnouncements, viewMode]);

  useEffect(() => {
    if (location.state?.viewMode === 'manage' && canManage) {
      setViewMode('manage');
      return;
    }

    if (location.state?.viewMode === 'user') {
      setViewMode('user');
    }
  }, [canManage, location.state]);

  const displayList = useMemo(() => {
    if (showUnreadOnly) {
      return announcements.filter((item) => !item.isRead);
    }

    return announcements;
  }, [announcements, showUnreadOnly]);

  const pinnedCount = useMemo(
    () => announcements.filter((item) => item.isTop === 1).length,
    [announcements],
  );
  const highPriorityCount = useMemo(
    () => announcements.filter((item) => item.priority === 'H').length,
    [announcements],
  );
  const latestAnnouncement = displayList[0] || announcements[0] || null;

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
    return <AnnouncementManageView onExitManage={() => setViewMode('user')} />;
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Megaphone className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Announcements
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          公告中心
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          统一查看已发布公告、未读状态和置顶内容，页面结构直接向参考后台列表页靠拢。
        </p>
      </div>

      <TablePageLayout
        className="gap-4"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              全部 {announcements.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              未读 {unreadCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              置顶 {pinnedCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              高优先级 {highPriorityCount}
            </span>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchAnnouncements(true)} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              {unreadCount > 0 ? (
                <Button size="sm" onClick={() => void handleMarkAllAsRead()}>
                  <CheckCheck size={14} className="mr-1.5" />
                  全部已读
                </Button>
              ) : null}
              {canManage ? (
                <Button variant="outline" size="sm" onClick={() => setViewMode('manage')}>
                  <Shield size={14} className="mr-1.5" />
                  公告管理
                </Button>
              ) : null}
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={showUnreadOnly ? 'outline' : 'secondary'}
                size="sm"
                onClick={() => setShowUnreadOnly(false)}
              >
                全部公告
              </Button>
              <Button
                variant={showUnreadOnly ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowUnreadOnly(true)}
              >
                <Bell size={14} className="mr-1.5" />
                仅看未读
              </Button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {latestAnnouncement
                ? `最近发布时间 ${formatAnnouncementRelativeWithDateTime(latestAnnouncement.publishTime || latestAnnouncement.createTime)}`
                : '暂无公告'}
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[36rem] flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">公告列表</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {showUnreadOnly ? '当前仅显示未读公告。' : '按发布时间倒序显示，置顶内容优先。'}
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  当前结果 {displayList.length} 条
                </div>
              </div>
            </div>

            {loading ? (
              <InlineState title="正在加载公告..." className="py-16" icon={<Bell className="h-4 w-4 animate-pulse" />} />
            ) : displayList.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
              <InlineState
                title={showUnreadOnly ? '暂无未读公告' : '暂无公告'}
                description={showUnreadOnly ? '当前公告都已处理完成。' : '新公告发布后会显示在这里。'}
                className="py-16"
              />
            )}
          </div>
        )}
      />

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onMarkAsRead={handleMarkAsReadAndClose}
        zIndexClassName="z-[110]"
        headerBadges={
          selectedAnnouncement ? (
            <>
              {selectedAnnouncement.isTop === 1 ? (
                <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                  置顶
                </span>
              ) : null}
              <span
                className={[
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  getAnnouncementPriorityMeta(selectedAnnouncement.priority).className,
                ].join(' ')}
              >
                {getAnnouncementPriorityMeta(selectedAnnouncement.priority).label}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {selectedAnnouncement.scopeType === AnnouncementScope.ALL ? '全员可见' : '定向发布'}
              </span>
            </>
          ) : null
        }
        extraInfo={
          selectedAnnouncement ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-950">
                发布时间：{formatAnnouncementRelativeWithDateTime(selectedAnnouncement.publishTime || selectedAnnouncement.createTime)}
              </span>
              {selectedAnnouncement.expireTime ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-950">
                  有效期至：{new Date(selectedAnnouncement.expireTime).toLocaleString()}
                </span>
              ) : null}
            </div>
          ) : null
        }
        footerReadText="该公告已阅读完成。"
        footerUnreadText="查看后将自动同步为已读状态。"
      />
    </div>
  );
};

export default AnnouncementPage;
