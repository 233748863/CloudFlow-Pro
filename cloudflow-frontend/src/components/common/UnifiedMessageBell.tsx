import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getNoticeDetail, getNoticeList, getUnreadCount, markNoticeRead } from '@/services/api/notice';
import type { Notice } from '@/services/api/notice';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import { AnnouncementType, type Announcement } from '@/types';
import { getAnnouncementExcerpt } from '@/utils/announcementContent';
import { formatAnnouncementRelativeTime } from '@/utils/announcementFormat';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';
import './announcement-overlays.css';

type MessageTab = 'all' | 'announcement' | 'notice';

interface UnifiedMessageBellProps {
  triggerClassName?: string;
  triggerIconSize?: number;
  triggerBadgeVariant?: 'count' | 'dot';
}

type UnifiedMessageItem =
  | {
      kind: 'announcement';
      id: number;
      title: string;
      excerpt: string;
      timeText: string;
      isRead: boolean;
      source: Announcement;
    }
  | {
      kind: 'notice';
      id: number;
      title: string;
      excerpt: string;
      timeText: string;
      isRead: boolean;
      type: string;
      source: Notice;
    };

const TAB_OPTIONS: Array<{ key: MessageTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'announcement', label: '公告' },
  { key: 'notice', label: '通知' },
];

