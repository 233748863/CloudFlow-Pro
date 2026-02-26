import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Search, X, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { toast } from 'sonner';
import { getUserList, addUser, updateUser, deleteUser, getRoleList, getDeptTree } from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { hashPassword } from '../../utils/crypto';
import { useMount } from '../../hooks/useMount';

interface DeptItem { deptId: number; parentId: number; deptName: string; orderNum: number; children?: DeptItem[]; }
interface RoleItem { roleId: number; roleName: string; roleKey: string; status: string; }
interface TenantItem { tenantId: number; tenantName: string; status: string; }

// 部门树扁平化
const flattenDepts = (depts: DeptItem[], level = 0): { dept: DeptItem; level: number }[] => {
  const result: { dept: DeptItem; level: number }[] = [];
  for (const d of depts) {
    result.push({ dept: d, level });
    if (d.children?.length) result.push(...flattenDepts(d.children, level + 1));
  }
  return result;
};

// 树选择下拉
const TreeSelect: React.FC<{ value: number | undefined; onChange: (v: number) => void; deptTree: DeptItem[]; placeholder?: string }> = ({ value, onChange, deptTree, placeholder = '请选择部门' }) => {
  const [open, setOpen] = useState(false);
  const flat = flattenDepts(deptTree);
  const selected = flat.find(f => f.dept.deptId === value);
  return (
    <div className="relative">
      <button type="button" className="w-full border border-slate-200 rounded-lg p-2.5 text-left text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none flex justify-between items-center bg-white" onClick={() => setOpen(!open)}>
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>{selected ? selected.dept.deptName : placeholder}</span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {flat.map(({ dept, level }) => (
            <button key={dept.deptId} className={`w-full text-left px-3 py-2 text-sm hover:bg-pink-50 ${value === dept.deptId ? 'bg-pink-50 text-pink-600 font-medium' : 'text-slate-700'}`}
              style={{ paddingLeft: `${level * 16 + 12}px` }} onClick={() => { onChange(dept.deptId); setOpen(false); }}>{dept.deptName}</button>
          ))}
          {flat.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">暂无部门</div>}
        </div>
      )}
    </div>
  );
};

