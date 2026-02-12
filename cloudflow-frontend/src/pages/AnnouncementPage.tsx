import React, { useState, useEffect } from 'react';
import { Announcement, AnnouncementType, AnnouncementScope, Role } from '../types';
import { 
  getMyAnnouncements, 
  markAnnouncementRead, 
  publishAnnouncement, 
  getManageList,
  updateAnnouncement,
  deleteAnnouncement,
  revokeAnnouncement,
  toggleTop,
  getReadStats
} from '../services/api/announcement';
import { useAuth } from '../context/AuthContext';
import { Bell, Megaphone, AlertCircle, Eye, Plus, Edit, Trash2, X, Pin, Users, Search, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export const AnnouncementPage = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeTab, setActiveTab] = useState<'unread' | 'read' | 'manage'>('unread');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  
  // Publish/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<Partial<Announcement>>({
      type: AnnouncementType.NOTIFICATION,
      scopeType: AnnouncementScope.ALL,
      priority: 'M',
      content: '',
      isTop: 0
  });

  // Read Stats Modal State
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsData, setStatsData] = useState<{ readCount: number; readUsers: any[] } | null>(null);

  // Manage List State
  const [manageList, setManageList] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [searchTitle, setSearchTitle] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchAnnouncements = async () => {
      try {
          if (activeTab === 'manage') {
              const result = await getManageList({
                  title: searchTitle,
                  type: filterType,
                  status: filterStatus,
                  page: currentPage,
                  size: pageSize
              });
              setManageList(result.list);
              setTotal(result.total);
          } else {
              const list = await getMyAnnouncements();
              setAnnouncements(Array.isArray(list) ? list : []);
          }
      } catch (e) {
          console.error("获取公告失败", e);
          if (activeTab === 'manage') {
              setManageList([]);
          } else {
              setAnnouncements([]);
          }
      }
  };

  useEffect(() => {
      if (user) {
          fetchAnnouncements();
      }
  }, [user, activeTab, currentPage, searchTitle, filterType, filterStatus]);

  const handleRead = async (announcement: Announcement) => {
      setSelectedAnnouncement(announcement);
      if (!announcement.isRead) {
          try {
              await markAnnouncementRead(announcement.announcementId.toString());
              await fetchAnnouncements();
              // 触发自定义事件通知 MainLayout 更新未读数量
              window.dispatchEvent(new Event('announcementRead'));
          } catch (e) {
              console.error("标记已读失败", e);
          }
      }
  };

  const handlePublish = async () => {
      if (!formData.title || !formData.content) {
          toast.error("标题和内容不能为空");
          return;
      }
      try {
          if (modalMode === 'create') {
              await publishAnnouncement(formData);
              toast.success("发布成功");
          } else {
              await updateAnnouncement(formData);
              toast.success("更新成功");
          }
          setIsModalOpen(false);
          resetForm();
          if (activeTab === 'manage') fetchAnnouncements();
      } catch (e) {
          toast.error(modalMode === 'create' ? "发布失败" : "更新失败");
      }
  };

  const handleEdit = (announcement: Announcement) => {
      setModalMode('edit');
      setFormData(announcement);
      setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
      if (!confirm('确定要删除这条公告吗？')) return;
      try {
          await deleteAnnouncement(id);
          toast.success("删除成功");
          fetchAnnouncements();
      } catch (e) {
          toast.error("删除失败");
      }
  };

  const handleRevoke = async (id: number) => {
      if (!confirm('确定要撤销这条公告吗？')) return;
      try {
          await revokeAnnouncement(id);
          toast.success("撤销成功");
          fetchAnnouncements();
      } catch (e) {
          toast.error("撤销失败");
      }
  };

  const handleToggleTop = async (id: number) => {
      try {
          await toggleTop(id);
          toast.success("置顶状态已更新");
          fetchAnnouncements();
      } catch (e) {
          toast.error("操作失败");
      }
  };

  const handleViewStats = async (id: number) => {
      try {
          const stats = await getReadStats(id);
          setStatsData(stats);
          setIsStatsModalOpen(true);
      } catch (e) {
          toast.error("获取统计失败");
      }
  };

  const resetForm = () => {
      setFormData({
          type: AnnouncementType.NOTIFICATION,
          scopeType: AnnouncementScope.ALL,
          priority: 'M',
          content: '',
          isTop: 0
      });
      setModalMode('create');
  };

  const handleSearch = () => {
      setCurrentPage(1);
      fetchAnnouncements();
  };

  const handleReset = () => {
      setSearchTitle('');
      setFilterType('');
      setFilterStatus('');
      setCurrentPage(1);
  };

  // Filter lists
  const displayList = announcements.filter(a => {
      if (activeTab === 'unread') return !a.isRead;
      if (activeTab === 'read') return a.isRead;
      return true;
  });

  const unreadCount = announcements.filter(a => !a.isRead).length;

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

  const getStatusBadge = (status: string) => {
      if (status === '0') return <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">草稿</span>;
      if (status === '1') return <span className="bg-green-100 text-green-600 text-xs px-2 py-0.5 rounded">已发布</span>;
      if (status === '2') return <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">已撤销</span>;
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
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
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
                    className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 relative ${activeTab === 'unread' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    未读消息
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {unreadCount}
                        </span>
                    )}
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

            {activeTab === 'manage' ? (
                <div className="flex-1 flex flex-col">
                    <div className="p-4 border-b border-slate-200 bg-slate-50">
                        <div className="flex gap-3">
                            <input
                                type="text"
                                placeholder="搜索标题..."
                                value={searchTitle}
                                onChange={(e) => setSearchTitle(e.target.value)}
                                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="">所有类型</option>
                                <option value="1">通知</option>
                                <option value="2">公告</option>
                                <option value="3">紧急</option>
                            </select>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="">所有状态</option>
                                <option value="0">草稿</option>
                                <option value="1">已发布</option>
                                <option value="2">已撤销</option>
                            </select>
                            <button
                                onClick={handleSearch}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 text-sm"
                            >
                                <Search size={16} />
                                搜索
                            </button>
                            <button
                                onClick={handleReset}
                                className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm"
                            >
                                <RotateCcw size={16} />
                                重置
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">标题</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">类型</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">优先级</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">已读人数</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">发布时间</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {manageList.map(item => (
                                    <tr key={item.announcementId} className="hover:bg-slate-50">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {item.isTop === 1 && <Pin size={14} className="text-red-500" />}
                                                <span className="text-sm text-slate-900">{item.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                {getTypeIcon(item.type)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                                        <td className="px-4 py-3">{getPriorityBadge(item.priority)}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleViewStats(item.announcementId)}
                                                className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center gap-1"
                                            >
                                                <Users size={14} />
                                                查看
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            {item.publishTime ? new Date(item.publishTime).toLocaleString() : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleRead(item)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title="查看"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-green-600 hover:text-green-800"
                                                    title="编辑"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleTop(item.announcementId)}
                                                    className={item.isTop === 1 ? "text-red-600 hover:text-red-800" : "text-slate-400 hover:text-slate-600"}
                                                    title={item.isTop === 1 ? "取消置顶" : "置顶"}
                                                >
                                                    <Pin size={16} />
                                                </button>
                                                {item.status === '1' && (
                                                    <button
                                                        onClick={() => handleRevoke(item.announcementId)}
                                                        className="text-orange-600 hover:text-orange-800"
                                                        title="撤销"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(item.announcementId)}
                                                    className="text-red-600 hover:text-red-800"
                                                    title="删除"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-sm text-slate-600">共 {total} 条</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                            >
                                上一页
                            </button>
                            <span className="px-3 py-1 text-sm">第 {currentPage} 页</span>
                            <button
                                onClick={() => setCurrentPage(p => p + 1)}
                                disabled={currentPage * pageSize >= total}
                                className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
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
                                    className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors flex gap-4 items-start group ${!item.isRead ? 'bg-indigo-50/30' : ''}`}
                                >
                                    <div className="mt-1 flex-shrink-0">
                                        {getTypeIcon(item.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {item.isTop === 1 && <Pin size={14} className="text-red-500" />}
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
            )}
        </div>

        {selectedAnnouncement && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                {selectedAnnouncement.isTop === 1 && <Pin size={14} className="text-red-500" />}
                                {getPriorityBadge(selectedAnnouncement.priority)}
                                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                    {selectedAnnouncement.scopeType === 'ALL' ? '全员' : '定向'}
                                </span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">{selectedAnnouncement.title}</h3>
                            <div className="text-xs text-slate-400 mt-2 space-y-1">
                                <p>发布时间: {selectedAnnouncement.publishTime ? new Date(selectedAnnouncement.publishTime).toLocaleString() : new Date(selectedAnnouncement.createTime).toLocaleString()}</p>
                                {selectedAnnouncement.expireTime && (
                                    <p>有效期至: {new Date(selectedAnnouncement.expireTime).toLocaleString()}</p>
                                )}
                            </div>
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

        {isModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800">
                            {modalMode === 'create' ? '发布新公告' : '编辑公告'}
                        </h3>
                    </div>
                    <div className="p-6 space-y-4 overflow-y-auto">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">标题</label>
                            <input 
                                type="text" 
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                value={formData.title || ''}
                                onChange={e => setFormData({...formData, title: e.target.value})}
                                placeholder="请输入公告标题"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={formData.type}
                                    onChange={e => setFormData({...formData, type: e.target.value as any})}
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
                                    value={formData.priority}
                                    onChange={e => setFormData({...formData, priority: e.target.value as any})}
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
                                    value={formData.scopeType}
                                    onChange={e => setFormData({...formData, scopeType: e.target.value as any})}
                                >
                                    <option value={AnnouncementScope.ALL}>全员</option>
                                    <option value={AnnouncementScope.DEPT}>部门</option>
                                    <option value={AnnouncementScope.ROLE}>角色</option>
                                </select>
                            </div>
                        </div>
                        
                        {(formData.scopeType === AnnouncementScope.DEPT || formData.scopeType === AnnouncementScope.ROLE) && (
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {formData.scopeType === AnnouncementScope.DEPT ? '部门ID' : '角色ID'}
                                </label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={formData.scopeValue || ''}
                                    onChange={e => setFormData({...formData, scopeValue: e.target.value})}
                                    placeholder="请输入ID"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">过期时间（可选）</label>
                                <input 
                                    type="datetime-local" 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={formData.expireTime ? new Date(formData.expireTime).toISOString().slice(0, 16) : ''}
                                    onChange={e => setFormData({...formData, expireTime: e.target.value || undefined})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">置顶</label>
                                <div className="flex items-center h-10">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.isTop === 1}
                                        onChange={e => setFormData({...formData, isTop: e.target.checked ? 1 : 0})}
                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                    />
                                    <label className="ml-2 text-sm text-slate-700">设为置顶</label>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">内容 (支持 HTML)</label>
                            <textarea 
                                className="w-full border border-slate-300 rounded-lg p-2 h-32 font-mono text-sm"
                                value={formData.content || ''}
                                onChange={e => setFormData({...formData, content: e.target.value})}
                                placeholder="请输入公告内容，支持 HTML 格式"
                            />
                        </div>
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
                        <button 
                            onClick={() => { setIsModalOpen(false); resetForm(); }}
                            className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handlePublish}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
                        >
                            {modalMode === 'create' ? '发布' : '保存'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isStatsModalOpen && statsData && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800">阅读统计</h3>
                        <button onClick={() => setIsStatsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                            <span className="text-2xl">&times;</span>
                        </button>
                    </div>
                    <div className="p-6">
                        <div className="text-center mb-4">
                            <div className="text-3xl font-bold text-indigo-600">{statsData.readCount}</div>
                            <div className="text-sm text-slate-500">已读人数</div>
                        </div>
                        {statsData.readUsers.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-medium text-slate-700 mb-2">已读用户列表</h4>
                                <div className="max-h-48 overflow-y-auto space-y-2">
                                    {statsData.readUsers.map((user: any, idx: number) => (
                                        <div key={idx} className="text-xs text-slate-600 flex justify-between">
                                            <span>用户 ID: {user.userId}</span>
                                            <span>{new Date(user.readTime).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
                        <button 
                            onClick={() => setIsStatsModalOpen(false)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
                        >
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
