import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMyAnnouncements, markAnnouncementRead } from '@/services/api/announcement';
import type { Announcement } from '@/types';

interface HeaderAnnouncementBellProps {
  unreadCount: number;
}

const formatRelativeTime = (value?: string) => {
  if (!value) {
    return '刚刚';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return '刚刚';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }
  if (diff < 7 * day) {
    return `${Math.floor(diff / day)} 天前`;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

export const HeaderAnnouncementBell: React.FC<HeaderAnnouncementBellProps> = ({
  unreadCount,
}) => {
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const visibleUnreadCount = useMemo(() => {
    if (announcements.length === 0) {
      return unreadCount;
    }
    return announcements.filter((item) => !item.isRead).length;
  }, [announcements, unreadCount]);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const list = await getMyAnnouncements();
      const sorted = [...list].sort((left, right) => {
        if (left.isTop !== right.isTop) {
          return Number(right.isTop) - Number(left.isTop);
        }
        return new Date(right.createTime).getTime() - new Date(left.createTime).getTime();
      });
      setAnnouncements(sorted);
    } catch (error) {
      console.error('获取公告列表失败:', error);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    void loadAnnouncements();
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen && !detailOpen) {
      return;
    }

    // 保持与参考源码一致：支持 Esc 关闭弹层，并锁定 body 滚动。
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (detailOpen) {
        setDetailOpen(false);
        setSelectedAnnouncement(null);
        return;
      }

      setIsModalOpen(false);
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [detailOpen, isModalOpen]);

  const patchAnnouncementReadState = (announcementId: number) => {
    setAnnouncements((prev) =>
      prev.map((item) =>
        item.announcementId === announcementId ? { ...item, isRead: true } : item,
      ),
    );
  };

  const handleMarkRead = async (announcementId: number) => {
    try {
      await markAnnouncementRead(String(announcementId));
      patchAnnouncementReadState(announcementId);
      window.dispatchEvent(new Event('announcementRead'));
    } catch (error) {
      console.error('标记公告已读失败:', error);
    }
  };

  const openDetail = async (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setDetailOpen(true);

    if (!announcement.isRead) {
      await handleMarkRead(announcement.announcementId);
      setSelectedAnnouncement((prev) =>
        prev && prev.announcementId === announcement.announcementId
          ? { ...prev, isRead: true }
          : prev,
      );
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadAnnouncements = announcements.filter((item) => !item.isRead);
    if (unreadAnnouncements.length === 0) {
      return;
    }

    await Promise.all(
      unreadAnnouncements.map((item) => handleMarkRead(item.announcementId)),
    );
  };

  const announcementModal =
    isModalOpen || detailOpen
      ? createPortal(
          <>
            {isModalOpen ? (
              <div
                className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
                onClick={() => setIsModalOpen(false)}
              >
                <div
                  className="w-full max-w-[620px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="relative overflow-hidden border-b border-slate-100/90 bg-gradient-to-br from-cyan-50/80 to-sky-50/40 px-6 py-5">
                    <div className="relative z-10 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg shadow-cyan-500/30">
                            <Bell size={16} />
                          </div>
                          <h2 className="text-lg font-semibold text-slate-900">公告中心</h2>
                        </div>
                        {visibleUnreadCount > 0 ? (
                          <p className="mt-2 text-sm text-slate-600">
                            <span className="font-medium text-cyan-600">
                              {visibleUnreadCount}
                            </span>
                            {' '}条未读消息
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {visibleUnreadCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => void handleMarkAllAsRead()}
                            className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-cyan-500/30 transition-all hover:bg-cyan-700"
                          >
                            全部已读
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setIsModalOpen(false)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-slate-500 transition-all hover:bg-white hover:text-slate-700"
                          aria-label="关闭公告弹层"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-sky-100/30 to-transparent" />
                  </div>

                  <div className="max-h-[65vh] overflow-y-auto">
                    {loading ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="relative">
                          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-600" />
                          <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-cyan-300/40" />
                        </div>
                      </div>
                    ) : announcements.length > 0 ? (
                      <div>
                        {announcements.map((item) => (
                          <button
                            key={item.announcementId}
                            type="button"
                            className={`group relative flex w-full items-center gap-4 border-b border-slate-100 px-6 py-4 text-left transition-all hover:bg-slate-50 ${
                              !item.isRead ? 'bg-cyan-50/30' : ''
                            }`}
                            onClick={() => void openDetail(item)}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                              {!item.isRead ? (
                                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg shadow-cyan-500/30">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-cyan-400 opacity-75" />
                                  <Info size={18} className="relative z-10" />
                                </div>
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                                  <CheckCheck size={18} />
                                </div>
                              )}
                            </div>

                            <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-sm font-medium text-slate-900">
                                  {item.title}
                                </h3>
                                <div className="mt-1 flex items-center gap-2">
                                  <time className="text-xs text-slate-500">
                                    {formatRelativeTime(item.createTime)}
                                  </time>
                                  {!item.isRead ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-cyan-100 px-1.5 py-0.5 text-xs font-medium text-cyan-700">
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-500 opacity-75" />
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-600" />
                                      </span>
                                      未读
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
                            </div>

                            {!item.isRead ? (
                              <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-cyan-500 to-sky-600" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                          <Bell size={28} />
                        </div>
                        <p className="text-sm font-medium text-slate-900">暂无公告</p>
                        <p className="mt-1 text-xs text-slate-500">新公告发布后会显示在这里</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        可在这里快速查看最新公告与未读提醒
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalOpen(false);
                          navigate('/office/announcement');
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                      >
                        进入公告中心
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {detailOpen && selectedAnnouncement ? (
              <div
                className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[6vh] backdrop-blur-md"
                onClick={() => {
                  setDetailOpen(false);
                  setSelectedAnnouncement(null);
                }}
              >
                <div
                  className="w-full max-w-[780px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-cyan-50/80 via-sky-50/50 to-indigo-50/30 px-8 py-6">
                    <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-sky-100/30 to-transparent" />
                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-cyan-400/20 to-sky-500/20 blur-3xl" />

                    <div className="relative z-10 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg shadow-cyan-500/30">
                            <Info size={18} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-xs font-medium text-cyan-700">
                              公告中心
                            </span>
                            {!selectedAnnouncement.isRead ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-sky-600 px-2.5 py-1 text-xs font-medium text-white shadow-lg shadow-cyan-500/30">
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                                </span>
                                未读
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <h2 className="mb-3 text-2xl font-bold leading-tight text-slate-900">
                          {selectedAnnouncement.title}
                        </h2>

                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span>{formatRelativeTime(selectedAnnouncement.createTime)}</span>
                          <span>{selectedAnnouncement.isRead ? '已读' : '未读'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setDetailOpen(false);
                          setSelectedAnnouncement(null);
                        }}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60 text-slate-500 transition-all hover:bg-white hover:text-slate-700 hover:shadow-lg"
                        aria-label="关闭公告详情"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[60vh] overflow-y-auto bg-white px-8 py-8">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-cyan-500 via-sky-500 to-indigo-500" />
                      <div className="pl-6">
                        <div
                          className="prose prose-sm max-w-none text-slate-700"
                          dangerouslySetInnerHTML={{
                            __html: selectedAnnouncement.content || '<p>暂无正文内容</p>',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        若需要完整处理公告，可进入公告中心查看历史记录与已读状态
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailOpen(false);
                            setSelectedAnnouncement(null);
                          }}
                          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                        >
                          关闭
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailOpen(false);
                            setSelectedAnnouncement(null);
                            setIsModalOpen(false);
                            navigate('/office/announcement');
                          }}
                          className="rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] hover:shadow-xl"
                        >
                          进入公告中心
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-all hover:scale-[1.03] hover:bg-slate-100 ${
          unreadCount > 0 ? 'text-cyan-600' : ''
        }`}
        aria-label="公告中心"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
        ) : null}
      </button>

      {announcementModal}
    </>
  );
};