export const UserList = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
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
    sex: '0',
    status: '0',
    deptId: undefined as number | undefined,
    tenantId: undefined as number | undefined,
    remark: '',
  });
  const [selRoles, setSelRoles] = useState<number[]>([]);

  useMount(() => {
    fetchUsers();
    fetchRoles();
    fetchDeptTree();
    fetchTenants();
  });

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
      const res: any = await getRoleList();
      setRoles(Array.isArray(res) ? res : (res?.rows || res?.records || []));
    } catch (error) {
      console.error(error);
    }
  };

  const fetchDeptTree = async () => {
    try {
      const res: any = await getDeptTree();
      setDeptTree(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTenants = async () => {
    try {
      const res: any = await getTenantList();
      setTenants(Array.isArray(res) ? res : (res?.rows || res?.records || []));
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
        userName: user.userName || '',
        nickName: user.nickName || '',
        email: user.email || '',
        phonenumber: user.phonenumber || '',
        password: '',
        sex: user.sex || '0',
        status: user.status || '0',
        deptId: user.deptId,
        tenantId: user.tenantId,
        remark: user.remark || '',
      });
      setSelRoles(user.roleIds || []);
    } else {
      setEditingUser(null);
      setFormData({
        userName: '',
        nickName: '',
        email: '',
        phonenumber: '',
        password: '',
        sex: '0',
        status: '0',
        deptId: undefined,
        tenantId: undefined,
        remark: '',
      });
      setSelRoles([]);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nickName?.trim()) { toast.error('请输入昵称'); return; }
    if (!editingUser && !formData.userName?.trim()) { toast.error('请输入用户名'); return; }

    try {
      if (editingUser) {
        const updateData: any = { ...formData, userId: editingUser.userId, roleIds: selRoles };
        if (updateData.password) {
          updateData.password = await hashPassword(updateData.password);
        } else {
          delete updateData.password;
        }
        await updateUser(updateData);
        toast.success('用户更新成功');
      } else {
        const createData: any = { ...formData, roleIds: selRoles };
        if (createData.password) {
          createData.password = await hashPassword(createData.password);
        } else {
          createData.password = await hashPassword('123456');
        }
        await addUser(createData);
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

  const toggleRole = (roleId: number) => {
    setSelRoles(prev => prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]);
  };

  const isEdit = !!editingUser;

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">用户管理</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors"
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
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-400 outline-none"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">租户</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">部门</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="animate-spin inline mr-2" size={18} />加载中...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">暂无数据</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.userId} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.userId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 flex items-center gap-2">
                       <div className="w-7 h-7 bg-pink-50 rounded-full flex items-center justify-center text-pink-600 text-xs font-bold flex-shrink-0">
                         {(user.nickName || user.userName || '?')[0]}
                       </div>
                       {user.userName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.nickName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {tenants.find(t => t.tenantId === user.tenantId)?.tenantName || '默认租户'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{user.deptName || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {user.role ? (
                            <span className="bg-pink-50 text-pink-600 px-2 py-0.5 rounded text-xs">{user.role}</span>
                        ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.status === '0' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 flex gap-3">
                      <button onClick={() => handleOpenModal(user)} className="text-pink-500 hover:text-pink-700 flex items-center gap-1">
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

      {/* Modal - 与组织架构页面统一的丰富表单 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑用户' : '新增用户'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* 昵称 + 用户名 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">昵称 <span className="text-red-500">*</span></label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.nickName}
                    onChange={e => setFormData({...formData, nickName: e.target.value})}
                    placeholder="用户昵称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">用户名 {!isEdit && <span className="text-red-500">*</span>}</label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.userName}
                    onChange={e => setFormData({...formData, userName: e.target.value})}
                    placeholder="用户名"
                    disabled={isEdit}
                  />
                </div>
              </div>

              {/* 归属部门 + 所属租户 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">归属部门</label>
                  <TreeSelect value={formData.deptId} onChange={v => setFormData({...formData, deptId: v})} deptTree={deptTree} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">所属租户</label>
                  <Select value={formData.tenantId ? String(formData.tenantId) : ''} onValueChange={v => setFormData({...formData, tenantId: v ? Number(v) : undefined})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择租户" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">请选择租户</SelectItem>
                      {tenants.map(tenant => (
                        <SelectItem key={tenant.tenantId} value={String(tenant.tenantId)}>
                          {tenant.tenantName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 密码（仅新增时显示） */}
              {!isEdit && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
                  <input 
                    type="password" 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="默认 123456"
                  />
                </div>
              )}

              {/* 手机 + 邮箱 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">手机</label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.phonenumber}
                    onChange={e => setFormData({...formData, phonenumber: e.target.value})}
                    placeholder="手机号"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
                  <input 
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    placeholder="邮箱"
                  />
                </div>
              </div>

              {/* 性别 + 状态 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">性别</label>
                  <div className="flex gap-4 pt-1">
                    {[['0', '男'], ['1', '女']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={formData.sex === v} onChange={() => setFormData({...formData, sex: v})} className="accent-pink-500" />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                  <div className="flex gap-4 pt-1">
                    {[['0', '正常'], ['1', '停用']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={formData.status === v} onChange={() => setFormData({...formData, status: v})} className="accent-pink-500" />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 角色 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">角色</label>
                <div className="flex flex-wrap gap-2">
                  {roles.map(role => (
                    <button
                      type="button"
                      key={role.roleId}
                      onClick={() => toggleRole(role.roleId)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selRoles.includes(role.roleId) 
                        ? 'bg-pink-50 text-pink-600 border-pink-200' 
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {selRoles.includes(role.roleId) && <Check size={12} className="inline mr-1" />}
                      {role.roleName}
                    </button>
                  ))}
                  {roles.length === 0 && <span className="text-xs text-slate-400">暂无角色</span>}
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <textarea 
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none resize-none"
                  rows={2}
                  value={formData.remark}
                  onChange={e => setFormData({...formData, remark: e.target.value})}
                  placeholder="备注"
                />
              </div>
            </form>

            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                type="button"
                onClick={(e) => handleSubmit(e as any)}
                className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors shadow-sm"
              >
                {isEdit ? '保存修改' : '立即创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
