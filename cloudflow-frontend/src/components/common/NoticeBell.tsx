import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, Inbox, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getNoticeDetail, getNoticeList, getUnreadCount, markNoticeRead } from '@/services/api/notice';
import type { Notice } from '@/services/api/notice';
import { getErrorMessage } from '@/utils/errorMessage';
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

    window.addEventListener('keydown', handleEscape);

    return () => {
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
        className={`relative flex h-9 w-9 items-center justify-center rounded-md text-cf-muted transition-colors hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-800 ${
 unreadCount > 0 ? 'text-cyan-600 dark:text-cyan-400' : ''
 }`}
        aria-label="消息通知"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-md bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      <BaseDialog
        open={isModalOpen}
        title={selectedNotice ? '通知详情' : '消息通知'}
        description={!selectedNotice ? (unreadCount > 0 ? `${unreadCount} 条未读` : '暂无未读消息') : undefined}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedNotice(null);
        }}
        closeOnEscape={false}
        maxWidthClassName="w-full max-w-[680px]"
        bodyClassName="p-0 !overflow-hidden"
        headerAside={selectedNotice ? (
          <button
            type="button"
            onClick={() => setSelectedNotice(null)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted transition-colors hover:bg-[var(--cf-surface-muted)] dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900"
            aria-label="返回通知列表"
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Bell size={16} className="text-cyan-600 dark:text-cyan-300" />
        )}
        zIndex={100}
      >
              <div className="cf-announcement-scroll max-h-[65vh] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-600 dark:text-cyan-300" />
                  </div>
                ) : selectedNotice ? (
                  <div className="admin-dialog-stack px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-cf-subtle">
                      <span className="rounded-md bg-cyan-50 px-2.5 py-1 font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-300">
                        {getNoticeTypeLabel(selectedNotice.type)}
                      </span>
                      <span>{formatNoticeRelativeTime(selectedNotice.createTime)}</span>
                      {selectedNotice.sender ? <span>发送人：{selectedNotice.sender}</span> : null}
                    </div>

                    <div>
                      <h3 className="text-base font-semibold text-cf-title">
                        {selectedNotice.title}
                      </h3>
                    </div>

                    <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 text-sm leading-7 text-cf-body dark:border-slate-800 dark:bg-slate-900/70">
                      <div className="whitespace-pre-wrap break-words">{selectedNotice.content || '暂无内容'}</div>
                    </div>
                  </div>
                ) : notices.length > 0 ? (
                  <div>
                    {notices.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`group relative flex min-h-[64px] w-full items-center gap-3 border-b border-slate-200 px-5 py-3 text-left transition-colors hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:hover:bg-slate-900/70 ${
 !item.isRead ? 'bg-cyan-50/30 dark:bg-cyan-950/10' : ''
 }`}
                        onClick={() => void openDetail(item)}
                      >
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${
 item.isRead
 ? 'bg-[var(--cf-surface-muted)] text-cf-faint dark:bg-slate-900 '
 : 'bg-cyan-600 text-white'
 }`}>
                          {item.isRead ? <Check className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="truncate text-sm font-medium text-cf-title">
                                  {item.title}
                                </h3>
                                {!item.isRead ? (
                                  <span className="inline-flex h-2 w-2 rounded-sm bg-cyan-600" />
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-cf-subtle">
                                {item.content || '暂无内容'}
                              </p>
                              <div className="mt-2 flex items-center gap-2 text-xs text-cf-faint">
                                <span>{getNoticeTypeLabel(item.type)}</span>
                                <span>{formatNoticeRelativeTime(item.createTime)}</span>
                              </div>
                            </div>
                            <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-cf-faint transition-transform group-hover:translate-x-1" />
                          </div>
                        </div>

                        {!item.isRead ? (
                          <div className="absolute left-0 top-0 h-full w-1 bg-cyan-600" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div className="admin-source-stat-icon mb-3 h-12 w-12 border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
                      <Inbox size={28} className="text-cf-faint" />
                    </div>
                    <p className="text-sm font-medium text-cf-title">暂无通知</p>
                    <p className="mt-1 text-xs text-cf-subtle">新的站内信会在这里显示</p>
                  </div>
                )}
              </div>
      </BaseDialog>
    </div>
  );
};
