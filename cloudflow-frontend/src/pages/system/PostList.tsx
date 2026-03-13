import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPostList, addPost, updatePost, deletePost, type SysPost } from '../../services/api/system';
import { Input, TableHead, TableHeader, TableActionHead } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';

export const PostList = () => {
  const [posts, setPosts] = useState<SysPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SysPost | null>(null);
  const [formData, setFormData] = useState<SysPost>({
    postCode: '', postName: '', postSort: 0, status: '0', remark: '',
  });

  useEffect(() => { fetchPosts(); }, []);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res: any = await getPostList({ postName: searchTerm || undefined });
      // 兼容分页和数组两种返回格式
      const list = Array.isArray(res) ? res : (res?.records || res?.rows || []);
      setPosts(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); fetchPosts(); };

  const handleOpenModal = (post?: SysPost) => {
    if (post) {
      setEditingPost(post);
      setFormData({ ...post });
    } else {
      setEditingPost(null);
      setFormData({ postCode: '', postName: '', postSort: 0, status: '0', remark: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.postCode.trim()) { toast.error('请输入岗位编码'); return; }
    if (!formData.postName.trim()) { toast.error('请输入岗位名称'); return; }
    try {
      if (editingPost) {
        await updatePost({ ...formData, postId: editingPost.postId });
        toast.success('岗位更新成功');
      } else {
        await addPost(formData);
        toast.success('岗位创建成功');
      }
      setIsModalOpen(false);
      fetchPosts();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (postId: number) => {
    if (!window.confirm('确认删除该岗位吗？')) return;
    try {
      await deletePost([postId]);
      toast.success('岗位删除成功');
      fetchPosts();
    } catch (e) {
      console.error(e);
    }
  };

  const isEdit = !!editingPost;

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">岗位管理</h1>
        <button onClick={() => handleOpenModal()} className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors">
          <Plus size={18} /> 新增岗位
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input type="text" placeholder="搜索岗位名称..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <button type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition-colors">搜索</button>
        </form>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full">
            <TableHeader>
              <tr>
                <TableHead className="px-6 py-3 text-left">ID</TableHead>
                <TableHead className="px-6 py-3 text-left">岗位编码</TableHead>
                <TableHead className="px-6 py-3 text-left">岗位名称</TableHead>
                <TableHead className="px-6 py-3 text-left">排序</TableHead>
                <TableHead className="px-6 py-3 text-left">状态</TableHead>
                <TableHead className="px-6 py-3 text-left">创建时间</TableHead>
                <TableActionHead className="px-6 py-3 w-48">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500"><Loader2 className="animate-spin inline mr-2" size={18} />加载中...</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">暂无数据</td></tr>
              ) : posts.map(post => (
                <tr key={post.postId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{post.postId}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{post.postCode}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{post.postName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{post.postSort}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${post.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {post.status === '0' ? '正常' : '停用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{post.createTime || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        {
                          label: '编辑',
                          icon: <Edit size={14} />,
                          onClick: () => handleOpenModal(post),
                          tone: 'primary',
                        },
                        {
                          label: '删除',
                          icon: <Trash2 size={14} />,
                          onClick: () => handleDelete(post.postId!),
                          tone: 'danger',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑岗位' : '新增岗位'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">岗位编码 <span className="text-red-500">*</span></label>
                  <Input value={formData.postCode} onChange={e => setFormData({ ...formData, postCode: e.target.value })} placeholder="如: CEO, CTO" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">岗位名称 <span className="text-red-500">*</span></label>
                  <Input value={formData.postName} onChange={e => setFormData({ ...formData, postName: e.target.value })} placeholder="岗位名称" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">显示排序</label>
                  <Input type="number" value={formData.postSort} onChange={e => setFormData({ ...formData, postSort: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                  <div className="flex gap-4 pt-2">
                    {[['0', '正常'], ['1', '停用']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={formData.status === v} onChange={() => setFormData({ ...formData, status: v })} className="accent-pink-500" />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none resize-none" rows={2} value={formData.remark || ''} onChange={e => setFormData({ ...formData, remark: e.target.value })} placeholder="备注信息" />
              </div>
            </form>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
              <button type="button" onClick={e => handleSubmit(e as any)} className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors shadow-sm">{isEdit ? '保存修改' : '立即创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
