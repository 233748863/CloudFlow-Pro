import React, { useState, useEffect } from 'react';
import { Announcement, AnnouncementType, AnnouncementScope, Role } from '../types';
import { getMyAnnouncements, markAnnouncementRead, publishAnnouncement, getAnnouncementList } from '../services/api/announcement';
import { useAuth } from '../context/AuthContext';
import { Bell, Megaphone, AlertCircle, Eye, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';

export const AnnouncementPage = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState<'unread' | 'read' | 'manage'>('unread');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  
  // Publish Modal State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishForm, setPublishForm] = useState<Partial<Announcement>>({
      type: AnnouncementType.NOTIFICATION,
      scopeType: AnnouncementScope.ALL,
      priority: 'M',
      content: ''
  });

  const fetchAnnouncements = async () => {
      try {
          if (activeTab === 'manage') {
              const list = await getAnnouncementList();
              setAnnouncements(Array.isArray(list) ? list : []);
          } else {
              const list = await getMyAnnouncements();
              setAnnouncements(Array.isArray(list) ? list : []);
          }
      } catch (e) {
          console.error("Fetch announcements failed", e);
          setAnnouncements([]);
      }
  };

  useEffect(() => {
      if (user) fetchAnnouncements();
  }, [user, activeTab]);

  const handleRead = async (announcement: Announcement) => {
      setSelectedAnnouncement(announcement);
      if (!announcement.isRead) {
          try {
              await markAnnouncementRead(announcement.announcementId);
              // Optimistic update
              setAnnouncements(prev => prev.map(a => 
                  a.announcementId === announcement.announcementId ? { ...a, isRead: true } : a
              ));
              // Trigger global event if needed to update navbar badge
          } catch (e) {
              console.error("Mark read failed", e);
          }
      }
  };

  const handlePublish = async () => {
      if (!publishForm.title || !publishForm.content) {
          toast.error("标题和内容不能为空");
          return;
      }
      try {
          await publishAnnouncement(publishForm);
          toast.success("发布成功");
          setIsPublishModalOpen(false);
          setPublishForm({
              type: AnnouncementType.NOTIFICATION,
              scopeType: AnnouncementScope.ALL,
              priority: 'M',
              content: ''
          });
          if (activeTab === 'manage') fetchAnnouncements();
      } catch (e) {
          toast.error("发布失败");
      }
  };

  // Filter lists
  const displayList = announcements.filter(a => {
      if (activeTab === 'manage') return true;
      if (activeTab === 'unread') return !a.isRead;
      if (activeTab === 'read') return a.isRead;
      return true;
  });

  const getTypeIcon = (type: AnnouncementType) => {
      switch(type) {
          case AnnouncementType.NOTIFICATION: return <Bell size={18} className="text-blue-500" />;
          case AnnouncementType.ANNOUNCEMENT: return <Megaphone size={18} className="text-indigo-500" />;
          case AnnouncementType.URGENT: return <AlertCircle size={18} className="text-red-500" />;
          default: return <Bell size={18} />;
      }
  };

  const getPriorityBadge = (p: string) => {
      if (p === 'H') return <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">紧急</span>;
      if (p === 'L') return <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded">低</span>;
      return null;
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Megaphone className="text-indigo-600" />
                公告中心
            </h2>
            
            {(user.role === Role.ADMIN || user.role === Role.HR) && (
                <button 
                    onClick={() => setIsPublishModalOpen(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
                >
                    <Plus size={18} />
                    发布公告
                </button>
            )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
            <div className="flex border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('unread')}
                    className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'unread' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    未读消息
                </button>
                <button 
                    onClick={() => setActiveTab('read')}
                    className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'read' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    历史消息
                </button>
                {(user.role === Role.ADMIN || user.role === Role.HR) && (
                    <button 
                        onClick={() => setActiveTab('manage')}
                        className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'manage' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        公告管理
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                {displayList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Bell size={48} className="mb-4 opacity-20" />
                        <p>暂无相关消息</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {displayList.map(item => (
                            <div 
                                key={item.announcementId}
                                onClick={() => handleRead(item)}
                                className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors flex gap-4 items-start group ${!item.isRead && activeTab !== 'manage' ? 'bg-indigo-50/30' : ''}`}
                            >
                                <div className="mt-1 flex-shrink-0">
                                    {getTypeIcon(item.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        {getPriorityBadge(item.priority)}
                                        <h3 className={`text-sm font-medium truncate ${!item.isRead ? 'text-slate-900 font-bold' : 'text-slate-600'}`}>
                                            {item.title}
                                        </h3>
                                        <span className="text-xs text-slate-400 ml-auto flex-shrink-0">
                                            {new Date(item.createTime).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 line-clamp-2" dangerouslySetInnerHTML={{ __html: item.content.replace(/<[^>]+>/g, '').substring(0, 100) }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Detail Modal */}
        {selectedAnnouncement && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                {getPriorityBadge(selectedAnnouncement.priority)}
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                    {selectedAnnouncement.scopeType === 'ALL' ? '全员' : '定向'}
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">{selectedAnnouncement.title}</h3>
                            <p className="text-xs text-slate-400 mt-1">发布时间: {new Date(selectedAnnouncement.createTime).toLocaleString()}</p>
                        </div>
                        <button onClick={() => setSelectedAnnouncement(null)} className="text-slate-400 hover:text-slate-600">
                            <span className="text-2xl">&times;</span>
                        </button>
                    </div>
                    <div className="p-6 overflow-y-auto prose prose-sm max-w-none text-slate-600">
                        <div dangerouslySetInnerHTML={{ __html: selectedAnnouncement.content }} />
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
                        <button 
                            onClick={() => setSelectedAnnouncement(null)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
                        >
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Publish Modal */}
        {isPublishModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800">发布新公告</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">标题</label>
                            <input 
                                type="text" 
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                value={publishForm.title || ''}
                                onChange={e => setPublishForm({...publishForm, title: e.target.value})}
                                placeholder="请输入公告标题"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={publishForm.type}
                                    onChange={e => setPublishForm({...publishForm, type: e.target.value as any})}
                                >
                                    <option value={AnnouncementType.NOTIFICATION}>通知</option>
                                    <option value={AnnouncementType.ANNOUNCEMENT}>公告</option>
                                    <option value={AnnouncementType.URGENT}>紧急</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={publishForm.priority}
                                    onChange={e => setPublishForm({...publishForm, priority: e.target.value as any})}
                                >
                                    <option value="L">低</option>
                                    <option value="M">中</option>
                                    <option value="H">高</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">发布范围</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={publishForm.scopeType}
                                    onChange={e => setPublishForm({...publishForm, scopeType: e.target.value as any})}
                                >
                                    <option value={AnnouncementScope.ALL}>全员</option>
                                    <option value={AnnouncementScope.DEPT}>部门</option>
                                    <option value={AnnouncementScope.ROLE}>角色</option>
                                </select>
                            </div>
                        </div>
                        
                        {(publishForm.scopeType === AnnouncementScope.DEPT || publishForm.scopeType === AnnouncementScope.ROLE) && (
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {publishForm.scopeType === AnnouncementScope.DEPT ? '部门ID' : '角色ID'}
                                </label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={publishForm.scopeValue || ''}
                                    onChange={e => setPublishForm({...publishForm, scopeValue: e.target.value})}
                                    placeholder="请输入ID"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">内容 (支持 HTML)</label>
                            <textarea 
                                className="w-full border border-slate-300 rounded-lg p-2 h-32 font-mono text-sm"
                                value={publishForm.content || ''}
                                onChange={e => setPublishForm({...publishForm, content: e.target.value})}
                                placeholder="<p>请输入公告内容...</p>"
                            />
                            <p className="text-xs text-slate-400 mt-1">注：当前版本仅支持输入 HTML 源码或纯文本。</p>
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
                        <button 
                            onClick={() => setIsPublishModalOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handlePublish}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                        >
                            发布
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
