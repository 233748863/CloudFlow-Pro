import React, { useState, useEffect } from 'react';
import { BookUser, Search, RotateCcw, Phone, Mail, Building2, User } from 'lucide-react';
import { contactApi, Contact, DeptNode } from '../services/api/contact';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { WorkspaceEmptyPanel, WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';

/** 通讯录/企业黄页页面 */
export const ContactPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [depts, setDepts] = useState<DeptNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<number | undefined>();
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);

  useEffect(() => { loadDepts(); }, []);
  useEffect(() => { fetchContacts(); }, [keyword, selectedDeptId, pageNum]);

  const loadDepts = async () => {
    try {
      const res = await contactApi.deptTree();
      if (res) setDepts(Array.isArray(res) ? res : []);
    } catch { /* 静默处理 */ }
  };

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await contactApi.list({ keyword, deptId: selectedDeptId, pageNum, pageSize: 20 });
      if (res) { setContacts(res.records || res.rows || []); setTotal(res.total || 0); }
    } catch (error) { toast.error(getErrorMessage(error, '获取通讯录失败')); } finally { setLoading(false); }
  };

  const handleViewUser = async (userId: number) => {
    try {
      const res = await contactApi.getUserDetail(userId);
      if (res) setSelectedUser(res);
    } catch (error) { toast.error(getErrorMessage(error, '获取用户详情失败')); }
  };

  // 构建部门树（简单的一级展示）
  const topDepts = depts.filter(d => d.parent_id === 0 || d.parent_id === 100);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookUser className="text-pink-500" /> 企业通讯录
        </h2>
      </div>

      <div className="flex gap-6">
        {/* 左侧部门导航 */}
        <div className="w-56 bg-white rounded-xl shadow-sm border border-slate-200 p-4 shrink-0 self-start">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">部门</h3>
          <div className="space-y-1">
            <button
              onClick={() => { setSelectedDeptId(undefined); setPageNum(1); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedDeptId ? 'bg-pink-50 text-pink-600 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              全部部门
            </button>
            {topDepts.map(dept => (
              <button
                key={dept.dept_id}
                onClick={() => { setSelectedDeptId(dept.dept_id); setPageNum(1); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedDeptId === dept.dept_id ? 'bg-pink-50 text-pink-600 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Building2 size={14} className="inline mr-2 opacity-50" />
                {dept.dept_name}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧联系人列表 */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* 搜索栏 */}
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索姓名、用户名或手机号..."
                value={keyword}
                onChange={e => { setKeyword(e.target.value); setPageNum(1); }}
                className="w-full border border-slate-300 rounded-lg pl-10 pr-3 py-2 text-sm"
              />
            </div>
            <button onClick={() => { setKeyword(''); setSelectedDeptId(undefined); setPageNum(1); }} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-300 text-sm">
              <RotateCcw size={16} />重置
            </button>
          </div>

          {/* 联系人卡片网格 */}
          <div className="p-4">
            {loading ? (
              <WorkspaceInlineState type="loading" title="正在加载通讯录..." className="py-12" />
            ) : contacts.length === 0 ? (
              <WorkspaceEmptyPanel
                variant="glass"
                icon={<BookUser size={28} />}
                title="暂无联系人"
                description="当前筛选条件下没有匹配的联系人，试试切换部门或关键词。"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contacts.map(contact => (
                  <div
                    key={contact.user_id}
                    onClick={() => handleViewUser(contact.user_id)}
                    className="border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-pink-100 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={contact.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.nick_name}`}
                        className="w-12 h-12 rounded-full border border-slate-200"
                        alt=""
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm">{contact.nick_name}</div>
                        <div className="text-xs text-slate-500">{contact.post_name || '员工'}</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Building2 size={12} className="text-pink-400" />
                        <span>{contact.dept_name || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Phone size={12} className="text-pink-400" />
                        <span>{contact.phonenumber || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Mail size={12} className="text-pink-400" />
                        <span>{contact.email || '-'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 分页 */}
          <div className="p-4 border-t border-slate-200 flex justify-between items-center">
            <span className="text-sm text-slate-600">共 {total} 人</span>
            <div className="flex gap-2">
              <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum === 1} className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50">上一页</button>
              <span className="px-3 py-1 text-sm">第 {pageNum} 页</span>
              <button onClick={() => setPageNum(p => p + 1)} disabled={pageNum * 20 >= total} className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50">下一页</button>
            </div>
          </div>
        </div>
      </div>

      {/* 用户详情弹窗 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <img
                src={selectedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.nick_name}`}
                className="w-20 h-20 rounded-full border-2 border-pink-100 mx-auto mb-3"
                alt=""
              />
              <h3 className="text-lg font-bold text-slate-800">{selectedUser.nick_name}</h3>
              <p className="text-sm text-slate-500">{selectedUser.post_name || '员工'}</p>
            </div>
            <div className="px-6 pb-6 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Building2 size={16} className="text-pink-400" />
                <div><div className="text-xs text-slate-500">部门</div><div className="text-sm text-slate-800">{selectedUser.dept_name || '-'}</div></div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Phone size={16} className="text-pink-400" />
                <div><div className="text-xs text-slate-500">电话</div><div className="text-sm text-slate-800">{selectedUser.phonenumber || '-'}</div></div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Mail size={16} className="text-pink-400" />
                <div><div className="text-xs text-slate-500">邮箱</div><div className="text-sm text-slate-800">{selectedUser.email || '-'}</div></div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <User size={16} className="text-pink-400" />
                <div><div className="text-xs text-slate-500">用户名</div><div className="text-sm text-slate-800">{selectedUser.user_name || '-'}</div></div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedUser(null)} className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactPage;
