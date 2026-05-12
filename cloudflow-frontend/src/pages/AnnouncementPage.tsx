import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Inbox, RefreshCw, Shield } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AnnouncementManageView } from '@/components/admin/announcements';
import { AnnouncementDetailModal, AnnouncementListItem } from '@/components/common';
import '@/components/common/announcement-overlays.css';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { Button, SegmentedControl, SegmentedControlItem } from '@/components/common';
import {
  useAnnouncementStore,
  useAnnouncementUnreadCount,
} from '@/stores/announcementStore';
import { AnnouncementScope, Role, type Announcement } from '@/types';
import { getStoredAuthUser } from '@/utils/authStorage';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import { getAnnouncementPriorityMeta } from '@/utils/announcementMeta';

type ViewMode = 'user' | 'manage';

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div
    className={['flex flex-col items-center justify-center px-6 py-10 text-center', className]
      .filter(Boolean)
      .join(' ')}
  >
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Inbox className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

const getStoredUserRole = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    const rawUser = getStoredAuthUser();
    if (!rawUser) {
      return '';
    }

    const parsedUser = JSON.parse(rawUser) as { role?: string };
    return String(parsedUser.role || '').toUpperCase();
  } catch {
    return '';
  }
};

export const AnnouncementPage = () => {
  const location = useLocation();
  const userRole = useMemo(() => getStoredUserRole(), []);
  const canManage = userRole === Role.ADMIN || userRole === Role.HR;

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

  if (viewMode === 'manage' && canManage) {
    return <AnnouncementManageView onExitManage={() => setViewMode('user')} />;
  }

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <SegmentedControl className="min-h-9">
                <SegmentedControlItem
                  size="sm"
                  active={!showUnreadOnly}
                  onClick={() => setShowUnreadOnly(false)}
                >
                  全部公告
                </SegmentedControlItem>
                <SegmentedControlItem
                  size="sm"
                  active={showUnreadOnly}
                  onClick={() => setShowUnreadOnly(true)}
                >
                  仅看未读
                </SegmentedControlItem>
              </SegmentedControl>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {showUnreadOnly
                  ? `未读 ${displayList.length} 条`
                  : `共 ${announcements.length} 条${unreadCount > 0 ? `，未读 ${unreadCount} 条` : ''}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchAnnouncements(true)}
                disabled={loading}
              >
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
        table={(<TableSurfaceCard>
          <div className="flex min-h-[36rem] flex-col">
            {loading ? (
              <InlineState
                title="正在加载公告..."
                className="py-16"
                icon={<Bell className="h-4 w-4 animate-pulse" />}
              />
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
                description={showUnreadOnly ? '当前公告已全部处理完成。' : '新公告发布后会显示在这里。'}
                className="py-16"
              />
            )}
          </div>
        </TableSurfaceCard>)}
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
                发布时间：
                {formatAnnouncementRelativeWithDateTime(
                  selectedAnnouncement.publishTime || selectedAnnouncement.createTime,
                )}
              </span>
              {selectedAnnouncement.expireTime ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-950">
                  有效期至：
                  {new Date(selectedAnnouncement.expireTime).toLocaleString()}
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
