import React, { useState, useEffect } from 'react';
import { Receipt, Plus, Edit, Trash2, Send, Search, RotateCcw, Eye, FileText, Download } from 'lucide-react';
import { expenseClaimApi, ExpenseClaim, ExpenseItem } from '../services/api/expense';
import { toast } from 'sonner';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableHead, TableHeader, TableActionHead } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';

export const ExpenseClaimPage: React.FC = () => {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    category: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [currentClaim, setCurrentClaim] = useState<ExpenseClaim | null>(null);
  const [viewClaim, setViewClaim] = useState<ExpenseClaim | null>(null);
  const [formData, setFormData] = useState<ExpenseClaim>({
    category: 'TRAVEL',
    description: '',
    items: [{ expenseType: 'TRANSPORT', amount: 0, expenseDate: '', description: '' }],
  });

  useEffect(() => {
    fetchClaims();
  }, [searchParams]);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await expenseClaimApi.list(searchParams);
      if (res) {
        // PageResult 兼容 records 和 rows 两种字段
        setClaims(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error('获取报销申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setCurrentClaim(null);
    setFormData({
      category: 'TRAVEL',
      description: '',
      items: [{ expenseType: 'TRANSPORT', amount: 0, expenseDate: '', description: '' }],
    });
    setShowDialog(true);
  };

  const handleView = async (id: number) => {
    try {
      const res = await expenseClaimApi.getInfo(id);
      if (res) {
        setViewClaim(res);
        setShowDetailDialog(true);
      }
    } catch (error) {
      toast.error('获取报销申请详情失败');
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await expenseClaimApi.getInfo(id);
      if (res) {
        setCurrentClaim(res);
        setFormData(res);
        setShowDialog(true);
      }
    } catch (error) {
      toast.error('获取报销申请详情失败');
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定要删除选中的报销申请吗？')) return;
    try {
      await expenseClaimApi.remove(ids);
      toast.success('删除成功');
      fetchClaims();
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定要提交该报销申请吗？提交后将进入审批流程。')) return;
    try {
      await expenseClaimApi.submit(id);
      toast.success('提交成功');
      fetchClaims();
    } catch (error) {
      toast.error('提交失败');
    }
  };

  const handleSave = async () => {
    if (!formData.category || !formData.description) {
      toast.error('请填写完整信息');
      return;
    }

    if (!formData.items || formData.items.length === 0) {
      toast.error('请至少添加一条报销明细');
      return;
    }

    // 验证明细
    for (const item of formData.items) {
      if (!item.expenseType || !item.amount || !item.expenseDate) {
        toast.error('请填写完整的报销明细信息');
        return;
      }
      if (item.amount <= 0) {
        toast.error('报销金额必须大于0');
        return;
      }
    }

    try {
      const totalAmount = formData.items.reduce((sum, item) => sum + (item.amount || 0), 0);
      const data = { ...formData, totalAmount };

      if (currentClaim?.id) {
        await expenseClaimApi.edit(data);
        toast.success('更新成功');
      } else {
        await expenseClaimApi.add(data);
        toast.success('创建成功');
      }
      setShowDialog(false);
      fetchClaims();
    } catch (error) {
      toast.error('保存失败');
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [
        ...(formData.items || []),
        { expenseType: 'TRANSPORT', amount: 0, expenseDate: '', description: '' },
      ],
    });
  };

  const removeItem = (index: number) => {
    const items = [...(formData.items || [])];
    items.splice(index, 1);
    setFormData({ ...formData, items });
  };

  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    const items = [...(formData.items || [])];
    items[index] = { ...items[index], [field]: value };
    setFormData({ ...formData, items });
  };

  const handleSearch = () => {
    setSearchParams({ ...searchParams, pageNum: 1 });
  };

  
  const handleReset = () => {
    setSearchParams({
      status: '',
      category: '',
      pageNum: 1,
      pageSize: 10,
    });
  };
  const handleExport = async () => {
    try {
      const blob = await expenseClaimApi.export(searchParams);
      downloadBlob(blob, buildExcelFileName('报销申请'));
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    PENDING: '审批中',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    PAID: '已打款',
  };

  const categoryMap: Record<string, string> = {
    TRAVEL: '差旅',
    OFFICE: '办公',
    ENTERTAINMENT: '招待',
    TRANSPORT: '交通',
    OTHER: '其他',
  };

  const expenseTypeMap: Record<string, string> = {
    TRANSPORT: '交通',
    ACCOMMODATION: '住宿',
    MEAL: '餐饮',
    COMMUNICATION: '通讯',
    OFFICE_SUPPLIES: '办公用品',
    OTHER: '其他',
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' },
      PENDING: { bg: 'bg-pink-50', text: 'text-pink-500' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-600' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      PAID: { bg: 'bg-purple-100', text: 'text-purple-600' },
    };
    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.text}`}>
        {statusMap[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Receipt className="text-pink-500" />
          报销申请
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="bg-white text-pink-500 border border-pink-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-50 transition-colors"
          >
            <Download size={18} />
            导出 Excel
          </button>
          <button
            onClick={handleAdd}
            className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors"
          >
            <Plus size={18} />
            新增报销申请
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex gap-3">
            <Select value={searchParams.status} onValueChange={v => setSearchParams({...searchParams, status: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部状态</SelectItem>
                      <SelectItem value="DRAFT">草稿</SelectItem>
                      <SelectItem value="PENDING">审批中</SelectItem>
                      <SelectItem value="APPROVED">已通过</SelectItem>
                      <SelectItem value="REJECTED">已驳回</SelectItem>
                      <SelectItem value="PAID">已打款</SelectItem>
                    </SelectContent>
                  </Select>

            <Select value={searchParams.category} onValueChange={v => setSearchParams({...searchParams, category: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部类别</SelectItem>
                      <SelectItem value="TRAVEL">差旅</SelectItem>
                      <SelectItem value="OFFICE">办公</SelectItem>
                      <SelectItem value="ENTERTAINMENT">招待</SelectItem>
                      <SelectItem value="TRANSPORT">交通</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>

            <button
              onClick={handleSearch}
              className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 text-sm"
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
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead className="px-4 py-3 text-left">报销单号</TableHead>
                <TableHead className="px-4 py-3 text-left">类别</TableHead>
                <TableHead className="px-4 py-3 text-left">总金额</TableHead>
                <TableHead className="px-4 py-3 text-left">说明</TableHead>
                <TableHead className="px-4 py-3 text-left">状态</TableHead>
                <TableHead className="px-4 py-3 text-left">创建时间</TableHead>
                <TableActionHead className="px-4 py-3 w-64">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
                      <span className="ml-2">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    <Receipt size={48} className="mx-auto mb-2 opacity-20" />
                    <p>暂无报销申请</p>
                  </td>
                </tr>
              ) : (
                claims.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{item.claimNo}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {categoryMap[item.category] || item.category}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                      ¥{item.totalAmount?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                      {item.description}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(item.status || 'DRAFT')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.createTime}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          {
                            label: '查看',
                            icon: <Eye size={14} />,
                            onClick: () => handleView(item.id!),
                            tone: 'info',
                          },
                          {
                            label: '编辑',
                            icon: <Edit size={14} />,
                            onClick: () => handleEdit(item.id!),
                            tone: 'primary',
                            hidden: item.status !== 'DRAFT',
                          },
                          {
                            label: '提交',
                            icon: <Send size={14} />,
                            onClick: () => handleSubmit(item.id!),
                            tone: 'success',
                            hidden: item.status !== 'DRAFT',
                          },
                          {
                            label: '删除',
                            icon: <Trash2 size={14} />,
                            onClick: () => handleDelete([item.id!]),
                            tone: 'danger',
                            hidden: item.status !== 'DRAFT',
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

        <div className="p-4 border-t border-slate-200 flex justify-between items-center">
          <span className="text-sm text-slate-600">共 {total} 条</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSearchParams((p) => ({ ...p, pageNum: Math.max(1, p.pageNum - 1) }))}
              disabled={searchParams.pageNum === 1}
              className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-3 py-1 text-sm">第 {searchParams.pageNum} 页</span>
            <button
              onClick={() => setSearchParams((p) => ({ ...p, pageNum: p.pageNum + 1 }))}
              disabled={searchParams.pageNum * searchParams.pageSize >= total}
              className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* 新增/编辑对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">
                {currentClaim ? '编辑报销申请' : '新增报销申请'}
              </h3>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">报销类别</label>
                  <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRAVEL">差旅</SelectItem>
                      <SelectItem value="OFFICE">办公</SelectItem>
                      <SelectItem value="ENTERTAINMENT">招待</SelectItem>
                      <SelectItem value="TRANSPORT">交通</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">总金额</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50"
                    value={`¥${formData.items?.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2) || '0.00'}`}
                    disabled
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">报销说明</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 h-20"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="请输入报销说明"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">报销明细</label>
                  <button
                    onClick={addItem}
                    className="bg-pink-500 text-white px-3 py-1 rounded text-sm hover:bg-pink-600"
                  >
                    添加明细
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.items?.map((item, index) => (
                    <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">费用类型</label>
                          <Select value={item.expenseType} onValueChange={v => updateItem(index, 'expenseType', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRANSPORT">交通</SelectItem>
                      <SelectItem value="ACCOMMODATION">住宿</SelectItem>
                      <SelectItem value="MEAL">餐饮</SelectItem>
                      <SelectItem value="COMMUNICATION">通讯</SelectItem>
                      <SelectItem value="OFFICE_SUPPLIES">办公用品</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">金额（元）</label>
                          <input
                            type="number"
                            className="w-full border border-slate-300 rounded p-2 text-sm"
                            value={item.amount}
                            onChange={(e) => updateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">费用日期</label>
                          <DatePicker
                            type="date"
                            value={item.expenseDate}
                            onChange={(e) => updateItem(index, 'expenseDate', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">费用说明</label>
                          <input
                            type="text"
                            className="w-full border border-slate-300 rounded p-2 text-sm"
                            value={item.description}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            placeholder="请输入费用说明"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(index)}
                        className="mt-2 text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                        删除此明细
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-2">
              <button
                onClick={() => setShowDialog(false)}
                className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm hover:bg-slate-300"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情查看对话框 */}
      {showDetailDialog && viewClaim && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">报销申请详情</h3>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>单号: {viewClaim.claimNo}</span>
                  <span>•</span>
                  <span>{getStatusBadge(viewClaim.status || 'DRAFT')}</span>
                </div>
              </div>
              <button
                onClick={() => setShowDetailDialog(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">报销类别</label>
                  <div className="text-sm text-slate-900">
                    {categoryMap[viewClaim.category] || viewClaim.category}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">总金额</label>
                  <div className="text-sm text-slate-900 font-medium">
                    ¥{viewClaim.totalAmount?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">申请人</label>
                  <div className="text-sm text-slate-900">{viewClaim.userName || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">创建时间</label>
                  <div className="text-sm text-slate-900">{viewClaim.createTime}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">报销说明</label>
                <div className="text-sm text-slate-900 bg-slate-50 p-3 rounded">
                  {viewClaim.description || '-'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">报销明细</label>
                <div className="space-y-2">
                  {viewClaim.items?.map((item, index) => (
                    <div key={index} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-xs text-slate-500">费用类型</span>
                          <div className="text-slate-900 mt-1">
                            {expenseTypeMap[item.expenseType] || item.expenseType}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">金额</span>
                          <div className="text-slate-900 font-medium mt-1">
                            ¥{item.amount?.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">费用日期</span>
                          <div className="text-slate-900 mt-1">{item.expenseDate}</div>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">说明</span>
                          <div className="text-slate-900 mt-1">{item.description || '-'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowDetailDialog(false)}
                className="bg-pink-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-pink-600"
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

export default ExpenseClaimPage;
