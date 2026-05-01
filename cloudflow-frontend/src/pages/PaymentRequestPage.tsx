import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Download, DollarSign, Edit, Eye, Paperclip, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { paymentRequestApi, PaymentRequest } from '@/services/api/expense';
import FileUpload from '@/components/FileUpload';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

const PAYMENT_TYPE_OPTIONS = [
  { value: 'PURCHASE', label: '采购' },
  { value: 'SERVICE', label: '服务' },
  { value: 'RENT', label: '租金' },
  { value: 'OTHER', label: '其他' },
] as const;

const PAYMENT_TYPE_LABELS = Object.fromEntries(
  PAYMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<(typeof PAYMENT_TYPE_OPTIONS)[number]['value'], string>;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PAID: '已付款',
};

interface ConfirmState {
  type: 'delete' | 'submit' | 'pay';
  id: number;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <DollarSign className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Clock3 className="h-4 w-4 animate-spin" /> : icon || <DollarSign className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={['grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3', className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={[
      'border-b border-slate-100 pb-3 dark:border-slate-800',
      alignStart ? 'md:col-span-2 xl:col-span-3' : '',
    ].filter(Boolean).join(' ')}
  >
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }

  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getPaymentTypeLabel = (paymentType?: string) =>
  PAYMENT_TYPE_LABELS[paymentType as keyof typeof PAYMENT_TYPE_LABELS] || paymentType || '-';

const getAttachmentList = (attachmentUrl?: string) =>
  attachmentUrl?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];

export const PaymentRequestPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    paymentType: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [paymentTypeDraft, setPaymentTypeDraft] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<PaymentRequest | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<PaymentRequest>(createDefaultForm());
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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

  const draftCount = useMemo(
    () => payments.filter((item) => item.status === 'DRAFT').length,
    [payments],
  );
  const pendingCount = useMemo(
    () => payments.filter((item) => item.status === 'PENDING').length,
    [payments],
  );
  const approvedCount = useMemo(
    () => payments.filter((item) => item.status === 'APPROVED').length,
    [payments],
  );
  const paidCount = useMemo(
    () => payments.filter((item) => item.status === 'PAID').length,
    [payments],
  );

