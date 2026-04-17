import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  Eye,
  Megaphone,
  Pin,
  Plus,
  Shield,
} from 'lucide-react';
import { Announcement, AnnouncementScope, Role } from '../types';
import {
  getMyAnnouncements,
  markAnnouncementRead,
} from '../services/api/announcement';
import { useAuth } from '../context/AuthContext';
import {
  AnnouncementDetailModal,
  AnnouncementListItem,
} from '@/components/common';
import {
  AnnouncementManageView,
} from '@/components/admin/announcements';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { cn } from '@/utils/cn';
import { getAnnouncementPriorityMeta } from '@/utils/announcementMeta';

type AnnouncementTab = 'unread' | 'read' | 'manage';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const EmptyPanel = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <WorkspaceEmptyPanel
    variant="glass"
    icon={icon}
    title={title}
    description={description}
  />
);

export const AnnouncementPage = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState<AnnouncementTab>('unread');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const canManage = user?.role === Role.ADMIN || user?.role === Role.HR;
  const isManageMode = activeTab === 'manage' && canManage;

  const fetchUserAnnouncements = async () => {
    try {
      const list = await getMyAnnouncements();
      setAnnouncements(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('获取公告失败', error);
      setAnnouncements([]);
    }
  };

  useEffect(() => {
    if (!user || isManageMode) {
      return;
    }
    void fetchUserAnnouncements();
  }, [user, isManageMode]);

  const handleRead = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);

    if (announcement.isRead) {
      return;
    }

    try {
      await markAnnouncementRead(String(announcement.announcementId));
      setSelectedAnnouncement((previous) => (
        previous && previous.announcementId === announcement.announcementId
          ? { ...previous, isRead: true }
          : previous
      ));
      await fetchUserAnnouncements();
      window.dispatchEvent(new Event('announcementRead'));
    } catch (error) {
      console.error('标记公告已读失败', error);
    }
  };

  const unreadCount = announcements.filter((announcement) => !announcement.isRead).length;
  const readCount = announcements.filter((announcement) => announcement.isRead).length;
  const topCount = announcements.filter((announcement) => announcement.isTop === 1).length;

  const displayList = announcements.filter((announcement) => {
    if (activeTab === 'unread') {
      return !announcement.isRead;
    }
    if (activeTab === 'read') {
      return announcement.isRead;
    }
    return true;
  });

  const activeTabTitle = activeTab === 'read' ? '历史消息' : '未读消息';
  const dateLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const announcementSummary = activeTab === 'unread'
    ? unreadCount > 0
      ? `当前还有 ${unreadCount} 条未读公告，建议优先处理置顶或紧急消息。`
      : '当前没有未读公告，公告中心状态平稳。'
    : '这里集中归档你已经查看过的公告，方便后续追溯和再次确认。';

  const overviewItems = [
    {
      label: '当前视图',
      value: activeTabTitle,
      toneClassName:
        'border-pink-100 bg-[linear-gradient(135deg,rgba(253,242,248,0.92),rgba(255,255,255,0.84))] text-pink-600 shadow-[0_10px_24px_rgba(236,72,153,0.08)]',
    },
    {
      label: '未读公告',
      value: unreadCount,
    },
    {
      label: '置顶公告',
      value: topCount,
    },
    {
      label: '历史消息',
      value: readCount,
    },
  ];

  const metricCards = [
    {
      label: '未读消息',
      value: unreadCount,
      hint: '需要优先查看',
      aside: <Bell size={18} className="text-pink-500" />,
    },
    {
      label: '历史消息',
      value: readCount,
      hint: '已完成阅读',
      aside: <Eye size={18} className="text-slate-500" />,
    },
    {
      label: '置顶公告',
      value: topCount,
      hint: '重点消息总数',
      aside: <Pin size={18} className="text-amber-500" />,
    },
    {
      label: '消息总量',
      value: announcements.length,
      hint: '当前用户可见的公告数量',
      aside: <Megaphone size={18} className="text-rose-500" />,
    },
  ];

  if (!user) {
    return null;
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 p-6">
        {isManageMode ? (
          <AnnouncementManageView onSwitchTab={setActiveTab} />
        ) : (
          <div className="space-y-6">
            <WorkspaceHeroCard
              badge={(
                <span className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <Megaphone className="h-3.5 w-3.5" />
                  公告工作台
                </span>
              )}
              title="公告中心"
              description={announcementSummary}
              actions={(
                <div className="flex flex-wrap gap-3">
                  {canManage ? (
                    <>
                      <Button
                        className="h-12 rounded-2xl px-6"
                        onClick={() => setActiveTab('manage')}
                      >
                        <Plus size={16} className="mr-2" />
                        发布公告
                      </Button>
                      <Button
                        variant="outline"
                        className="h-12 rounded-2xl bg-white/85 px-6"
                        onClick={() => setActiveTab('manage')}
                      >
                        <Shield size={16} className="mr-2 text-pink-500" />
                        公告管理
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
            >
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                  <Calendar size={14} />
                  {dateLabel}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
                  {timeLabel}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">
                  {activeTabTitle}
                </span>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-4">
                {metricCards.map((card) => (
                  <WorkspaceMetricCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    hint={card.hint}
                    aside={card.aside}
                  />
                ))}
              </div>
            </WorkspaceHeroCard>

            <WorkspaceWorkbenchCard
              eyebrow="公告工作区"
              title={activeTabTitle}
              total={displayList.length}
              hasActiveFilters={activeTab !== 'unread'}
              overviewItems={overviewItems}
              quickFilters={[
                { label: '未读消息', value: 'unread' },
                { label: '历史消息', value: 'read' },
                ...(canManage ? [{ label: '公告管理', value: 'manage' }] : []),
              ]}
              activeQuickFilter={activeTab}
              onQuickFilterChange={(value) => setActiveTab(value as AnnouncementTab)}
              filterBar={(
                <div className="text-sm leading-6 text-slate-500">
                  {activeTab === 'read'
                    ? '这里会沉淀你已经读过的公告，便于后续追溯。'
                    : '未读消息会优先展示置顶和高优先级公告，帮助你快速确认团队通知。'}
                </div>
              )}
            />

            <WorkspaceResultCard
              total={displayList.length}
              title={activeTabTitle}
              description="按阅读状态查看公告详情，未读消息会优先标识。"
            >
              <div className="p-4">
                {displayList.length === 0 ? (
                  <EmptyPanel
                    icon={<Bell size={26} />}
                    title="暂无相关消息"
                    description="新公告发布后会在这里展示，未读消息会优先标识。"
                  />
                ) : (
                  <div className="space-y-3">
                    {displayList.map((item) => (
                      <AnnouncementListItem
                        key={item.announcementId}
                        announcement={item}
                        variant="page"
                        onClick={() => handleRead(item)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </WorkspaceResultCard>
          </div>
        )}
      </div>

      {!isManageMode ? (
        <AnnouncementDetailModal
          announcement={selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
          zIndexClassName="z-[140]"
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
          extraInfo={selectedAnnouncement?.expireTime ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white/75 px-3 py-1 ring-1 ring-white/80">
                有效期至：{new Date(selectedAnnouncement.expireTime).toLocaleString()}
              </span>
            </div>
          ) : null}
          footerReadText="你已阅读该公告"
          footerUnreadText="打开后会自动标记为已读"
        />
      ) : null}
    </div>
  );
};

export default AnnouncementPage;
