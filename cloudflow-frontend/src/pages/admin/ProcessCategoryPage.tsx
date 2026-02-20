import React, { useEffect, useState } from 'react';
import { processCategoryApi, ProcessCategory } from '../../services/api/processCategory';
import { toast } from 'sonner';
import {
  FolderTree, Plus, Pencil, Trash2, ChevronRight, ChevronDown,
  Layers, Briefcase, Users, DollarSign, Building2, FolderKanban
} from 'lucide-react';

/** 图标映射 */
const iconMap: Record<string, React.ReactNode> = {
  'folder-tree': <FolderTree className="w-4 h-4" />,
  'briefcase': <Briefcase className="w-4 h-4" />,
  'users': <Users className="w-4 h-4" />,
  'dollar-sign': <DollarSign className="w-4 h-4" />,
  'building': <Building2 className="w-4 h-4" />,
  'folder-kanban': <FolderKanban className="w-4 h-4" />,
  'layers': <Layers className="w-4 h-4" />,
};

/** 空表单 */
const emptyForm: ProcessCategory = {
  parentId: 0,
  categoryName: '',
  categoryCode: '',
  icon: '',
  sortOrder: 0,
  status: '0',
  remark: '',
};

const ProcessCategoryPage: React.FC = () => {
  // 树形数据
  const [treeData, setTreeData] = useState<ProcessCategory[]>([]);
  // 平铺数据（用于父分类选择）
  const [flatList, setFlatList] = useState<ProcessCategory[]>([]);
  // 展开的节点
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());
  // 选中的节点
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 模态框
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<ProcessCategory>({ ...emptyForm });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  /** 加载数据 */
  const fetchData = async () => {
    try {
      const [treeRes, listRes] = await Promise.all([
        processCategoryApi.tree(),
        processCategoryApi.list(),
      ]);
      setTreeData(treeRes?.data || []);
      setFlatList(listRes?.data || []);
      // 默认展开所有顶级节点
      const topIds = new Set<number>((treeRes?.data || []).map((c: ProcessCategory) => c.categoryId!));
      setExpandedKeys(topIds);
    } catch {
      toast.error('加载分类数据失败');
    }
  };

  /** 切换展开/折叠 */
  const toggleExpand = (id: number) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 打开新增弹窗 */
  const handleAdd = (parentId: number = 0) => {
    setIsEdit(false);
    setForm({ ...emptyForm, parentId });
    setModalOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleEdit = async (id: number) => {
    try {
      const res = await processCategoryApi.getInfo(id);
      const data = res?.data;
      if (data) {
        setIsEdit(true);
        setForm(data);
        setModalOpen(true);
      }
    } catch {
      toast.error('获取分类详情失败');
    }
  };

  /** 删除分类 */
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`确定删除分类「${name}」吗？`)) return;
    try {
      await processCategoryApi.remove(id);
      toast.success('删除成功');
      if (selectedId === id) setSelectedId(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.msg || '删除失败');
    }
  };

  /** 提交表单 */
  const handleSubmit = async () => {
    if (!form.categoryName?.trim()) {
      toast.error('请输入分类名称');
      return;
    }
    if (!form.categoryCode?.trim()) {
      toast.error('请输入分类编码');
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        await processCategoryApi.edit(form);
        toast.success('修改成功');
      } else {
        await processCategoryApi.add(form);
        toast.success('新增成功');
      }
      setModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.msg || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  /** 渲染图标 */
  const renderIcon = (icon?: string) => {
    if (!icon) return <Layers className="w-4 h-4 text-gray-400" />;
    return iconMap[icon] || <Layers className="w-4 h-4 text-gray-400" />;
  };

  /** 递归渲染树节点 */
  const renderTreeNode = (node: ProcessCategory, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedKeys.has(node.categoryId!);
    const isSelected = selectedId === node.categoryId;

    return (
      <div key={node.categoryId}>
        {/* 节点行 */}
        <div
          className={`flex items-center py-2 px-3 cursor-pointer rounded-lg transition-colors group
            ${isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : 'hover:bg-gray-50'}`}
          style={{ paddingLeft: `${level * 24 + 12}px` }}
          onClick={() => setSelectedId(node.categoryId!)}
        >
          {/* 展开/折叠按钮 */}
          <button
            className="w-5 h-5 flex items-center justify-center mr-1 text-gray-400"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(node.categoryId!);
            }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="w-4" />
            )}
          </button>

          {/* 图标 */}
          <span className="mr-2 text-indigo-500">{renderIcon(node.icon)}</span>

          {/* 名称 */}
          <span className="flex-1 text-sm font-medium text-gray-700 truncate">
            {node.categoryName}
          </span>

          {/* 编码 */}
          <span className="text-xs text-gray-400 mr-3 hidden sm:inline">{node.categoryCode}</span>

          {/* 状态 */}
          <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${
            node.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {node.status === '0' ? '正常' : '停用'}
          </span>

          {/* 操作按钮 */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 text-gray-400 hover:text-indigo-600 rounded"
              title="添加子分类"
              onClick={(e) => { e.stopPropagation(); handleAdd(node.categoryId!); }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 text-gray-400 hover:text-blue-600 rounded"
              title="编辑"
              onClick={(e) => { e.stopPropagation(); handleEdit(node.categoryId!); }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              className="p-1 text-gray-400 hover:text-red-600 rounded"
              title="删除"
              onClick={(e) => { e.stopPropagation(); handleDelete(node.categoryId!, node.categoryName!); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  /** 获取选中节点的详情 */
  const selectedNode = flatList.find(c => c.categoryId === selectedId);

  return (
    <div className="p-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderTree className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-semibold text-gray-800">流程分类管理</h1>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
          onClick={() => handleAdd(0)}
        >
          <Plus className="w-4 h-4" />
          新增顶级分类
        </button>
      </div>

      <div className="flex gap-6">
        {/* 左侧：分类树 */}
        <div className="w-[480px] bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">分类结构</h2>
          {treeData.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">暂无分类数据</div>
          ) : (
            <div className="space-y-0.5">
              {treeData.map(node => renderTreeNode(node))}
            </div>
          )}
        </div>

        {/* 右侧：详情面板 */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {selectedNode ? (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-indigo-500">{renderIcon(selectedNode.icon)}</span>
                <h2 className="text-lg font-semibold text-gray-800">{selectedNode.categoryName}</h2>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  selectedNode.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedNode.status === '0' ? '正常' : '停用'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">分类编码：</span>
                  <span className="text-gray-800 font-mono">{selectedNode.categoryCode}</span>
                </div>
                <div>
                  <span className="text-gray-500">排序号：</span>
                  <span className="text-gray-800">{selectedNode.sortOrder}</span>
                </div>
                <div>
                  <span className="text-gray-500">父分类ID：</span>
                  <span className="text-gray-800">{selectedNode.parentId === 0 ? '顶级分类' : selectedNode.parentId}</span>
                </div>
                <div>
                  <span className="text-gray-500">图标：</span>
                  <span className="text-gray-800">{selectedNode.icon || '无'}</span>
                </div>
                {selectedNode.remark && (
                  <div className="col-span-2">
                    <span className="text-gray-500">备注：</span>
                    <span className="text-gray-800">{selectedNode.remark}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                  onClick={() => handleEdit(selectedNode.categoryId!)}
                >
                  编辑分类
                </button>
                <button
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                  onClick={() => handleAdd(selectedNode.categoryId!)}
                >
                  添加子分类
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <FolderTree className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">请在左侧选择一个分类查看详情</p>
            </div>
          )}
        </div>
      </div>

      {/* 新增/编辑模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[520px] max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                {isEdit ? '编辑分类' : '新增分类'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* 父分类 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">父分类</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={form.parentId || 0}
                  onChange={e => setForm({ ...form, parentId: Number(e.target.value) })}
                >
                  <option value={0}>顶级分类</option>
                  {flatList
                    .filter(c => c.categoryId !== form.categoryId)
                    .map(c => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.categoryName} ({c.categoryCode})
                      </option>
                    ))}
                </select>
              </div>

              {/* 分类名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="请输入分类名称"
                  value={form.categoryName || ''}
                  onChange={e => setForm({ ...form, categoryName: e.target.value })}
                />
              </div>

              {/* 分类编码 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  分类编码 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="如: oa_leave"
                  value={form.categoryCode || ''}
                  onChange={e => setForm({ ...form, categoryCode: e.target.value })}
                />
              </div>

              {/* 图标 + 排序 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">图标标识</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={form.icon || ''}
                    onChange={e => setForm({ ...form, icon: e.target.value })}
                  >
                    <option value="">无</option>
                    <option value="briefcase">briefcase 公文包</option>
                    <option value="users">users 用户</option>
                    <option value="dollar-sign">dollar-sign 财务</option>
                    <option value="building">building 行政</option>
                    <option value="folder-kanban">folder-kanban 项目</option>
                    <option value="layers">layers 通用</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">排序号</label>
                  <input
                    type="number"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={form.sortOrder ?? 0}
                    onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })}
                  />
                </div>
              </div>

              {/* 状态 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="status"
                      value="0"
                      checked={form.status === '0'}
                      onChange={() => setForm({ ...form, status: '0' })}
                      className="text-indigo-600"
                    />
                    正常
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="status"
                      value="1"
                      checked={form.status === '1'}
                      onChange={() => setForm({ ...form, status: '1' })}
                      className="text-indigo-600"
                    />
                    停用
                  </label>
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="可选"
                  value={form.remark || ''}
                  onChange={e => setForm({ ...form, remark: e.target.value })}
                />
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? '提交中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessCategoryPage;
