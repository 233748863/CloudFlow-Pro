import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Inbox, Megaphone, Shield } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  AnnouncementDetailModal,
  AnnouncementListItem,
} from '@/components/common';
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

  const listTitle = showUnreadOnly ? '未读公告' : '全部公告';
  const heroDescription = showUnreadOnly
    ? '当前仅聚焦未读内容，便于快速处理新消息。'
    : '按发布时间查看全部公告，置顶和高优先级内容优先可见。';
  const heroMetrics = [
    {
      label: '公告总量',
      value: `${announcements.length} 条`,
      hint: showUnreadOnly ? `${displayList.length} 条待处理` : `高优先级 ${highPriorityCount} 条`,
      panelClassName: 'border-slate-200/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(248,250,252,0.78))] shadow-[0_16px_32px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.72)]',
      iconWrapClassName: 'bg-white/82 text-slate-700 ring-1 ring-slate-200/85 shadow-[0_10px_22px_rgba(15,23,42,0.06)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-500',
      glowClassName: 'from-slate-100/95 via-slate-50/40 to-transparent',
      icon: <Megaphone size={17} />,
    },
    {
      label: '未读公告',
      value: `${unreadCount} 条`,
      hint: unreadCount > 0 ? '建议优先处理最新消息' : '当前没有待处理公告',
      panelClassName: 'border-cyan-100/80 bg-[linear-gradient(135deg,rgba(236,254,255,0.96),rgba(255,255,255,0.82),rgba(240,249,255,0.8))] shadow-[0_16px_32px_rgba(14,165,233,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-cyan-600 ring-1 ring-cyan-100 shadow-[0_10px_22px_rgba(14,165,233,0.08)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-600',
      glowClassName: 'from-cyan-100/90 via-sky-50/45 to-transparent',
      icon: <Bell size={17} />,
    },
    {
      label: '已读进度',
      value: `${readRate}%`,
      hint: `${readCount} 条已完成阅读确认`,
      panelClassName: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.82),rgba(236,254,255,0.78))] shadow-[0_16px_32px_rgba(16,185,129,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-emerald-600 ring-1 ring-emerald-100 shadow-[0_10px_22px_rgba(16,185,129,0.08)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-600',
      glowClassName: 'from-emerald-100/90 via-cyan-50/45 to-transparent',
      icon: <CheckCheck size={17} />,
    },
    {
      label: '置顶与优先级',
      value: `${pinnedCount} / ${highPriorityCount}`,
      hint: latestAnnouncement?.title || '等待新的公告内容',
      panelClassName: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.82),rgba(255,247,237,0.82))] shadow-[0_16px_32px_rgba(245,158,11,0.08),inset_0_1px_0_rgba(255,255,255,0.75)]',
      iconWrapClassName: 'bg-white/88 text-amber-700 ring-1 ring-amber-100 shadow-[0_10px_22px_rgba(245,158,11,0.08)]',
      valueClassName: 'text-slate-950',
      hintClassName: 'text-slate-600',
      glowClassName: 'from-amber-100/90 via-orange-50/45 to-transparent',
      icon: <Shield size={17} />,
    },
  ];

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
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-700 ring-1 ring-cyan-100">
                <Megaphone size={14} />
                公告中心
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
                共 {announcements.length} 条
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
                {showUnreadOnly ? '仅看未读' : '默认视图'}
              </span>
            </div>
          )}
          title="公告工作台"
          description={heroDescription}
          actions={(
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
                <Button
                  size="lg"
                  onClick={() => void handleMarkAllAsRead()}
                >
                  <CheckCheck size={16} className="mr-2" />
                  全部已读
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setViewMode('manage')}
                >
                  <Shield size={16} className="mr-2" />
                  公告管理
                </Button>
              ) : null}
            </div>
          )}
          metrics={heroMetrics}
          contentClassName="p-3.5 sm:p-4"
          glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_55%),radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_46%)]"
        />

        <WorkspaceSectionCard
          eyebrow="公告列表"
          title={listTitle}
          headerAside={(
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                共 {displayList.length} 条
              </span>
              {latestAnnouncement ? (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                  最新: {formatAnnouncementRelativeWithDateTime(latestAnnouncement.publishTime || latestAnnouncement.createTime)}
                </span>
              ) : null}
            </div>
          )}
          className={`${workspaceGlassSurfaceClassName} space-y-0`}
          bodyClassName="space-y-2.5"
        >
          <div className="rounded-[20px] border border-slate-100 bg-white/90 p-3.5 shadow-sm">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {showUnreadOnly ? '仅显示未读' : '显示全部'}
                </span>
                <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                  未读 {unreadCount} 条
                </span>
                {canManage ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    支持切换管理页
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

          <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-sm">
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
        headerBadges={selectedAnnouncement ? (
          <>
            {selectedAnnouncement.isTop === 1 ? (
              <span className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600">
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
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
              {selectedAnnouncement.scopeType === AnnouncementScope.ALL ? '全员' : '定向'}
            </span>
          </>
        ) : null}
        extraInfo={selectedAnnouncement ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              发布时间：{formatAnnouncementRelativeWithDateTime(selectedAnnouncement.publishTime || selectedAnnouncement.createTime)}
            </span>
            {selectedAnnouncement.expireTime ? (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                有效期至：{new Date(selectedAnnouncement.expireTime).toLocaleString()}
              </span>
            ) : null}
          </div>
        ) : null}
        footerReadText="已阅读此公告"
        footerUnreadText="可在此页完成阅读确认"
      />
    </div>
  );
};

export default AnnouncementPage;
