import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, Search, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Pencil, Trash2, Loader2 } from 'lucide-react';
import { consumableApi, Consumable } from '@/services/api/consumable';
import { toast } from 'sonner';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { TableHead, TableHeader, TableActionHead } from '@/components/ui';
import { WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import { getErrorMessage } from '@/utils/errorMessage';


/** 耗材管理页面 */
const ConsumablePage: React.FC = () => {
  // 列表数据
  const [list, setList] = useState<Consumable[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize] = useState(10);

  // 搜索条件
  const [searchName, setSearchName] = useState('');

  // 弹窗状态
  const [showForm, setShowForm] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockAction, setStockAction] = useState<'add' | 'reduce'>('add');
  const [stockQuantity, setStockQuantity] = useState(1);
  const [currentItem, setCurrentItem] = useState<Consumable | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 表单数据
  const [formData, setFormData] = useState<Consumable>({
    name: '',
    model: '',
    unit: '个',
    quantity: 0,
    lowStockThreshold: 10,
  });

  // 加载列表
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data: any = await consumableApi.list({
        pageNum,
        pageSize,
        name: searchName || undefined,
      });
      setList(data?.records || []);
      setTotal(data?.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载耗材列表失败'));
    } finally {
      setLoading(false);
    }
  }, [pageNum, pageSize, searchName]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 搜索
  const handleSearch = () => {
    setPageNum(1);
    fetchList();
  };

  // 打开新增弹窗
  const handleAdd = () => {
    setFormData({ name: '', model: '', unit: '个', quantity: 0, lowStockThreshold: 10 });
    setCurrentItem(null);
    setShowForm(true);
  };

  // 打开编辑弹窗
  const handleEdit = (item: Consumable) => {
    setFormData({ ...item });
    setCurrentItem(item);
    setShowForm(true);
  };

  // 保存（新增/编辑）
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('请输入耗材名称');
      return;
    }
    setSubmitting(true);
    try {
      if (currentItem?.consumableId) {
        await consumableApi.edit(formData);
        toast.success('修改成功');
      } else {
        await consumableApi.add(formData);
        toast.success('新增成功');
      }
      setShowForm(false);
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  // 删除
  const handleDelete = async (item: Consumable) => {
    if (!item.consumableId) return;
    if (!window.confirm(`确定删除耗材「${item.name}」吗？`)) return;
    try {
      await consumableApi.remove([item.consumableId]);
      toast.success('删除成功');
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  // 打开出入库弹窗
  const openStockModal = (item: Consumable, action: 'add' | 'reduce') => {
    setCurrentItem(item);
    setStockAction(action);
    setStockQuantity(1);
    setShowStockModal(true);
  };

  // 执行出入库
  const handleStock = async () => {
    if (!currentItem?.consumableId || stockQuantity <= 0) return;
    setSubmitting(true);
    try {
      if (stockAction === 'add') {
        await consumableApi.addStock(currentItem.consumableId, stockQuantity);
        toast.success(`入库成功，数量: ${stockQuantity}`);
      } else {
        await consumableApi.reduceStock(currentItem.consumableId, stockQuantity);
        toast.success(`出库成功，数量: ${stockQuantity}`);
      }
      setShowStockModal(false);
      fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, stockAction === 'add' ? '入库失败' : '出库失败，可能库存不足'));
    } finally {
      setSubmitting(false);
    }
  };

  // 判断是否库存不足
  const isLowStock = (item: Consumable) => {
    return (item.quantity || 0) <= (item.lowStockThreshold || 0);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="text-pink-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">耗材管理</h1>
            <p className="text-sm text-slate-500">管理办公耗材的库存、入库和出库</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600 transition-colors"
        >
          <Plus size={18} />
          新增耗材
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜索耗材名称..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
            <TableHeader>
              <tr>
                <TableHead className="text-left px-4 py-3">名称</TableHead>
                <TableHead className="text-left px-4 py-3">型号</TableHead>
                <TableHead className="text-left px-4 py-3">单位</TableHead>
                <TableHead className="text-center px-4 py-3">库存</TableHead>
                <TableHead className="text-center px-4 py-3">预警阈值</TableHead>
                <TableHead className="text-center px-4 py-3">状态</TableHead>
                <TableActionHead className="px-4 py-3 w-72">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody>
              {loading ? (
                <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载耗材数据..." />
              ) : list.length === 0 ? (
                <WorkspaceTableStateRow colSpan={7} title="暂无耗材数据" icon={<Package size={24} />} />
              ) : list.map(item => (
                <tr key={item.consumableId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.model || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.unit || '-'}</td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span className={`font-semibold ${isLowStock(item) ? 'text-red-600' : 'text-slate-900'}`}>
                      {item.quantity ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{item.lowStockThreshold ?? '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {isLowStock(item) ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">
                        <AlertTriangle size={12} />
                        库存不足
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-600">
                        正常
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <TableRowActions
                      align="center"
                      actions={[
                        {
                          label: '入库',
                          icon: <ArrowUpCircle size={14} />,
                          onClick: () => openStockModal(item, 'add'),
                          tone: 'success',
                        },
                        {
                          label: '出库',
                          icon: <ArrowDownCircle size={14} />,
                          onClick: () => openStockModal(item, 'reduce'),
                          tone: 'warning',
                        },
                        {
                          label: '编辑',
                          icon: <Pencil size={14} />,
                          onClick: () => handleEdit(item),
                          tone: 'primary',
                        },
                        {
                          label: '删除',
                          icon: <Trash2 size={14} />,
                          onClick: () => handleDelete(item),
                          tone: 'danger',
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        {/* 分页 */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <span className="text-sm text-slate-500">共 {total} 条</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPageNum(p => Math.max(1, p - 1))}
                disabled={pageNum <= 1}
                className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                上一页
              </button>
              <span className="px-3 py-1 text-sm text-slate-600">
                {pageNum} / {totalPages}
              </span>
              <button
                onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}
                disabled={pageNum >= totalPages}
                className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 新增/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {currentItem?.consumableId ? '编辑耗材' : '新增耗材'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入耗材名称"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">型号</label>
                  <input
                    type="text"
                    value={formData.model || ''}
                    onChange={e => setFormData({ ...formData, model: e.target.value })}
                    placeholder="如 A4"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">单位</label>
                  <input
                    type="text"
                    value={formData.unit || ''}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="如 个/箱/包"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">初始库存</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.quantity ?? 0}
                    onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">低库存预警</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.lowStockThreshold ?? 10}
                    onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 出入库弹窗 */}
      {showStockModal && currentItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowStockModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {stockAction === 'add' ? '入库' : '出库'} - {currentItem.name}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              当前库存：{currentItem.quantity ?? 0} {currentItem.unit || '个'}
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {stockAction === 'add' ? '入库' : '出库'}数量
              </label>
              <input
                type="number"
                min={1}
                max={stockAction === 'reduce' ? currentItem.quantity : undefined}
                value={stockQuantity}
                onChange={e => setStockQuantity(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowStockModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleStock}
                disabled={submitting || stockQuantity <= 0}
                className={`flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
                  stockAction === 'add'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                确认{stockAction === 'add' ? '入库' : '出库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsumablePage;
