import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Edit, Trash2, Send, Search, RotateCcw, Eye } from 'lucide-react';
import { paymentRequestApi, PaymentRequest } from '../services/api/expense';
import { toast } from 'sonner';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { DatePicker } from '../components/ui/date-picker';

export const PaymentRequestPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    paymentType: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<PaymentRequest | null>(null);
  const [viewPayment, setViewPayment] = useState<PaymentRequest | null>(null);
  const [formData, setFormData] = useState<PaymentRequest>({
    payeeName: '',
    amount: 0,
    paymentType: 'TRANSFER',
    reason: '',
  });

  useEffect(() => {
    fetchPayments();
  }, [searchParams]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await paymentRequestApi.list(searchParams);
      if (res) {
        // PageResult 兼容 records 和 rows 两种字段
        setPayments(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error('获取付款申请列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setCurrentPayment(null);
    setFormData({
      payeeName: '',
      amount: 0,
      paymentType: 'TRANSFER',
      reason: '',
    });
    setShowDialog(true);
  };

  const handleView = async (id: number) => {
    try {
      const res = await paymentRequestApi.getInfo(id);
      if (res) {
        setViewPayment(res);
        setShowDetailDialog(true);
      }
    } catch (error) {
      toast.error('获取付款申请详情失败');
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await paymentRequestApi.getInfo(id);
      if (res) {
        setCurrentPayment(res);
        setFormData(res);
        setShowDialog(true);
      }
    } catch (error) {
      toast.error('获取付款申请详情失败');
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定要删除选中的付款申请吗？')) return;
    try {
      await paymentRequestApi.remove(ids);
      toast.success('删除成功');
      fetchPayments();
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定要提交该付款申请吗？提交后将进入审批流程。')) return;
    try {
      await paymentRequestApi.submit(id);
      toast.success('提交成功');
      fetchPayments();
    } catch (error) {
      toast.error('提交失败');
    }
  };

  const handleSave = async () => {
    if (!formData.payeeName || !formData.amount || !formData.reason) {
      toast.error('请填写完整信息');
      return;
    }

    if (formData.amount <= 0) {
      toast.error('付款金额必须大于0');
      return;
    }

    try {
      if (currentPayment?.id) {
        await paymentRequestApi.edit(formData);
        toast.success('更新成功');
      } else {
        await paymentRequestApi.add(formData);
        toast.success('创建成功');
      }
      setShowDialog(false);
      fetchPayments();
    } catch (error) {
      toast.error('保存失败');
    }
  };

  const handleSearch = () => {
    setSearchParams({ ...searchParams, pageNum: 1 });
  };

  const handleReset = () => {
    setSearchParams({
      status: '',
      paymentType: '',
      pageNum: 1,
      pageSize: 10,
    });
  };

  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    PENDING: '审批中',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    PAID: '已打款',
  };

  const paymentTypeMap: Record<string, string> = {
    TRANSFER: '转账',
    CASH: '现金',
    CHECK: '支票',
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
          <DollarSign className="text-green-600" />
          付款申请
        </h2>
        <button
          onClick={handleAdd}
          className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition-colors"
        >
          <Plus size={18} />
          新增付款申请
        </button>
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

            <Select value={searchParams.paymentType} onValueChange={v => setSearchParams({...searchParams, paymentType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部类型</SelectItem>
                      <SelectItem value="TRANSFER">转账</SelectItem>
                      <SelectItem value="CASH">现金</SelectItem>
                      <SelectItem value="CHECK">支票</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>

            <button
              onClick={handleSearch}
              className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 text-sm"
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">付款单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">收款人</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">付款方式</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">原因</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">创建时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                      <span className="ml-2">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <DollarSign size={48} className="mx-auto mb-2 opacity-20" />
                    <p>暂无付款申请</p>
                  </td>
                </tr>
              ) : (
                payments.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{item.paymentNo}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{item.payeeName}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                      ¥{item.amount?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {paymentTypeMap[item.paymentType] || item.paymentType}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                      {item.reason}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(item.status || 'DRAFT')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.createTime}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleView(item.id!)}
                          className="text-pink-500 hover:text-pink-700"
                          title="查看"
                        >
                          <Eye size={16} />
                        </button>
                        {item.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => handleEdit(item.id!)}
                              className="text-green-600 hover:text-green-800"
                              title="编辑"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleSubmit(item.id!)}
                              className="text-pink-500 hover:text-pink-700"
                              title="提交"
                            >
                              <Send size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete([item.id!])}
                              className="text-red-600 hover:text-red-800"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">
                {currentPayment ? '编辑付款申请' : '新增付款申请'}
              </h3>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">收款人姓名</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 focus:outline-none"
                    value={formData.payeeName}
                    onChange={(e) => setFormData({ ...formData, payeeName: e.target.value })}
                    placeholder="请输入收款人姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">付款金额（元）</label>
                  <input
                    type="number"
                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-green-500 focus:outline-none"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">收款账号</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={formData.payeeAccount || ''}
                    onChange={(e) => setFormData({ ...formData, payeeAccount: e.target.value })}
                    placeholder="请输入收款账号"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开户银行</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={formData.payeeBank || ''}
                    onChange={(e) => setFormData({ ...formData, payeeBank: e.target.value })}
                    placeholder="请输入开户银行"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">付款方式</label>
                  <Select value={formData.paymentType} onValueChange={v => setFormData({...formData, paymentType: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TRANSFER">转账</SelectItem>
                      <SelectItem value="CASH">现金</SelectItem>
                      <SelectItem value="CHECK">支票</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">期望付款日期</label>
                  <DatePicker
                    type="date"
                    value={formData.expectedDate || ''}
                    onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">付款原因</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 h-24 focus:ring-2 focus:ring-green-500 focus:outline-none"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="请输入付款原因"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">附件URL（可选）</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={formData.attachmentUrl || ''}
                  onChange={(e) => setFormData({ ...formData, attachmentUrl: e.target.value })}
                  placeholder="请输入附件URL"
                />
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
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情查看对话框 */}
      {showDetailDialog && viewPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">付款申请详情</h3>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>单号: {viewPayment.paymentNo}</span>
                  <span>•</span>
                  <span>{getStatusBadge(viewPayment.status || 'DRAFT')}</span>
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">收款人</label>
                  <div className="text-sm text-slate-900">{viewPayment.payeeName}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">付款金额</label>
                  <div className="text-sm text-slate-900 font-medium">
                    ¥{viewPayment.amount?.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">收款账号</label>
                  <div className="text-sm text-slate-900">{viewPayment.payeeAccount || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">开户银行</label>
                  <div className="text-sm text-slate-900">{viewPayment.payeeBank || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">付款方式</label>
                  <div className="text-sm text-slate-900">
                    {paymentTypeMap[viewPayment.paymentType] || viewPayment.paymentType}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">期望付款日期</label>
                  <div className="text-sm text-slate-900">{viewPayment.expectedDate || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">申请人</label>
                  <div className="text-sm text-slate-900">{viewPayment.userName || '-'}</div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">创建时间</label>
                  <div className="text-sm text-slate-900">{viewPayment.createTime}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">付款原因</label>
                <div className="text-sm text-slate-900 bg-slate-50 p-3 rounded">
                  {viewPayment.reason}
                </div>
              </div>

              {viewPayment.attachmentUrl && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">附件</label>
                  <a
                    href={viewPayment.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-pink-500 hover:text-pink-700 underline"
                  >
                    查看附件
                  </a>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowDetailDialog(false)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
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

export default PaymentRequestPage;
