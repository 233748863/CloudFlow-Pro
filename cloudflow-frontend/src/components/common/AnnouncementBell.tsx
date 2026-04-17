import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, ChevronRight, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AnnouncementContent } from '@/components/common/AnnouncementContent';
import { useAnnouncementStore, useAnnouncementUnreadCount } from '@/stores/announcementStore';
import type { Announcement } from '@/types';

function formatRelativeTime(value?: string) {
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
}

export const AnnouncementBell: React.FC = () => {
  const navigate = useNavigate();
  const announcements = useAnnouncementStore((state) => state.announcements);
  const loading = useAnnouncementStore((state) => state.loading);
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const markAsRead = useAnnouncementStore((state) => state.markAsRead);
  const markAllAsRead = useAnnouncementStore((state) => state.markAllAsRead);
  const unreadCount = useAnnouncementUnreadCount();

  const [isListOpen, setIsListOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const visibleUnreadCount = useMemo(
    () => announcements.filter((item) => !item.isRead).length,
    [announcements],
  );

  useEffect(() => {
    if (!isListOpen) {
      return;
    }

    void fetchAnnouncements(true);
  }, [fetchAnnouncements, isListOpen]);

  useEffect(() => {
    if (!isListOpen && !isDetailOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isDetailOpen) {
        setIsDetailOpen(false);
        setSelectedAnnouncement(null);
        return;
      }

      setIsListOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isDetailOpen, isListOpen]);

  async function openDetail(announcement: Announcement) {
    setSelectedAnnouncement(announcement);
    setIsDetailOpen(true);

    if (!announcement.isRead) {
      await markAsRead(announcement.announcementId);
      setSelectedAnnouncement((prev) => (
        prev && prev.announcementId === announcement.announcementId
          ? { ...prev, isRead: true }
          : prev
      ));
    }
  }

  const modal =
    isListOpen || isDetailOpen
      ? createPortal(
          <>
            {isListOpen ? (
              <div
                className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
                onClick={() => setIsListOpen(false)}
              >
                <div
                  className="w-full max-w-[620px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="relative overflow-hidden border-b border-slate-100/80 bg-gradient-to-br from-blue-50/70 to-indigo-50/30 px-6 py-5">
                    <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent" />

                    <div className="relative z-10 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                            <Bell size={16} />
                          </div>
                          <h2 className="text-lg font-semibold text-slate-900">公告中心</h2>
                        </div>
                        {visibleUnreadCount > 0 ? (
                          <p className="mt-2 text-sm text-slate-600">
                            <span className="font-medium text-blue-600">{visibleUnreadCount}</span>
                            {' '}条未读消息
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {visibleUnreadCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => void markAllAsRead()}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700"
                          >
                            全部已读
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setIsListOpen(false)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/70 text-slate-500 transition-all hover:bg-white hover:text-slate-700"
                          aria-label="关闭公告弹层"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[65vh] overflow-y-auto">
                    {loading ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="relative">
                          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
                          <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-blue-300/40" />
                        </div>
                      </div>
                    ) : announcements.length > 0 ? (
                      <div>
                        {announcements.map((item) => (
                          <button
                            key={item.announcementId}
                            type="button"
                            className={`group relative flex w-full items-center gap-4 border-b border-slate-100 px-6 py-4 text-left transition-all hover:bg-slate-50 ${
                              !item.isRead ? 'bg-blue-50/30' : ''
                            }`}
                            onClick={() => void openDetail(item)}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                              {!item.isRead ? (
                                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-blue-400 opacity-75" />
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
                                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
                                      </span>
                                      未读
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
                            </div>

                            {!item.isRead ? (
                              <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
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
                          setIsListOpen(false);
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

            {isDetailOpen && selectedAnnouncement ? (
              <div
                className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[6vh] backdrop-blur-md"
                onClick={() => {
                  setIsDetailOpen(false);
                  setSelectedAnnouncement(null);
                }}
              >
                <div
                  className="w-full max-w-[780px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-purple-50/20 px-8 py-6">
                    <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-indigo-100/20 to-transparent" />
                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 blur-3xl" />

                    <div className="relative z-10 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                            <Info size={18} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                              公告中心
                            </span>
                            {!selectedAnnouncement.isRead ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-lg shadow-blue-500/30">
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
                          setIsDetailOpen(false);
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
                      <div className="absolute inset-y-0 left-0 w-1 rounded-full bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-500" />
                      <div className="pl-6">
                        <AnnouncementContent content={selectedAnnouncement.content} />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        如需完整处理公告，可进入公告中心查看历史记录与已读状态
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDetailOpen(false);
                            setSelectedAnnouncement(null);
                          }}
                          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                        >
                          关闭
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDetailOpen(false);
                            setSelectedAnnouncement(null);
                            setIsListOpen(false);
                            navigate('/office/announcement');
                          }}
                          className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] hover:shadow-xl"
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
        onClick={() => setIsListOpen(true)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-all hover:scale-[1.03] hover:bg-slate-100 ${
          unreadCount > 0 ? 'text-blue-600' : ''
        }`}
        aria-label="公告中心"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        ) : null}
      </button>

      {modal}
    </>
  );
};

