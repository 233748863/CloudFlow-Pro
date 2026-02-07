import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getUserList, addUser, updateUser, deleteUser, getRoleList } from '../../services/api/auth';

export const UserList = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    userName: '',
    nickName: '',
    email: '',
    phonenumber: '',
    password: '',
    roleIds: [] as number[],
    status: '0'
  });

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await getUserList({ userName: searchTerm });
      setUsers(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await getRoleList();
      setRoles(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const handleOpenModal = (user?: any) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        userName: user.userName,
        nickName: user.nickName,
        email: user.email,
        phonenumber: user.phonenumber,
        password: '', // Don't show password
        roleIds: user.roleIds || [],
        status: user.status
      });
    } else {
      setEditingUser(null);
      setFormData({
        userName: '',
        nickName: '',
        email: '',
        phonenumber: '',
        password: '',
        roleIds: [],
        status: '0'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await updateUser({ ...formData, userId: editingUser.userId });
        toast.success('用户更新成功');
      } else {
        await addUser(formData);
        toast.success('用户创建成功');
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (userId: number) => {
    if (window.confirm('确认删除该用户吗？')) {
      try {
        await deleteUser([userId]);
        toast.success('用户删除成功');
        fetchUsers();
      } catch (error) {
        console.error(error);
      }
    }
  };

  const toggleRoleSelection = (roleId: number) => {
    const currentRoles = formData.roleIds || [];
    if (currentRoles.includes(roleId)) {
      setFormData({ ...formData, roleIds: currentRoles.filter(id => id !== roleId) });
    } else {
      setFormData({ ...formData, roleIds: [...currentRoles, roleId] });
    }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">用户管理</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        >
          <Plus size={18} /> 新增用户
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="搜索用户名..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition-colors">
            搜索
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">用户名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">昵称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">加载中...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">暂无数据</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.userId} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.userId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 flex items-center gap-2">
                       <img src={user.avatar} className="w-6 h-6 rounded-full" alt=""/>
                       {user.userName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.nickName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {user.role ? (
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">{user.role}</span>
                        ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.status === '0' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 flex gap-3">
                      <button onClick={() => handleOpenModal(user)} className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1">
                        <Edit size={16} /> 编辑
                      </button>
                      <button onClick={() => handleDelete(user.userId)} className="text-red-600 hover:text-red-900 flex items-center gap-1">
                        <Trash2 size={16} /> 删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingUser ? '编辑用户' : '新增用户'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.userName}
                  onChange={e => setFormData({...formData, userName: e.target.value})}
                  disabled={!!editingUser} // Cannot change username
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">昵称</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.nickName}
                  onChange={e => setFormData({...formData, nickName: e.target.value})}
                />
              </div>

              {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
                    <input 
                      type="password" 
                      required={!editingUser}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      placeholder="默认 123456"
                    />
                  </div>
              )}

              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">分配角色</label>
                 <div className="flex flex-wrap gap-2">
                     {roles.map(role => (
                         <button
                            type="button"
                            key={role.roleId}
                            onClick={() => toggleRoleSelection(role.roleId)}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                formData.roleIds.includes(role.roleId) 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                            }`}
                         >
                             {role.roleName}
                         </button>
                     ))}
                 </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  value={formData.status}
                  onChange={e => setFormData({...formData, status: e.target.value})}
                >
                  <option value="0">正常</option>
                  <option value="1">停用</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  {editingUser ? '保存修改' : '立即创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
