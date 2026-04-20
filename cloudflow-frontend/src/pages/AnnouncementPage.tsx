import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Inbox, Megaphone, Shield } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui';
import { AnnouncementDetailModal, AnnouncementListItem } from '@/components/common';
import { AnnouncementManageView } from '@/components/admin/announcements';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspaceSectionCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';
import { useAuth } from '@/context/AuthContext';
import { AnnouncementScope, Role, type Announcement } from '@/types';
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
  const readCount = announcements.length - unreadCount;
  const readRate = announcements.length > 0 ? Math.round((readCount / announcements.length) * 100) : 100;
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
    return (
      <div className="relative min-h-screen pb-6">
        <WorkspaceBackdrop />
        <WorkspacePageContent className="p-4 sm:p-5">
          <div className="mx-auto max-w-[1320px]">
            <AnnouncementManageView onExitManage={() => setViewMode('user')} />
          </div>
        </WorkspacePageContent>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <Megaphone size={14} />
                公告中心
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                共 {announcements.length} 条
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {showUnreadOnly ? '仅看未读' : '默认视图'}
              </span>
            </div>
          }
          title="公告工作台"
          description={
            showUnreadOnly
              ? '当前仅聚焦未读内容，便于快速处理新消息。'
              : '按发布时间查看全部公告，置顶和高优先级内容优先可见。'
          }
          actions={
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                variant={showUnreadOnly ? 'soft' : 'outline'}
                size="lg"
                className={cn(showUnreadOnly && 'border-cyan-200')}
                onClick={() => setShowUnreadOnly((previous) => !previous)}
              >
                <Bell size={16} className="mr-2" />
                {showUnreadOnly ? '显示全部' : '仅看未读'}
              </Button>
              {unreadCount > 0 ? (
                <Button size="lg" onClick={() => void handleMarkAllAsRead()}>
                  <CheckCheck size={16} className="mr-2" />
                  全部已读
                </Button>
              ) : null}
              {canManage ? (
                <Button variant="outline" size="lg" onClick={() => setViewMode('manage')}>
                  <Shield size={16} className="mr-2" />
                  公告管理
                </Button>
              ) : null}
            </div>
          }
          metrics={[
            {
              label: '公告总量',
              value: `${announcements.length} 条`,
              hint: showUnreadOnly ? `${displayList.length} 条待处理` : `高优先级 ${highPriorityCount} 条`,
              icon: <Megaphone size={17} />,
            },
            {
              label: '未读公告',
              value: `${unreadCount} 条`,
              hint: unreadCount > 0 ? '建议优先处理最新消息' : '当前没有待处理公告',
              icon: <Bell size={17} />,
            },
            {
              label: '已读进度',
              value: `${readRate}%`,
              hint: `${readCount} 条已完成阅读确认`,
              icon: <CheckCheck size={17} />,
            },
            {
              label: '置顶 / 高优先级',
              value: `${pinnedCount} / ${highPriorityCount}`,
              hint: latestAnnouncement?.title || '等待新的公告内容',
              icon: <Shield size={17} />,
            },
          ]}
          contentClassName="p-4 sm:p-5"
        />

        <WorkspaceSectionCard
          eyebrow="公告列表"
          title={showUnreadOnly ? '未读公告' : '全部公告'}
          headerAside={
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                共 {displayList.length} 条
              </span>
              {latestAnnouncement ? (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  最新：{formatAnnouncementRelativeWithDateTime(latestAnnouncement.publishTime || latestAnnouncement.createTime)}
                </span>
              ) : null}
            </div>
          }
          className={`${workspaceGlassSurfaceClassName} space-y-0`}
          bodyClassName="space-y-2.5"
        >
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
                  {showUnreadOnly ? '当前仅显示未读' : '当前显示全部'}
                </span>
                <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                  未读 {unreadCount} 条
                </span>
                {canManage ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 dark:border-slate-800 dark:bg-slate-950">
                    支持切换管理视图
                  </span>
                ) : null}
              </div>

              {showUnreadOnly && announcements.length > displayList.length ? (
                <Button variant="outline" onClick={() => setShowUnreadOnly(false)}>
                  查看全部公告
                </Button>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            {loading ? (
              <WorkspaceInlineState type="loading" title="正在加载公告..." className="m-3.5 py-12" />
            ) : displayList.length > 0 ? (
              <div>
                {displayList.map((item, index) => (
                  <AnnouncementListItem
                    key={item.announcementId}
                    announcement={item}
                    variant="compact"
                    onClick={() => void openDetail(item)}
                    className={cn(index === displayList.length - 1 && 'border-b-0')}
                  />
                ))}
              </div>
            ) : (
              <div className="p-3.5">
                <WorkspaceEmptyPanel
                  variant="glass"
                  icon={<Inbox size={26} />}
                  title={showUnreadOnly ? '暂无未读公告' : '暂无公告'}
                  description={showUnreadOnly ? '当前公告都已处理完成。' : '暂时没有新的系统公告。'}
                />
              </div>
            )}
          </div>
        </WorkspaceSectionCard>
      </WorkspacePageContent>

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
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  getAnnouncementPriorityMeta(selectedAnnouncement.priority).className,
                )}
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
