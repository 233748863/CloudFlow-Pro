import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Download, Edit, Eye, Plus, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { paymentRequestApi, PaymentRequest } from '../services/api/expense';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  DatePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';

const PAYMENT_TYPE_OPTIONS = [
  { value: 'PURCHASE', label: '采购' },
  { value: 'SERVICE', label: '服务' },
  { value: 'RENT', label: '租金' },
  { value: 'OTHER', label: '其他' },
] as const;

const PAYMENT_TYPE_LABELS = Object.fromEntries(
  PAYMENT_TYPE_OPTIONS.map(option => [option.value, option.label]),
) as Record<(typeof PAYMENT_TYPE_OPTIONS)[number]['value'], string>;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PAID: '已付款',
};

const createDefaultForm = (): PaymentRequest => ({
  payeeName: '',
  payeeAccount: '',
  payeeBank: '',
  amount: 0,
  paymentType: 'PURCHASE',
  reason: '',
  expectedDate: '',
  attachmentUrl: '',
});

const formatAmount = (amount?: number) =>
  Number(amount || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getPaymentTypeLabel = (paymentType?: string) =>
  PAYMENT_TYPE_LABELS[paymentType as keyof typeof PAYMENT_TYPE_LABELS] || paymentType || '-';

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
  const [formData, setFormData] = useState<PaymentRequest>(createDefaultForm());

  useEffect(() => {
    void fetchPayments();
  }, [searchParams]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const result = await paymentRequestApi.list(searchParams);
      setPayments(result.records || result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取付款申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setCurrentPayment(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const handleView = async (id: number) => {
    try {
      const result = await paymentRequestApi.getInfo(id);
      setViewPayment(result);
      setShowDetailDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取付款申请详情失败'));
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const result = await paymentRequestApi.getInfo(id);
      setCurrentPayment(result);
      setFormData({
        ...createDefaultForm(),
        ...result,
      });
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取付款申请详情失败'));
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定要删除选中的付款申请吗？')) {
      return;
    }

    try {
      await paymentRequestApi.remove(ids);
      toast.success('删除成功');
      await fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定要提交该付款申请吗？提交后将进入审批流程。')) {
      return;
    }

    try {
      await paymentRequestApi.submit(id);
      toast.success('提交成功');
      await fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
    }
  };

  const handleSave = async () => {
    if (!formData.payeeName.trim() || !formData.reason.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    if (formData.amount <= 0) {
      toast.error('付款金额必须大于 0');
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
      setCurrentPayment(null);
      setFormData(createDefaultForm());
      await fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleSearch = () => {
    setSearchParams(prev => ({ ...prev, pageNum: 1 }));
  };

  const handleReset = () => {
    setSearchParams({
      status: '',
      paymentType: '',
      pageNum: 1,
      pageSize: 10,
    });
  };

  const handleExport = async () => {
    try {
      const blob = await paymentRequestApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('付款申请'));
      toast.success(
        total > 0
          ? `已导出 ${total} 条付款申请，下载文件：${fileName}`
          : `已导出空结果，下载文件：${fileName}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / searchParams.pageSize)),
    [searchParams.pageSize, total],
  );

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'bg-slate-100', text: 'text-slate-600' },
      PENDING: { bg: 'bg-pink-50', text: 'text-pink-500' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-600' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-600' },
      PAID: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    };
    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span className={`rounded px-2 py-0.5 text-xs ${config.bg} ${config.text}`}>
        {STATUS_LABELS[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <DollarSign className="text-green-600" />
          付款申请
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-green-200 bg-white px-4 py-2 text-green-600 transition-colors hover:bg-green-50"
          >
            <Download size={18} />
            导出 Excel
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
          >
            <Plus size={18} />
            新增付款申请
          </button>
        </div>
      </div>

      <div className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 p-4">
          <div className="flex gap-3">
            <Select value={searchParams.status} onValueChange={value => setSearchParams(prev => ({ ...prev, status: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="请选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部状态</SelectItem>
                <SelectItem value="DRAFT">草稿</SelectItem>
                <SelectItem value="PENDING">审批中</SelectItem>
                <SelectItem value="APPROVED">已通过</SelectItem>
                <SelectItem value="REJECTED">已驳回</SelectItem>
                <SelectItem value="PAID">已付款</SelectItem>
              </SelectContent>
            </Select>

            <Select value={searchParams.paymentType} onValueChange={value => setSearchParams(prev => ({ ...prev, paymentType: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="请选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部类型</SelectItem>
                {PAYMENT_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              onClick={handleSearch}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
            >
              <Search size={16} />
              搜索
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-300"
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
                <TableHead>付款单号</TableHead>
                <TableHead>收款方</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>付款类型</TableHead>
                <TableHead>付款事由</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableActionHead className="w-64">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-green-600" />
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
                payments.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{item.paymentNo}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{item.payeeName}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">￥{formatAmount(item.amount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{getPaymentTypeLabel(item.paymentType)}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-600">{item.reason}</td>
                    <td className="px-4 py-3">{getStatusBadge(item.status || 'DRAFT')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.createTime || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
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

        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <span className="text-sm text-slate-600">共 {total} 条</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSearchParams(prev => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))}
              disabled={searchParams.pageNum === 1}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-3 py-1 text-sm">第 {searchParams.pageNum} / {totalPages} 页</span>
            <button
              onClick={() => setSearchParams(prev => ({ ...prev, pageNum: prev.pageNum + 1 }))}
              disabled={searchParams.pageNum * searchParams.pageSize >= total}
              className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-800">
                {currentPayment ? '编辑付款申请' : '新增付款申请'}
              </h3>
            </div>

            <div className="space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">收款方名称</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={formData.payeeName}
                    onChange={event => setFormData(prev => ({ ...prev, payeeName: event.target.value }))}
                    placeholder="请输入收款方名称"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">付款金额（元）</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    value={formData.amount}
                    onChange={event => setFormData(prev => ({ ...prev, amount: parseFloat(event.target.value) || 0 }))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">收款账号</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 p-2"
                    value={formData.payeeAccount || ''}
                    onChange={event => setFormData(prev => ({ ...prev, payeeAccount: event.target.value }))}
                    placeholder="请输入收款账号"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">开户银行</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 p-2"
                    value={formData.payeeBank || ''}
                    onChange={event => setFormData(prev => ({ ...prev, payeeBank: event.target.value }))}
                    placeholder="请输入开户银行"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">付款类型</label>
                  <Select
                    value={formData.paymentType}
                    onValueChange={value => setFormData(prev => ({ ...prev, paymentType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择付款类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">期望付款日期</label>
                  <DatePicker
                    type="date"
                    value={formData.expectedDate || ''}
                    onChange={event => setFormData(prev => ({ ...prev, expectedDate: event.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">付款事由</label>
                <textarea
                  className="h-24 w-full rounded-lg border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={formData.reason}
                  onChange={event => setFormData(prev => ({ ...prev, reason: event.target.value }))}
                  placeholder="请输入付款事由"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">附件 URL（可选）</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 p-2"
                  value={formData.attachmentUrl || ''}
                  onChange={event => setFormData(prev => ({ ...prev, attachmentUrl: event.target.value }))}
                  placeholder="请输入附件 URL"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-slate-50 p-4">
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-300"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailDialog && viewPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="mb-2 text-xl font-bold text-slate-800">付款申请详情</h3>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>单号：{viewPayment.paymentNo || '-'}</span>
                  <span>•</span>
                  <span>{getStatusBadge(viewPayment.status || 'DRAFT')}</span>
                </div>
              </div>
              <button
                onClick={() => setShowDetailDialog(false)}
                className="text-2xl text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">收款方</label>
                  <div className="text-sm text-slate-900">{viewPayment.payeeName}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">付款金额</label>
                  <div className="text-sm font-medium text-slate-900">￥{formatAmount(viewPayment.amount)}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">收款账号</label>
                  <div className="text-sm text-slate-900">{viewPayment.payeeAccount || '-'}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">开户银行</label>
                  <div className="text-sm text-slate-900">{viewPayment.payeeBank || '-'}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">付款类型</label>
                  <div className="text-sm text-slate-900">{getPaymentTypeLabel(viewPayment.paymentType)}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">期望付款日期</label>
                  <div className="text-sm text-slate-900">{viewPayment.expectedDate || '-'}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">申请人</label>
                  <div className="text-sm text-slate-900">{viewPayment.userName || '-'}</div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">创建时间</label>
                  <div className="text-sm text-slate-900">{viewPayment.createTime || '-'}</div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">付款事由</label>
                <div className="rounded bg-slate-50 p-3 text-sm text-slate-900">{viewPayment.reason}</div>
              </div>

              {viewPayment.attachmentUrl && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">附件</label>
                  <a
                    href={viewPayment.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-pink-500 underline hover:text-pink-700"
                  >
                    查看附件
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-4">
              <button
                onClick={() => setShowDetailDialog(false)}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
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
