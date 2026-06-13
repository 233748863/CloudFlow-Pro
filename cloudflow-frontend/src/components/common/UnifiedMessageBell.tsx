import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AnnouncementDetailModal } from '@/components/common/AnnouncementDetailModal';
import { getNoticeDetail, getNoticeList, getUnreadCount, markNoticeRead } from '@/services/api/notice';
import type { Notice } from '@/services/api/notice';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import { AnnouncementType, type Announcement } from '@/types';
import { getAnnouncementExcerpt } from '@/utils/announcementContent';
import { formatAnnouncementRelativeTime } from '@/utils/announcementFormat';
import { lockBodyScroll } from '@/utils/bodyScrollLock';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';
import './announcement-overlays.css';

type MessageTab = 'all' | 'announcement' | 'notice';

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

export const UnifiedMessageBell: React.FC = () => {
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

    const unlockBodyScroll = lockBodyScroll();
    window.addEventListener('keydown', handleEscape);

    return () => {
      unlockBodyScroll();
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
          'relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all hover:scale-105 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800',
          totalUnreadCount > 0 && 'text-blue-600 dark:text-blue-400',
        )}
        aria-label="消息中心"
      >
        <Bell size={18} />
        {totalUnreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {formatCount(totalUnreadCount)}
          </span>
        ) : null}
      </button>

      {isModalOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="cf-announcement-layer fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
            onClick={closeModal}
          >
            <div
              className="cf-announcement-panel w-full max-w-[680px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-950 dark:ring-slate-700/70"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative overflow-hidden border-b border-gray-100/80 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 px-6 py-5 dark:border-slate-800 dark:from-blue-950/25 dark:to-slate-950">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {selectedNotice ? (
                        <button
                          type="button"
                          onClick={() => setSelectedNotice(null)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-gray-600 transition hover:bg-white dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800"
                          aria-label="返回消息列表"
                        >
                          <ArrowLeft size={16} />
                        </button>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                          <Bell size={16} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                          {selectedNotice ? '通知详情' : '消息中心'}
                        </h2>
                        {!selectedNotice ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            未读：公告 {announcementUnreadCount} 条 · 通知 {noticeUnreadCount} 条
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="关闭"
                  >
                    <X size={16} />
                  </button>
                </div>

                {!selectedNotice ? (
                  <div className="relative z-10 mt-5 inline-flex rounded-xl border border-white/70 bg-white/70 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
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
                            'min-w-[72px] rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                            activeTab === tab.key
                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 dark:bg-blue-500'
                              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                          )}
                          aria-pressed={activeTab === tab.key}
                        >
                          {tab.label}
                          <span className="ml-1 opacity-75">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent dark:from-indigo-900/10" />
              </div>

              <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
                {loading && !selectedNotice ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                  </div>
                ) : selectedNotice ? (
                  <div className="space-y-5 px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {getNoticeTypeLabel(selectedNotice.type)}
                      </span>
                      <span>{formatAnnouncementRelativeTime(selectedNotice.createTime)}</span>
                      {selectedNotice.sender ? <span>发送人：{selectedNotice.sender}</span> : null}
                    </div>

                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {selectedNotice.title}
                    </h3>

                    <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
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
                            'group relative flex min-h-[82px] w-full items-center gap-4 border-b border-gray-100 px-6 py-4 text-left transition-all hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-900/70',
                            !item.isRead && 'bg-blue-50/30 dark:bg-blue-900/5',
                          )}
                          onClick={() => openItem(item)}
                        >
                          <div
                            className={cn(
                              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-lg',
                              item.isRead
                                ? 'bg-gray-100 text-gray-400 shadow-transparent dark:bg-slate-900 dark:text-slate-500'
                                : isAnnouncement
                                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/20'
                                  : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/20',
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
                                  <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                    {item.title}
                                  </h3>
                                  {!item.isRead ? (
                                    <span className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                                  ) : null}
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                  {item.excerpt}
                                </p>
                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                  <span>{typeLabel}</span>
                                  <span>{formatAnnouncementRelativeTime(item.timeText)}</span>
                                </div>
                              </div>
                              <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 dark:text-gray-600" />
                            </div>
                          </div>

                          {!item.isRead ? (
                            <div
                              className={cn(
                                'absolute left-0 top-0 h-full w-1',
                                isAnnouncement
                                  ? 'bg-gradient-to-b from-cyan-500 to-blue-600'
                                  : 'bg-gradient-to-b from-blue-500 to-indigo-600',
                              )}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900">
                      <Inbox size={28} className="text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{emptyTitle}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{emptyDescription}</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}

      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        onClose={closeAnnouncementDetail}
        onMarkAsRead={markAnnouncementAsReadAndClose}
        zIndexClassName="z-[110]"
      />
    </div>
  );
};