function parseMessageTime(timeText: string) {
  if (!timeText) {
    return 0;
  }
  const time = new Date(timeText).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

function getAnnouncementTypeLabel(type: AnnouncementType) {
  if (type === AnnouncementType.URGENT) {
    return '紧急公告';
  }
  if (type === AnnouncementType.NOTIFICATION) {
    return '公告通知';
  }
  return '公告';
}

function getNoticeTypeLabel(type: string) {
  if (type === '2') {
    return '催办';
  }
  return '通知';
}

function getPlainTextExcerpt(content: string, fallback: string) {
  const source = (content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!source) {
    return fallback;
  }
  return source.length > 96 ? `${source.slice(0, 96).trim()}...` : source;
}

export const UnifiedMessageBell: React.FC<UnifiedMessageBellProps> = ({
  triggerClassName,
  triggerIconSize = 18,
  triggerBadgeVariant = 'count',
}) => {
  const announcements = useAnnouncementStore((state) => state.announcements);
  const announcementLoading = useAnnouncementStore((state) => state.loading);
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const markAnnouncementAsRead = useAnnouncementStore((state) => state.markAsRead);
  const announcementUnreadCount = useAnnouncementUnreadCount();

  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeUnreadCount, setNoticeUnreadCount] = useState(0);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MessageTab>('all');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const totalUnreadCount = announcementUnreadCount + noticeUnreadCount;

  const fetchNoticeUnreadCount = useCallback(async () => {
    try {
      setNoticeUnreadCount(await getUnreadCount());
    } catch {
      setNoticeUnreadCount(0);
    }
  }, []);

  const fetchNotices = useCallback(async () => {
    setNoticeLoading(true);
    try {
      const result = await getNoticeList({ pageNum: 1, pageSize: 20 });
      setNotices(result.rows || result.records || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载通知失败'));
    } finally {
      setNoticeLoading(false);
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    await Promise.all([
      fetchAnnouncements(true),
      fetchNoticeUnreadCount(),
      fetchNotices(),
    ]);
  }, [fetchAnnouncements, fetchNoticeUnreadCount, fetchNotices]);

  useEffect(() => {
    void fetchNoticeUnreadCount();
  }, [fetchNoticeUnreadCount]);

  useEffect(() => {
    const handleNoticeReceived = () => {
      if (isModalOpen) {
        void refreshMessages();
        return;
      }
      void fetchNoticeUnreadCount();
    };

    window.addEventListener('sys-notice-received', handleNoticeReceived);
    return () => {
      window.removeEventListener('sys-notice-received', handleNoticeReceived);
    };
  }, [fetchNoticeUnreadCount, isModalOpen, refreshMessages]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void refreshMessages();
  }, [isModalOpen, refreshMessages]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (selectedNotice) {
        setSelectedNotice(null);
        return;
      }
      if (selectedAnnouncement) {
        return;
      }
      setIsModalOpen(false);
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isModalOpen, selectedAnnouncement, selectedNotice]);

  const unifiedItems = useMemo<UnifiedMessageItem[]>(() => {
    const announcementItems: UnifiedMessageItem[] = announcements.map((item) => ({
      kind: 'announcement',
      id: item.announcementId,
      title: item.title,
      excerpt: getAnnouncementExcerpt(item.content, 96),
      timeText: item.publishTime || item.createTime,
      isRead: item.isRead,
      source: item,
    }));

    const noticeItems: UnifiedMessageItem[] = notices.map((item) => ({
      kind: 'notice',
      id: item.id,
      title: item.title,
      excerpt: getPlainTextExcerpt(item.content, '暂无内容'),
      timeText: item.createTime,
      isRead: item.isRead,
      type: item.type,
      source: item,
    }));

    return [...announcementItems, ...noticeItems].sort(
      (left, right) => parseMessageTime(right.timeText) - parseMessageTime(left.timeText),
    );
  }, [announcements, notices]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'announcement') {
      return unifiedItems.filter((item) => item.kind === 'announcement');
    }
    if (activeTab === 'notice') {
      return unifiedItems.filter((item) => item.kind === 'notice');
    }
    return unifiedItems;
  }, [activeTab, unifiedItems]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedNotice(null);
    setSelectedAnnouncement(null);
  }, []);

  const syncNoticeReadState = useCallback((noticeId: number) => {
    let decremented = false;
    setNotices((previous) =>
      previous.map((item) => {
        if (item.id !== noticeId || item.isRead) {
          return item;
        }
        decremented = true;
        return { ...item, isRead: true };
      }),
    );
    if (decremented) {
      setNoticeUnreadCount((previous) => Math.max(0, previous - 1));
    }
  }, []);

  const openNoticeDetail = useCallback(async (notice: Notice) => {
    let detailNotice = notice;

    try {
      detailNotice = await getNoticeDetail(notice.id);
    } catch {
      detailNotice = notice;
    }

    if (!detailNotice.isRead) {
      try {
        await markNoticeRead(detailNotice.id);
        detailNotice = { ...detailNotice, isRead: true };
        syncNoticeReadState(detailNotice.id);
      } catch (error) {
        toast.error(getErrorMessage(error, '标记通知已读失败'));
      }
    }

    setSelectedNotice(detailNotice);
  }, [syncNoticeReadState]);

  const openAnnouncementDetail = useCallback(async (announcement: Announcement) => {
    const nextAnnouncement = announcement.isRead ? announcement : { ...announcement, isRead: true };
    setSelectedAnnouncement(nextAnnouncement);

    if (!announcement.isRead) {
      await markAnnouncementAsRead(announcement.announcementId);
    }
  }, [markAnnouncementAsRead]);

  const closeAnnouncementDetail = useCallback(() => {
    setSelectedAnnouncement(null);
  }, []);

  const markAnnouncementAsReadAndClose = useCallback(async (announcementId: number) => {
    await markAnnouncementAsRead(announcementId);
    setSelectedAnnouncement(null);
  }, [markAnnouncementAsRead]);

  const openItem = useCallback((item: UnifiedMessageItem) => {
    if (item.kind === 'announcement') {
      void openAnnouncementDetail(item.source);
      return;
    }
    void openNoticeDetail(item.source);
  }, [openAnnouncementDetail, openNoticeDetail]);

  const getEmptyText = () => {
    if (activeTab === 'announcement') {
      return ['暂无公告', '新的公告会在这里显示'];
    }
    if (activeTab === 'notice') {
      return ['暂无通知', '新的站内信会在这里显示'];
    }
    return ['暂无消息', '公告和通知会在这里显示'];
  };

  const [emptyTitle, emptyDescription] = getEmptyText();
  const loading = announcementLoading || noticeLoading;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={cn(
          triggerClassName || 'relative flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-[var(--cf-surface-muted)] dark:text-slate-400 dark:hover:bg-slate-800',
          totalUnreadCount > 0 && 'text-cyan-600 dark:text-cyan-400',
        )}
        aria-label="消息中心"
      >
        <Bell size={triggerIconSize} />
        {totalUnreadCount > 0 && triggerBadgeVariant === 'dot' ? (
          <span className="notification-dot" aria-hidden="true" />
        ) : null}
        {totalUnreadCount > 0 && triggerBadgeVariant === 'count' ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-md bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {formatCount(totalUnreadCount)}
          </span>
        ) : null}
      </button>

      <BaseDialog
        open={isModalOpen}
        title={selectedNotice ? '通知详情' : '消息中心'}
        description={!selectedNotice ? `未读：公告 ${announcementUnreadCount} 条 · 通知 ${noticeUnreadCount} 条` : undefined}
        onClose={closeModal}
        closeOnEscape={false}
        maxWidthClassName="w-full max-w-[680px]"
        bodyClassName="p-0 !overflow-hidden"
        headerAside={selectedNotice ? (
          <button
            type="button"
            onClick={() => setSelectedNotice(null)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-600 transition-colors hover:bg-[var(--cf-surface-muted)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
            aria-label="返回消息列表"
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Bell size={16} className="text-cyan-600 dark:text-cyan-300" />
        )}
        zIndex={100}
      >
                {!selectedNotice ? (
                  <div className="border-b border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-1 dark:border-slate-800 dark:bg-slate-950">
                    {TAB_OPTIONS.map((tab) => {
                      const count =
                        tab.key === 'announcement'
                          ? announcements.length
                          : tab.key === 'notice'
                            ? notices.length
                            : unifiedItems.length;

                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveTab(tab.key)}
                          className={cn(
                            'min-w-[72px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                            activeTab === tab.key
                              ? 'bg-cyan-600 text-white dark:bg-cyan-500'
                              : 'text-slate-600 hover:bg-[var(--cf-surface-muted)] dark:text-slate-300 dark:hover:bg-slate-800',
                          )}
                          aria-pressed={activeTab === tab.key}
                        >
                          {tab.label}
                          <span className="ml-1 opacity-75">{count}</span>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                ) : null}

              <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
                {loading && !selectedNotice ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-600 dark:text-cyan-300" />
                  </div>
                ) : selectedNotice ? (
                  <div className="admin-dialog-stack px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="rounded-md bg-cyan-50 px-2.5 py-1 font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
                        {getNoticeTypeLabel(selectedNotice.type)}
                      </span>
                      <span>{formatAnnouncementRelativeTime(selectedNotice.createTime)}</span>
                      {selectedNotice.sender ? <span>发送人：{selectedNotice.sender}</span> : null}
                    </div>

                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {selectedNotice.title}
                    </h3>

                    <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
                      <div className="whitespace-pre-wrap break-words">{selectedNotice.content || '暂无内容'}</div>
                    </div>
                  </div>
                ) : filteredItems.length > 0 ? (
                  <div>
                    {filteredItems.map((item) => {
                      const isAnnouncement = item.kind === 'announcement';
                      const typeLabel = isAnnouncement
                        ? getAnnouncementTypeLabel(item.source.type)
                        : getNoticeTypeLabel(item.type);

                      return (
                        <button
                          key={`${item.kind}-${item.id}`}
                          type="button"
                          className={cn(
                            'group relative flex min-h-[72px] w-full items-center gap-4 border-b border-slate-200 px-6 py-4 text-left transition-colors hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:hover:bg-slate-900/70',
                            !item.isRead && 'bg-cyan-50/30 dark:bg-cyan-950/10',
                          )}
                          onClick={() => openItem(item)}
                        >
                          <div
                            className={cn(
                              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md',
                              item.isRead
                                ? 'bg-[var(--cf-surface-muted)] text-slate-400 shadow-transparent dark:bg-slate-900 dark:text-slate-500'
                                : isAnnouncement
                                  ? 'bg-cyan-600 text-white'
                                  : 'bg-sky-600 text-white',
                            )}
                          >
                            {item.isRead ? (
                              <Check className="h-5 w-5" />
                            ) : isAnnouncement ? (
                              <Megaphone className="h-5 w-5" />
                            ) : (
                              <Mail className="h-5 w-5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {item.title}
                                  </h3>
                                  {!item.isRead ? (
                                    <span className="inline-flex h-2 w-2 flex-shrink-0 rounded-sm bg-cyan-600" />
                                  ) : null}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                  {item.excerpt}
                                </p>
                                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                  <span>{typeLabel}</span>
                                  <span>{formatAnnouncementRelativeTime(item.timeText)}</span>
                                </div>
                              </div>
                              <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 dark:text-slate-600" />
                            </div>
                          </div>

                          {!item.isRead ? (
                            <div
                              className={cn(
                                'absolute left-0 top-0 h-full w-1',
                                isAnnouncement ? 'bg-cyan-600' : 'bg-sky-600',
                              )}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
                      <Inbox size={28} className="text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{emptyTitle}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{emptyDescription}</p>
                  </div>
                )}
              </div>
      </BaseDialog>

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={closeAnnouncementDetail}
        onMarkAsRead={markAnnouncementAsReadAndClose}
        zIndexClassName="z-[110]"
      />
    </div>
  );
};