  const hasActiveFilters = Boolean(searchParams.status || searchParams.paymentType);
  const currentStatusLabel = searchParams.status
    ? STATUS_LABELS[searchParams.status] || searchParams.status
    : '全部状态';
  const currentTypeLabel = searchParams.paymentType
    ? getPaymentTypeLabel(searchParams.paymentType)
    : '全部类型';
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));

  const handleApplyFilters = () => {
    setSearchParams((prev) => ({
      ...prev,
      paymentType: paymentTypeDraft,
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setPaymentTypeDraft('');
    setSearchParams({
      status: '',
      paymentType: '',
      pageNum: 1,
      pageSize: 10,
    });
  };

  const handleAdd = () => {
    setCurrentPayment(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const closeFormDialog = () => {
    setShowDialog(false);
    setCurrentPayment(null);
    setFormData(createDefaultForm());
  };

  const closeDetailDialog = () => {
    setDetailLoading(false);
    setDetailPayment(null);
  };

  const handleView = async (payment: PaymentRequest) => {
    setDetailPayment(payment);
    setDetailLoading(true);
    try {
      const result = await paymentRequestApi.getInfo(payment.id!);
      setDetailPayment(result);
    } catch (error) {
      closeDetailDialog();
      toast.error(getErrorMessage(error, '获取付款申请详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const result = await paymentRequestApi.getInfo(id);
      setCurrentPayment(result);
      setFormData({ ...createDefaultForm(), ...result });
      setShowDialog(true);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取付款申请详情失败'));
    }
  };

  const handleSave = async () => {
    if (!formData.payeeName.trim() || !formData.reason.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    if (Number(formData.amount) <= 0) {
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

      closeFormDialog();
      await fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const openDeleteConfirm = (id: number) => {
    setConfirmState({
      type: 'delete',
      id,
      title: '删除付款申请',
      message: '删除后当前草稿不可恢复。',
      confirmText: '删除',
      danger: true,
    });
  };

  const openSubmitConfirm = (id: number) => {
    setConfirmState({
      type: 'submit',
      id,
      title: '提交付款申请',
      message: '提交后将进入审批流程。',
      confirmText: '提交',
    });
  };

  const openPayConfirm = (id: number) => {
    setConfirmState({
      type: 'pay',
      id,
      title: '确认付款',
      message: '确认后付款单将标记为已付款，并同步回写采购单付款状态。',
      confirmText: '确认付款',
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState) {
      return;
    }

    const currentState = confirmState;
    setConfirmState(null);

    try {
      if (currentState.type === 'delete') {
        await paymentRequestApi.remove([currentState.id]);
        toast.success('删除成功');
      } else if (currentState.type === 'pay') {
        await paymentRequestApi.confirmPaid(currentState.id);
        toast.success('已确认付款');
      } else {
        await paymentRequestApi.submit(currentState.id);
        toast.success('提交成功');
      }

      await fetchPayments();
      setDetailPayment((prev) => (prev?.id === currentState.id ? null : prev));
    } catch (error) {
      toast.error(getErrorMessage(
        error,
        currentState.type === 'delete'
          ? '删除失败'
          : currentState.type === 'pay'
            ? '确认付款失败'
            : '提交失败',
      ));
    }
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

  const getStatusBadge = (status?: string) => {
    const toneMap: Record<string, string> = {
      DRAFT: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      PENDING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
      APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
      REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
      PAID: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    };

    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneMap[status || 'DRAFT'] || toneMap.DRAFT}`}>
        {STATUS_LABELS[status || 'DRAFT'] || status || '-'}
      </span>
    );
  };

  const renderDetailValue = (value?: string | number | null) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return value;
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="w-full sm:w-[180px]">
                <Select
                  value={searchParams.status || 'ALL'}
                  onValueChange={(value) =>
                    setSearchParams((prev) => ({
                      ...prev,
                      status: value === 'ALL' ? '' : value,
                      pageNum: 1,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[180px]">
                <Select
                  value={paymentTypeDraft || 'ALL'}
                  onValueChange={(value) => setPaymentTypeDraft(value === 'ALL' ? '' : value)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="付款类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部类型</SelectItem>
                    {PAYMENT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-[280px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{hasActiveFilters ? `${currentStatusLabel} / ${currentTypeLabel}` : '全部'}</span>
                <span>第 {searchParams.pageNum} / {totalPages} 页</span>
                <span>共 {total} 条</span>
                <span>草稿 {draftCount}</span>
                <span>审批中 {pendingCount}</span>
                <span>已通过 {approvedCount}</span>
                <span>已付款 {paidCount}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={handleApplyFilters}>
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download size={14} className="mr-1.5" />
                导出结果
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      付款单号
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      收款方 / 账户
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请人 / 部门
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      类型 / 日期
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      金额
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      付款事由
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      状态
                    </TableHead>
                    <TableActionHead className="w-40 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载付款申请..." loading />
                  ) : payments.length === 0 ? (
                    <TableStateRow
                      colSpan={8}
                      title={hasActiveFilters ? '当前筛选下暂无记录' : '暂无付款申请'}
                    />
                  ) : (
                    payments.map((item) => (
                      <tr key={item.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.paymentNo || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatDateTimeDisplay(item.createTime)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.payeeName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {item.payeeAccount || item.payeeBank || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.userName || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.deptName || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{getPaymentTypeLabel(item.paymentType)}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.expectedDate || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{formatAmount(item.amount)}</td>
                        <td className="max-w-sm truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {item.reason || '-'}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            iconOnly
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => void handleView(item),
                                tone: 'neutral',
                                className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                              },
                              {
                                label: '编辑',
                                icon: <Edit size={14} />,
                                onClick: () => void handleEdit(item.id!),
                                tone: 'primary',
                                hidden: item.status !== 'DRAFT',
                                className: 'rounded-lg',
                              },
                              {
                                label: '提交',
                                icon: <Send size={14} />,
                                onClick: () => openSubmitConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'DRAFT',
                                className: 'rounded-lg',
                              },
                              {
                                label: '付款',
                                icon: <CheckCircle2 size={14} />,
                                onClick: () => openPayConfirm(item.id!),
                                tone: 'success',
                                hidden: item.status !== 'APPROVED',
                                className: 'rounded-lg',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm(item.id!),
                                tone: 'danger',
                                hidden: item.status !== 'DRAFT',
                                className: 'rounded-lg',
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
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showDialog}
        title={currentPayment ? '编辑付款申请' : '新建付款申请'}
        onClose={closeFormDialog}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeFormDialog}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>
              保存
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                收款方名称
              </label>
              <Input
                className="h-11"
                type="text"
                value={formData.payeeName}
                onChange={(event) => setFormData((prev) => ({ ...prev, payeeName: event.target.value }))}
                placeholder="请输入收款方名称"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                付款金额
              </label>
              <Input
                className="h-11"
                type="number"
                value={formData.amount || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, amount: parseFloat(event.target.value) || 0 }))}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                付款类型
              </label>
              <Select
                value={formData.paymentType}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, paymentType: value }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="请选择付款类型" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                期望付款日期
              </label>
              <DatePicker
                className="h-11"
                type="date"
                value={formData.expectedDate || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, expectedDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                收款账号
              </label>
              <Input
                className="h-11"
                type="text"
                value={formData.payeeAccount || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, payeeAccount: event.target.value }))}
                placeholder="请输入收款账号"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                开户银行
              </label>
              <Input
                className="h-11"
                type="text"
                value={formData.payeeBank || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, payeeBank: event.target.value }))}
                placeholder="请输入开户银行"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              付款事由
            </label>
            <Textarea
              className="min-h-[120px] resize-none"
              value={formData.reason}
              onChange={(event) => setFormData((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="填写付款原因"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              附件
            </label>
            <FileUpload
              value={formData.attachmentUrl || ''}
              onChange={(urls) => setFormData((prev) => ({ ...prev, attachmentUrl: urls }))}
              maxCount={5}
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailPayment)}
        title={detailPayment?.paymentNo || '付款申请详情'}
        onClose={closeDetailDialog}
        width="wide"
        headerAside={detailPayment && !detailLoading ? getStatusBadge(detailPayment.status) : null}
        bodyClassName="space-y-4"
        footer={(
          <Button variant="outline" onClick={closeDetailDialog}>
            关闭
          </Button>
        )}
      >
        {detailLoading ? (
          <InlineState title="正在加载付款详情..." className="py-12" icon={<Clock3 className="h-4 w-4 animate-spin" />} />
        ) : detailPayment ? (
          <>
            <DetailRows>
              <DetailRow label="收款方" value={renderDetailValue(detailPayment.payeeName)} />
              <DetailRow label="付款金额" value={formatAmount(detailPayment.amount)} />
              <DetailRow label="付款类型" value={getPaymentTypeLabel(detailPayment.paymentType)} />
              <DetailRow label="期望付款日期" value={renderDetailValue(detailPayment.expectedDate)} />
              <DetailRow label="收款账号" value={renderDetailValue(detailPayment.payeeAccount)} />
              <DetailRow label="开户银行" value={renderDetailValue(detailPayment.payeeBank)} />
              <DetailRow label="申请人" value={renderDetailValue(detailPayment.userName)} />
              <DetailRow label="所属部门" value={renderDetailValue(detailPayment.deptName)} />
              <DetailRow label="流程实例" value={renderDetailValue(detailPayment.instanceId)} />
              <DetailRow label="创建时间" value={formatDateTimeDisplay(detailPayment.createTime)} />
              <DetailRow label="更新时间" value={formatDateTimeDisplay(detailPayment.updateTime)} />
            </DetailRows>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">付款事由</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailPayment.reason || '-'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">附件</div>
              {getAttachmentList(detailPayment.attachmentUrl).length ? (
                <div className="space-y-2">
                  {getAttachmentList(detailPayment.attachmentUrl).map((url) => {
                    const label = url.split('/').pop() || '附件';
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-cyan-200 hover:bg-slate-50 hover:text-cyan-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
                      >
                        <Paperclip size={14} />
                        <span className="truncate">{label}</span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <InlineState title="暂无附件" className="py-5" icon={<Paperclip className="h-4 w-4" />} />
              )}
            </div>
          </>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default PaymentRequestPage;
