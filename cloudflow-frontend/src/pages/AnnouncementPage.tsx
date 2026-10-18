import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Filter, Inbox, RefreshCw, Shield } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AnnouncementManageView } from '@/components/admin/announcements';
import { AnnouncementDetailModal, AnnouncementListItem } from '@/components/common';
import '@/components/common/announcement-overlays.css';
import { Button, Pagination } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import {
  useAnnouncementStore,
  useAnnouncementUnreadCount,
} from '@/stores/announcementStore';
import { AnnouncementScope, type Announcement } from '@/types';
import { formatAnnouncementRelativeWithDateTime } from '@/utils/announcementFormat';
import { useAnnouncementPriorityMeta } from '@/utils/announcementMeta';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';

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
    <div className="admin-source-stat-icon mb-3">
      {icon || <Inbox className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-cf-subtle">
        {description}
      </div>
    ) : null}
  </div>
);

export const AnnouncementPage = () => {
  const mobile = useBreakpoint() === 'mobile';
  const location = useLocation();
  const { hasPermission } = useAuth();
  const getAnnouncementPriorityMeta = useAnnouncementPriorityMeta();
  const canManage = useMemo(
    () => hasPermission(['oa:announcement:manage', 'oa:announcement:publish', 'oa:announcement:edit']),
    [hasPermission],
  );

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterOpen, setFilterOpen] = useState(false);
  const [unreadDraft, setUnreadDraft] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  useEffect(() => { if (!mobile) setFilterOpen(false); }, [mobile]);

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
  const lastPage = Math.max(1, Math.ceil(displayList.length / pageSize));
  const currentPage = Math.min(page, lastPage);
  const pageList = displayList.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setPage(1); }, [showUnreadOnly]);
  useEffect(() => { if (page !== currentPage) setPage(currentPage); }, [currentPage, page]);

  const stats = useMemo(
    () => [
      {
        label: '公告总数',
        value: String(announcements.length),
        meta: showUnreadOnly ? '当前仅看未读' : '全部公告',
        icon: <Bell size={18} />,
        tone: 'blue',
      },
      {
        label: '未读公告',
        value: String(unreadCount),
        meta: '待处理',
        icon: <Inbox size={18} />,
        tone: 'amber',
      },
      {
        label: '已读公告',
        value: String(Math.max(announcements.length - unreadCount, 0)),
        meta: '阅读完成',
        icon: <CheckCheck size={18} />,
        tone: 'green',
      },
      {
        label: '管理权限',
        value: canManage ? '可管理' : '只读',
        meta: canManage ? '发布与维护' : '个人公告',
        icon: <Shield size={18} />,
        tone: 'violet',
      },
    ],
    [announcements.length, canManage, showUnreadOnly, unreadCount],
  );

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

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ANNOUNCEMENTS</p>
          <h2>公告</h2>
          <span>查看站内公告、同步已读状态和进入公告管理</span>
        </div>
        <div className="admin-source-controls admin-announcements-controls">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchAnnouncements(true)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
            刷新
          </Button>
          {!mobile && unreadCount > 0 ? (
            <Button size="sm" onClick={() => void handleMarkAllAsRead()}>
              <CheckCheck size={16} />
              全部已读
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => setViewMode('manage')}>
              <Shield size={16} />
              公告管理
            </Button>
          ) : null}
        </div>
      </header>

      <section className="admin-source-stat-grid admin-announcements-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = mobile ? (
    <Button className="min-h-11" variant="outline" aria-label="筛选公告" onClick={() => { setUnreadDraft(showUnreadOnly); setFilterOpen(true); }}><Filter size={16} />{showUnreadOnly ? '仅看未读' : '全部公告'}</Button>
  ) : (
      <section className="card admin-users-toolbar">
        <div className="admin-source-tabs">
          <button
            type="button"
            className={!showUnreadOnly ? 'active' : undefined}
            onClick={() => setShowUnreadOnly(false)}
          >
            全部公告
          </button>
          <button
            type="button"
            className={showUnreadOnly ? 'active' : undefined}
            onClick={() => setShowUnreadOnly(true)}
          >
            仅看未读
          </button>
        </div>
      </section>
  );

  const pageContent = (
    <InnerTableSurface className="admin-announcements-table-panel min-h-[36rem]" wrapperClassName="flex min-h-[36rem] flex-col">
      {loading ? (
        <InlineState
          title="正在加载公告..."
          className="py-10"
          icon={<Bell className="h-4 w-4" />}
        />
      ) : displayList.length > 0 ? (
        <div className="admin-announcements-grid">
          {pageList.map((item) => (
            <AnnouncementListItem
              key={item.announcementId}
              announcement={item}
              variant="card"
              onClick={() => void openDetail(item)}
            />
          ))}
        </div>
      ) : (
        <InlineState
          title={showUnreadOnly ? '暂无未读公告' : '暂无公告'}
          description={showUnreadOnly ? '当前公告已全部处理完成。' : '新公告发布后会显示在这里。'}
          className="py-10"
        />
      )}
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page admin-announcements-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
      <Pagination page={currentPage} pageSize={pageSize} total={displayList.length} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} />
      {mobile && <MobileFilterDrawer open={filterOpen} title="筛选公告" onClose={() => setFilterOpen(false)} onApply={() => { setShowUnreadOnly(unreadDraft); setFilterOpen(false); }} onReset={() => setUnreadDraft(false)}>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={unreadDraft} onChange={event => setUnreadDraft(event.target.checked)} />仅看未读公告</label>
      </MobileFilterDrawer>}
      {mobile && unreadCount > 0 && <div className="cf-mobile-primary-space"><footer className="cf-mobile-primary-footer"><Button className="min-h-11 w-full" disabled={loading} onClick={() => void handleMarkAllAsRead()}><CheckCheck size={16} />全部已读</Button></footer></div>}

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        onMarkAsRead={handleMarkAsReadAndClose}
        zIndexClassName="z-[110]"
        headerBadges={
          selectedAnnouncement ? (
            <>
              {selectedAnnouncement.isTop === 1 ? (
                <span className="rounded-md border border-rose-100 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                  置顶
                </span>
              ) : null}
              <span
                className={[
                  'rounded-md px-2.5 py-1 text-xs font-medium',
                  getAnnouncementPriorityMeta(selectedAnnouncement.priority).className,
                ].join(' ')}
              >
                {getAnnouncementPriorityMeta(selectedAnnouncement.priority).label}
              </span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950">
                {selectedAnnouncement.scopeType === AnnouncementScope.ALL ? '全员可见' : '定向发布'}
              </span>
            </>
          ) : null
        }
        extraInfo={
          selectedAnnouncement ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-cf-subtle">
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1 dark:border-slate-800 dark:bg-slate-950">
                发布时间：
                {formatAnnouncementRelativeWithDateTime(
                  selectedAnnouncement.publishTime || selectedAnnouncement.createTime,
                )}
              </span>
              {selectedAnnouncement.expireTime ? (
                <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1 dark:border-slate-800 dark:bg-slate-950">
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
    </section>
  );
};

export default AnnouncementPage;
