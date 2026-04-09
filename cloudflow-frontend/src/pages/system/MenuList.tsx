import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, ChevronRight, ChevronDown, Folder, File, Layout } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableHead, TableHeader, TableActionHead } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import { toast } from 'sonner';
import { getMenuList, addMenu, updateMenu, deleteMenu } from '../../services/api/auth';

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

export const MenuList = () => {
  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<any>(null);
  const [formData, setFormData] = useState({
    parentId: 0,
    menuType: 'M',
    menuName: '',
    orderNum: 0,
    path: '',
    component: '',
    perms: '',
    icon: '',
    status: '0'
  });

  // For parent select
  const [flatMenus, setFlatMenus] = useState<any[]>([]);

  useEffect(() => {
    fetchMenus();
  }, []);

  const fetchMenus = async () => {
    setLoading(true);
    try {
      const res = await getMenuList();
      if (Array.isArray(res)) {
          setFlatMenus(res);
          setMenus(buildTree(res, 0));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
      setExpandedKeys(prev => 
          prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
      );
  };

  const handleOpenModal = (menu?: any, parentId?: number) => {
    if (menu) {
      setEditingMenu(menu);
      setFormData({
        parentId: menu.parentId,
        menuType: menu.menuType,
        menuName: menu.menuName,
        orderNum: menu.orderNum,
        path: menu.path || '',
        component: menu.component || '',
        perms: menu.perms || '',
        icon: menu.icon || '',
        status: menu.status
      });
    } else {
      setEditingMenu(null);
      setFormData({
        parentId: parentId || 0,
        menuType: 'M',
        menuName: '',
        orderNum: 0,
        path: '',
        component: '',
        perms: '',
        icon: '',
        status: '0'
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMenu) {
        await updateMenu({ ...formData, menuId: editingMenu.menuId });
        toast.success('菜单更新成功');
      } else {
        await addMenu(formData);
        toast.success('菜单创建成功');
      }
      setIsModalOpen(false);
      fetchMenus();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (menuId: number) => {
    if (window.confirm('确认删除该菜单吗？')) {
      try {
        await deleteMenu(menuId);
        toast.success('菜单删除成功');
        fetchMenus();
      } catch (error) {
        console.error(error);
        toast.error('删除失败，请检查是否存在子菜单');
      }
    }
  };

  // Recursive render row
  const renderRows = (nodes: any[], level: number = 0) => {
      return nodes.map(node => (
          <React.Fragment key={node.menuId}>
              <tr className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      <div className="flex items-center" style={{ paddingLeft: `${level * 24}px` }}>
                          {node.children && node.children.length > 0 && (
                              <button onClick={() => toggleExpand(node.menuId)} className="mr-2 text-slate-400">
                                  {expandedKeys.includes(node.menuId) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                              </button>
                          )}
                          {!node.children?.length && <span className="w-6 mr-2"></span>}
                          {node.menuName}
                      </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {node.icon}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {node.orderNum}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {node.perms}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {node.component}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                          node.menuType === 'M' ? 'bg-pink-50 text-pink-600' :
                          node.menuType === 'C' ? 'bg-green-100 text-green-700' :
                          'bg-slate-200 text-slate-600'
                      }`}>
                          {node.menuType === 'M' ? '目录' : node.menuType === 'C' ? '菜单' : '按钮'}
                      </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-right">
                      <TableRowActions
                          align="end"
                          actions={[
                              {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleOpenModal(node),
                                  tone: 'primary',
                              },
                              {
                                  label: '新增',
                                  icon: <Plus size={14} />,
                                  onClick: () => handleOpenModal(undefined, node.menuId),
                                  tone: 'info',
                              },
                              {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete(node.menuId),
                                  tone: 'danger',
                              },
                          ]}
                      />
                  </td>
              </tr>
              {expandedKeys.includes(node.menuId) && node.children && renderRows(node.children, level + 1)}
          </React.Fragment>
      ));
  };

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">菜单管理</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors"
        >
          <Plus size={18} /> 新增菜单
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full">
            <TableHeader>
              <tr>
                <TableHead className="px-6 py-3 text-left w-[300px]">菜单名称</TableHead>
                <TableHead className="px-6 py-3 text-left">图标</TableHead>
                <TableHead className="px-6 py-3 text-left">排序</TableHead>
                <TableHead className="px-6 py-3 text-left">权限标识</TableHead>
                <TableHead className="px-6 py-3 text-left">组件路径</TableHead>
                <TableHead className="px-6 py-3 text-left">类型</TableHead>
                <TableActionHead className="px-6 py-3 w-60">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载菜单数据..." />
              ) : menus.length === 0 ? (
                <WorkspaceTableStateRow colSpan={7} title="暂无菜单数据" />
              ) : (
                renderRows(menus)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingMenu ? '编辑菜单' : '新增菜单'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">上级菜单</label>
                <Select value={String(formData.parentId)} onValueChange={v => setFormData({...formData, parentId: parseInt(v)})}>
                  <SelectTrigger>
                    <SelectValue placeholder="主目录" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">主目录</SelectItem>
                    {flatMenus.filter(m => m.menuType !== 'F' && m.menuId !== editingMenu?.menuId).map(m => (
                      <SelectItem key={m.menuId} value={String(m.menuId)}>{m.menuName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">菜单类型</label>
                <div className="flex gap-4">
                    {['M', 'C', 'F'].map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="menuType"
                                value={type}
                                checked={formData.menuType === type}
                                onChange={e => setFormData({...formData, menuType: e.target.value})}
                            />
                            <span className="text-sm">
                                {type === 'M' ? '目录' : type === 'C' ? '菜单' : '按钮'}
                            </span>
                        </label>
                    ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">菜单名称</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                  value={formData.menuName}
                  onChange={e => setFormData({...formData, menuName: e.target.value})}
                />
              </div>

              {formData.menuType !== 'F' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">图标</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                      value={formData.icon}
                      onChange={e => setFormData({...formData, icon: e.target.value})}
                      placeholder="Lucide Icon Name"
                    />
                  </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">显示排序</label>
                <input 
                  type="number" 
                  required
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                  value={formData.orderNum}
                  onChange={e => setFormData({...formData, orderNum: parseInt(e.target.value)})}
                />
              </div>

              {formData.menuType !== 'F' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">路由地址</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                      value={formData.path}
                      onChange={e => setFormData({...formData, path: e.target.value})}
                      placeholder="sys/user"
                    />
                  </div>
              )}

              {formData.menuType === 'C' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">组件路径</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                      value={formData.component}
                      onChange={e => setFormData({...formData, component: e.target.value})}
                      placeholder="system/UserList"
                    />
                  </div>
              )}

              {formData.menuType !== 'M' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">权限字符</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-pink-400 outline-none"
                      value={formData.perms}
                      onChange={e => setFormData({...formData, perms: e.target.value})}
                      placeholder="system:user:list"
                    />
                  </div>
              )}

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
                  {editingMenu ? '保存修改' : '立即创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
