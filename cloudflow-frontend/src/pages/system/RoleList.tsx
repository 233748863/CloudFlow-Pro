import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield, ChevronRight, ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { toast } from 'sonner';
import { getRoleList, addRole, updateRole, deleteRole, getMenuList, getDeptTree } from '../../services/api/auth';
import { getTenantList } from '../../services/api/tenant';
import { useMount } from '../../hooks/useMount';

// Helper to build tree
const buildTree = (items: any[], parentId: number = 0): any[] => {
    return items
        .filter(item => item.parentId === parentId)
        .map(item => ({
            ...item,
            children: buildTree(items, item.menuId)
        }))
        .sort((a, b) => a.orderNum - b.orderNum);
};

export const RoleList = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [menuTree, setMenuTree] = useState<any[]>([]);
  const [flatMenus, setFlatMenus] = useState<any[]>([]);
  const [deptTree, setDeptTree] = useState<any[]>([]);
  const [flatDepts, setFlatDepts] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [formData, setFormData] = useState({
    roleName: '',
    roleKey: '',
    roleSort: 0,
    status: '0',
    menuIds: [] as number[],
    dsType: 1,
    dsScope: '',
    tenantId: undefined as number | undefined
  });

  // Tree expand state in modal
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [expandedDeptKeys, setExpandedDeptKeys] = useState<number[]>([]);

  useMount(() => {
    fetchRoles();
    fetchMenus();
    fetchDepts();
    fetchTenants();
  });

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await getRoleList();
      setRoles(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenus = async () => {
      try {
          const res = await getMenuList();
          if (Array.isArray(res)) {
              setFlatMenus(res);
              setMenuTree(buildTree(res, 0));
              // Expand root by default
              const rootIds = res.filter(m => m.parentId === 0).map(m => m.menuId);
              setExpandedKeys(rootIds);
          }
      } catch (e) {
          console.error(e);
      }
  };

  const fetchDepts = async () => {
      try {
          const res = await getDeptTree();
          if (Array.isArray(res)) {
              setFlatDepts(res);
              setDeptTree(buildTree(res.map(d => ({...d, menuId: d.deptId, parentId: d.parentId || 0, menuName: d.deptName, orderNum: d.orderNum || 0})), 0));
              // Expand root by default
              const rootIds = res.filter(d => !d.parentId || d.parentId === 0).map(d => d.deptId);
              setExpandedDeptKeys(rootIds);
          }
      } catch (e) {
          console.error(e);
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

  const handleOpenModal = (role?: any) => {
    if (role) {
      setEditingRole(role);
      const deptIds = role.dsScope ? role.dsScope.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id)) : [];
      setFormData({
        roleName: role.roleName,
        roleKey: role.roleKey,
        roleSort: role.roleSort,
        status: role.status,
        menuIds: role.menuIds || [],
        dsType: role.dsType ?? 1,
        dsScope: role.dsScope || '',
        tenantId: role.tenantId
      });
    } else {
      setEditingRole(null);
      setFormData({
        roleName: '',
        roleKey: '',
        roleSort: 0,
        status: '0',
        menuIds: [],
        dsType: 1,
        dsScope: '',
        tenantId: undefined
      });
    }
    setIsModalOpen(true);
  };

  const toggleMenuCheck = (menuId: number) => {
      // Logic: 
      // 1. If checking, check all children
      // 2. If unchecking, uncheck all children
      // 3. (Optional) If checking, check parent
      
      const isChecked = formData.menuIds.includes(menuId);
      let newIds = [...formData.menuIds];
      
      // Helper to get all children ids
      const getChildrenIds = (id: number): number[] => {
          const children = flatMenus.filter(m => m.parentId === id);
          let ids = children.map(c => c.menuId);
          children.forEach(c => {
              ids = [...ids, ...getChildrenIds(c.menuId)];
          });
          return ids;
      };
      
      const childrenIds = getChildrenIds(menuId);
      const allRelatedIds = [menuId, ...childrenIds];
      
      if (isChecked) {
          // Uncheck
          newIds = newIds.filter(id => !allRelatedIds.includes(id));
      } else {
          // Check
          // Also check parent? For strict tree, maybe. 
          // For now let's just check self and children.
          // To be safe, adding parent logic often requires traversing up.
          // Let's implement simple check down.
          const idsToAdd = allRelatedIds.filter(id => !newIds.includes(id));
          newIds = [...newIds, ...idsToAdd];
      }
      
      setFormData({ ...formData, menuIds: newIds });
  };

  const toggleExpand = (id: number) => {
    setExpandedKeys(prev => 
        prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const toggleDeptExpand = (id: number) => {
    setExpandedDeptKeys(prev => 
        prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const toggleDeptCheck = (deptId: number) => {
      const currentIds = formData.dsScope ? formData.dsScope.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
      const isChecked = currentIds.includes(deptId);
      
      let newIds: number[];
      if (isChecked) {
          newIds = currentIds.filter(id => id !== deptId);
      } else {
          newIds = [...currentIds, deptId];
      }
      
      setFormData({ ...formData, dsScope: newIds.join(',') });
  };

  const renderDeptTreeNodes = (nodes: any[]) => {
      const currentIds = formData.dsScope ? formData.dsScope.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id)) : [];
      
      return nodes.map(node => (
          <div key={node.menuId} className="ml-4">
              <div className="flex items-center gap-2 py-1">
                  {node.children && node.children.length > 0 ? (
                      <button type="button" onClick={() => toggleDeptExpand(node.menuId)} className="text-slate-400">
                           {expandedDeptKeys.includes(node.menuId) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      </button>
                  ) : <span className="w-3.5"></span>}
                  
                  <input 
                    type="checkbox"
                    checked={currentIds.includes(node.menuId)}
                    onChange={() => toggleDeptCheck(node.menuId)}
                    className="rounded border-slate-300 text-pink-500 focus:ring-pink-400"
                  />
                  <span className="text-sm text-slate-700">{node.menuName}</span>
              </div>
              {expandedDeptKeys.includes(node.menuId) && node.children && (
                  <div>{renderDeptTreeNodes(node.children)}</div>
              )}
          </div>
      ));
  };

  const renderTreeNodes = (nodes: any[]) => {
      return nodes.map(node => (
          <div key={node.menuId} className="ml-4">
              <div className="flex items-center gap-2 py-1">
                  {node.children && node.children.length > 0 ? (
                      <button type="button" onClick={() => toggleExpand(node.menuId)} className="text-slate-400">
                           {expandedKeys.includes(node.menuId) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      </button>
                  ) : <span className="w-3.5"></span>}
                  
                  <input 
                    type="checkbox"
                    checked={formData.menuIds.includes(node.menuId)}
                    onChange={() => toggleMenuCheck(node.menuId)}
                    className="rounded border-slate-300 text-pink-500 focus:ring-pink-400"
                  />
                  <span className="text-sm text-slate-700">{node.menuName}</span>
              </div>
              {expandedKeys.includes(node.menuId) && node.children && (
                  <div>{renderTreeNodes(node.children)}</div>
              )}
          </div>
      ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await updateRole({ ...formData, roleId: editingRole.roleId });
        toast.success('角色更新成功');
      } else {
        await addRole(formData);
        toast.success('角色创建成功');
      }
      setIsModalOpen(false);
      fetchRoles();
    } catch (error) {
      console.error(error);
    }
  };

  // ... (handleDelete and render logic remains same)
  const handleDelete = async (roleId: number) => {
    if (window.confirm('确认删除该角色吗？')) {
      try {
        await deleteRole([roleId]);
        toast.success('角色删除成功');
        fetchRoles();
      } catch (error) {
        console.error(error);
      }
    }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">角色管理</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors"
        >
          <Plus size={18} /> 新增角色
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">角色名称</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">权限字符</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">租户</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">显示顺序</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-52">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">加载中...</td>
                </tr>
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">暂无数据</td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.roleId} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{role.roleId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 flex items-center gap-2">
                       <Shield size={16} className="text-pink-400"/>
                       {role.roleName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono text-xs">{role.roleKey}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {tenants.find(t => t.tenantId === role.tenantId)?.tenantName || '默认租户'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{role.roleSort}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${role.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {role.status === '0' ? '正常' : '停用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          {
                            label: '编辑',
                            icon: <Edit size={14} />,
                            onClick: () => handleOpenModal(role),
                            tone: 'primary',
                          },
                          {
                            label: '删除',
                            icon: <Trash2 size={14} />,
                            onClick: () => handleDelete(role.roleId),
                            tone: 'danger',
                          },
                        ]}
                      />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingRole ? '编辑角色' : '新增角色'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">角色名称</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                  value={formData.roleName}
                  onChange={e => setFormData({...formData, roleName: e.target.value})}
                  placeholder="如: 系统管理员"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">权限字符</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                  value={formData.roleKey}
                  onChange={e => setFormData({...formData, roleKey: e.target.value})}
                  placeholder="如: ADMIN"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">显示顺序</label>
                  <input 
                    type="number" 
                    required
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                    value={formData.roleSort}
                    onChange={e => setFormData({...formData, roleSort: parseInt(e.target.value)})}
                  />
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

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
                <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="1">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">数据权限范围</label>
                <Select value={String(formData.dsType)} onValueChange={v => { const val = parseInt(v); setFormData({...formData, dsType: val, dsScope: val === 1 ? formData.dsScope : ''}); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择数据权限" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">全部数据权限</SelectItem>
                    <SelectItem value="1">自定义数据权限</SelectItem>
                    <SelectItem value="2">本部门及下级部门数据</SelectItem>
                    <SelectItem value="3">本部门数据</SelectItem>
                    <SelectItem value="4">仅本人数据</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  {formData.dsType === 0 && '可以查看所有数据'}
                  {formData.dsType === 1 && '可以查看指定部门的数据'}
                  {formData.dsType === 2 && '可以查看本部门及下级部门的数据'}
                  {formData.dsType === 3 && '只能查看本部门的数据'}
                  {formData.dsType === 4 && '只能查看自己创建的数据'}
                </p>
              </div>

              {formData.dsType === 1 && (
                <div className="border-t pt-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">选择部门</label>
                    <div className="border border-slate-200 rounded-lg p-2 max-h-60 overflow-y-auto bg-slate-50">
                        {renderDeptTreeNodes(deptTree)}
                    </div>
                </div>
              )}
              
              <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">菜单权限</label>
                  <div className="border border-slate-200 rounded-lg p-2 max-h-60 overflow-y-auto bg-slate-50">
                      {renderTreeNodes(menuTree)}
                  </div>
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
                  className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors shadow-sm"
                >
                  {editingRole ? '保存修改' : '立即创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
