import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Bell, Check, ChevronRight, Inbox, Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { getNoticeDetail, getNoticeList, getUnreadCount, markNoticeRead } from '@/services/api/notice';
import type { Notice } from '@/services/api/notice';
import { getErrorMessage } from '@/utils/errorMessage';
import { lockBodyScroll } from '@/utils/bodyScrollLock';
import './announcement-overlays.css';

function formatNoticeRelativeTime(timeText: string) {
  if (!timeText) {
    return '刚刚';
  }

  const date = new Date(timeText);
  if (Number.isNaN(date.getTime())) {
    return timeText;
  }

  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return '刚刚';
  }
  if (minutes < 60) {
    return `${minutes}分钟前`;
  }
  if (hours < 24) {
    return `${hours}小时前`;
  }
  if (days < 7) {
    return `${days}天前`;
  }
  return timeText.slice(0, 16).replace('T', ' ');
}

function getNoticeTypeLabel(type: string) {
  if (type === '2') {
    return '催办';
  }
  return '通知';
}

export const NoticeBell: React.FC = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await getUnreadCount());
    } catch {
      setUnreadCount(0);
    }
  }, []);

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getNoticeList({ pageNum: 1, pageSize: 20 });
      setNotices(result.rows || result.records || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载通知失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshNotices = useCallback(async () => {
    await Promise.all([fetchUnreadCount(), fetchNotices()]);
  }, [fetchNotices, fetchUnreadCount]);

  useEffect(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    const handleNoticeReceived = () => {
      if (isModalOpen) {
        void refreshNotices();
        return;
      }
      void fetchUnreadCount();
    };

    window.addEventListener('sys-notice-received', handleNoticeReceived);
    return () => {
      window.removeEventListener('sys-notice-received', handleNoticeReceived);
    };
  }, [fetchUnreadCount, isModalOpen, refreshNotices]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void refreshNotices();
  }, [isModalOpen, refreshNotices]);

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
      setIsModalOpen(false);
    };

    const unlockBodyScroll = lockBodyScroll();
    window.addEventListener('keydown', handleEscape);

    return () => {
      unlockBodyScroll();
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isModalOpen, selectedNotice]);

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
      setUnreadCount((previous) => Math.max(0, previous - 1));
    }
  }, []);

  const openDetail = useCallback(async (notice: Notice) => {
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

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all hover:scale-105 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 ${
          unreadCount > 0 ? 'text-blue-600 dark:text-blue-400' : ''
        }`}
        aria-label="消息通知"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isModalOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="cf-announcement-layer fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
            onClick={() => setIsModalOpen(false)}
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
                          aria-label="返回通知列表"
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
                          {selectedNotice ? '通知详情' : '消息通知'}
                        </h2>
                        {!selectedNotice ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            {unreadCount > 0 ? `${unreadCount} 条未读` : '暂无未读消息'}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="关闭"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent dark:from-indigo-900/10" />
              </div>

              <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                  </div>
                ) : selectedNotice ? (
                  <div className="space-y-5 px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {getNoticeTypeLabel(selectedNotice.type)}
                      </span>
                      <span>{formatNoticeRelativeTime(selectedNotice.createTime)}</span>
                      {selectedNotice.sender ? <span>发送人：{selectedNotice.sender}</span> : null}
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {selectedNotice.title}
                      </h3>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                      <div className="whitespace-pre-wrap break-words">{selectedNotice.content || '暂无内容'}</div>
                    </div>
                  </div>
                ) : notices.length > 0 ? (
                  <div>
                    {notices.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`group relative flex min-h-[76px] w-full items-center gap-4 border-b border-gray-100 px-6 py-4 text-left transition-all hover:bg-gray-50 dark:border-slate-800 dark:hover:bg-slate-900/70 ${
                          !item.isRead ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''
                        }`}
                        onClick={() => void openDetail(item)}
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
                          {item.isRead ? <Check className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                  {item.title}
                                </h3>
                                {!item.isRead ? (
                                  <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                {item.content || '暂无内容'}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                                <span>{getNoticeTypeLabel(item.type)}</span>
                                <span>{formatNoticeRelativeTime(item.createTime)}</span>
                              </div>
                            </div>
                            <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 dark:text-gray-600" />
                          </div>
                        </div>

                        {!item.isRead ? (
                          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900">
                      <Inbox size={28} className="text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">暂无通知</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">新的站内信会在这里显示</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
};
