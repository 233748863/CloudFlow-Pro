import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Mail, AlertCircle, CheckCircle, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { getNoticeList, markNoticeRead, deleteNotice, getUnreadCount } from '@/services/api/notice';
import type { Notice } from '@/services/api/notice';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';

type TabType = 'all' | 'unread' | 'read';

export const MobileMessages: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedMessage, setSelectedMessage] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // 获取消息列表
  const fetchMessages = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.allSettled([
        getNoticeList({ pageNum: 1, pageSize: 50 }),
        getUnreadCount(),
      ]);

      if (listRes.status === 'fulfilled' && listRes.value) {
        const data = listRes.value;
        setMessages(Array.isArray(data) ? data : (data.records || []));
      }

      if (countRes.status === 'fulfilled' && typeof countRes.value === 'number') {
        setUnreadCount(countRes.value);
      }
    } catch (err: any) {
      toast.error(err.message || '加载消息失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // 下拉刷新
  const handleRefresh = async () => {
    await fetchMessages();
    toast.success('刷新成功');
  };

  const { isRefreshing, pullDistance, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 标记已读
  const handleMarkRead = async (notice: Notice) => {
    if (notice.isRead) return;
    try {
      await markNoticeRead(notice.id);
      setMessages(prev =>
        prev.map(m => (m.id === notice.id ? { ...m, isRead: true } : m))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (selectedMessage?.id === notice.id) {
        setSelectedMessage({ ...notice, isRead: true });
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, '标记已读失败'));
    }
  };

  // 删除消息
  const handleDelete = async (noticeId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeleting(noticeId);
    try {
      await deleteNotice(noticeId);
      const deleted = messages.find(m => m.id === noticeId);
      setMessages(prev => prev.filter(m => m.id !== noticeId));
      if (deleted && !deleted.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      if (selectedMessage?.id === noticeId) {
        setSelectedMessage(null);
      }
      toast.success('删除成功');
    } catch (err: any) {
      toast.error(getErrorMessage(err, '删除失败'));
    } finally {
      setDeleting(null);
    }
  };

  // 打开消息详情
  const handleOpenMessage = (notice: Notice) => {
    setSelectedMessage(notice);
    if (!notice.isRead) {
      handleMarkRead(notice);
    }
  };

  // 过滤消息
  const filteredMessages = messages.filter(m => {
    if (activeTab === 'unread') return !m.isRead;
    if (activeTab === 'read') return m.isRead;
    return true;
  });

  // 获取消息类型图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'system':
        return <AlertCircle size={16} className="text-orange-500" />;
      case 'task':
        return <CheckCircle size={16} className="text-green-500" />;
      default:
        return <Mail size={16} className="text-pink-400" />;
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return timeStr;
    }
  };

  // 消息详情视图
  if (selectedMessage) {
    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button
            onClick={() => setSelectedMessage(null)}
            className="p-1 -ml-1"
            aria-label="返回"
          >
            <ChevronLeft size={24} className="text-slate-600" />
          </button>
          <h1 className="text-lg font-semibold text-slate-900 truncate flex-1">消息详情</h1>
          <button
            onClick={() => handleDelete(selectedMessage.id)}
            className="p-2 text-red-500"
            aria-label="删除消息"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              {getTypeIcon(selectedMessage.type)}
              <span className="text-xs text-slate-400">{selectedMessage.type || '通知'}</span>
              <span className="text-xs text-slate-400 ml-auto">
                {formatTime(selectedMessage.createTime)}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">{selectedMessage.title}</h2>
            {selectedMessage.sender && (
              <p className="text-sm text-slate-500 mb-3">发送人：{selectedMessage.sender}</p>
            )}
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {selectedMessage.content}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="animate-spin text-pink-500 mx-auto mb-3" size={32} />
          <p className="text-sm text-slate-500">加载消息...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* Pull to Refresh */}
      {isPulling && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-20"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="bg-white rounded-full p-2 shadow-lg">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-pink-500" size={24} />
            ) : (
              <RefreshCw
                className="text-pink-500 transition-transform"
                size={24}
                style={{ transform: `rotate(${Math.min((pullDistance / 80) * 360, 360)}deg)` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900 flex-1">消息通知</h1>
        <div className="relative">
          <Bell size={20} className="text-slate-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-[10px] text-white font-bold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 flex gap-6">
        {(['all', 'unread', 'read'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-pink-500 text-pink-500'
                : 'border-transparent text-slate-500'
            }`}
          >
            {tab === 'all' ? '全部' : tab === 'unread' ? '未读' : '已读'}
            {tab === 'unread' && unreadCount > 0 && (
              <span className="ml-1 text-xs">({unreadCount})</span>
            )}
          </button>
        ))}
      </div>

      {/* Message List */}
      <div className="p-4 space-y-3">
        {filteredMessages.length > 0 ? (
          filteredMessages.map(message => (
            <div
              key={message.id}
              onClick={() => handleOpenMessage(message)}
              className={`bg-white rounded-lg p-4 shadow-sm border transition-colors active:bg-slate-50 ${
                message.isRead ? 'border-slate-100' : 'border-pink-100 bg-pink-50/30'
              }`}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">{getTypeIcon(message.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3
                      className={`text-sm font-medium truncate ${
                        message.isRead ? 'text-slate-700' : 'text-slate-900'
                      }`}
                    >
                      {message.title}
                    </h3>
                    {!message.isRead && (
                      <span className="flex-shrink-0 w-2 h-2 bg-pink-500 rounded-full mt-1.5"></span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-2">{message.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{formatTime(message.createTime)}</span>
                    <button
                      onClick={e => handleDelete(message.id, e)}
                      disabled={deleting === message.id}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      aria-label="删除消息"
                    >
                      {deleting === message.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg p-12 text-center">
            <Mail size={48} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {activeTab === 'unread' ? '暂无未读消息' : activeTab === 'read' ? '暂无已读消息' : '暂无消息'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
