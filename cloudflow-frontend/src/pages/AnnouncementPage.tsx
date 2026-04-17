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
  WorkspaceInlineState,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
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
        <div className="relative z-10 p-6">
          <div className="mx-auto max-w-[1320px]">
            <AnnouncementManageView onExitManage={() => setViewMode('user')} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-6 p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_320px]">
          <WorkspaceHeroCard
            badge={(
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1.5 text-cyan-700 ring-1 ring-cyan-100">
                  <Megaphone size={14} />
                  公告中心
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
                  共 {announcements.length} 条
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
                  已读率 {readRate}%
                </span>
              </div>
            )}
            title="公告工作台"
            description={heroDescription}
            actions={(
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={showUnreadOnly ? 'soft' : 'outline'}
                  size="xl"
                  className={cn(
                    showUnreadOnly && 'border-cyan-200',
                  )}
                  onClick={() => setShowUnreadOnly((previous) => !previous)}
                >
                  <Bell size={16} className="mr-2" />
                  {showUnreadOnly ? '显示全部' : '仅看未读'}
                </Button>
                {unreadCount > 0 ? (
                  <Button
                    size="xl"
                    onClick={() => void handleMarkAllAsRead()}
                  >
                    <CheckCheck size={16} className="mr-2" />
                    全部已读
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    variant="outline"
                    size="xl"
                    onClick={() => setViewMode('manage')}
                  >
                    <Shield size={16} className="mr-2" />
                    公告管理
                  </Button>
                ) : null}
              </div>
            )}
            contentClassName="p-6 sm:p-7"
            glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_52%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.14),transparent_42%)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                <Bell size={13} />
                阅读状态
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-700">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">未读</span>
                <span>{unreadCount} 条</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">已读</span>
                <span>{readCount} 条</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] opacity-70">置顶</span>
                <span>{pinnedCount} 条</span>
              </span>
            </div>
          </WorkspaceHeroCard>

          <WorkspaceSectionCard
            eyebrow="当前概览"
            title="阅读态势"
            headerAside={(
              <div className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                {canManage ? '含管理入口' : '员工视图'}
              </div>
            )}
            className="rounded-[30px]"
            bodyClassName="space-y-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-slate-100 bg-slate-50/75 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前视图</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{listTitle}</div>
                  <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
                    {showUnreadOnly ? '未读筛选' : '默认视图'}
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-100 bg-slate-50/75 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">高优先级</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{highPriorityCount} 条</div>
                  <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    优先处理
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-100 bg-slate-50/75 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">列表范围</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{displayList.length} 条</div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    当前可见
                  </span>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-100 bg-slate-50/75 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">最新更新</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {latestAnnouncement?.title || '暂无公告'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {latestAnnouncement
                    ? formatAnnouncementRelativeWithDateTime(
                        latestAnnouncement.publishTime || latestAnnouncement.createTime,
                      )
                    : '等待新消息'}
                </div>
              </div>
            </div>
          </WorkspaceSectionCard>
        </div>

        <WorkspaceSectionCard
          eyebrow="公告列表"
          title={listTitle}
          headerAside={(
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                共 {displayList.length} 条
              </span>
              {latestAnnouncement ? (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                  最新: {formatAnnouncementRelativeWithDateTime(latestAnnouncement.publishTime || latestAnnouncement.createTime)}
                </span>
              ) : null}
            </div>
          )}
          className="rounded-[32px]"
          bodyClassName="space-y-4"
        >
          <div className="rounded-[24px] border border-slate-100 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {showUnreadOnly ? '仅显示未读' : '显示全部'}
                </span>
                <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-cyan-700">
                  未读 {unreadCount} 条
                </span>
                {canManage ? (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
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

          <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
            {loading ? (
              <WorkspaceInlineState type="loading" title="正在加载公告..." className="m-4 py-14" />
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
              <div className="p-4">
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
      </div>

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
