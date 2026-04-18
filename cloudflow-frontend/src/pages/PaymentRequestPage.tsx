import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, DollarSign, Edit, Eye, Paperclip, Plus, RotateCcw, Search, Send, Trash2, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { paymentRequestApi, PaymentRequest } from '../services/api/expense';
import { FileUpload } from '../components/FileUpload';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

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

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getPaymentTypeLabel = (paymentType?: string) =>
  PAYMENT_TYPE_LABELS[paymentType as keyof typeof PAYMENT_TYPE_LABELS] || paymentType || '-';

const getAttachmentList = (attachmentUrl?: string) =>
  attachmentUrl?.split(',').map(item => item.trim()).filter(Boolean) ?? [];

export const PaymentRequestPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    paymentType: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [paymentTypeInput, setPaymentTypeInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<PaymentRequest | null>(null);
  const [detailPayment, setDetailPayment] = useState<PaymentRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
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

  const applyStatusFilter = (status: string) => {
    setSearchParams(prev => ({ ...prev, status, pageNum: 1 }));
  };

  const applySearch = () => {
    setSearchParams(prev => ({ ...prev, paymentType: paymentTypeInput, pageNum: 1 }));
  };

  const handleResetFilters = () => {
    setPaymentTypeInput('');
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

  const handleView = async (payment: PaymentRequest) => {
    setDetailPayment(payment);
    setDetailLoading(true);
    try {
      const result = await paymentRequestApi.getInfo(payment.id!);
      setDetailPayment(result);
    } catch (error) {
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

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定要删除选中的付款申请吗？')) return;
    try {
      await paymentRequestApi.remove(ids);
      toast.success('删除成功');
      void fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定要提交该付款申请吗？提交后将进入审批流程。')) return;
    try {
      await paymentRequestApi.submit(id);
      toast.success('提交成功');
      void fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
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
      setShowDialog(false);
      setCurrentPayment(null);
      setFormData(createDefaultForm());
      void fetchPayments();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await paymentRequestApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('付款申请'));
      toast.success(total > 0 ? `已导出 ${total} 条付款申请，下载文件：${fileName}` : `已导出空结果，下载文件：${fileName}`);
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string }> = {
      DRAFT: { bg: 'border border-slate-200 bg-slate-50', text: 'text-slate-600' },
      PENDING: { bg: 'border border-cyan-200 bg-cyan-50', text: 'text-cyan-700' },
      APPROVED: { bg: 'border border-emerald-200 bg-emerald-50', text: 'text-emerald-600' },
      REJECTED: { bg: 'border border-rose-200 bg-rose-50', text: 'text-rose-600' },
      PAID: { bg: 'border border-amber-200 bg-amber-50', text: 'text-amber-700' },
    };
    const currentConfig = config[status] || config.DRAFT;
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${currentConfig.bg} ${currentConfig.text}`}>
        {STATUS_LABELS[status] || status}
      </span>
    );
  };

  const renderDetailValue = (value?: string | number | null) => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }
    return value;
  };

  const getActionHint = (status?: string) => {
    switch (status) {
      case 'DRAFT':
        return '可继续补充收款与付款信息';
      case 'PENDING':
        return '可查看审批进度与付款背景';
      case 'APPROVED':
        return '审批通过，待进入付款执行';
      case 'REJECTED':
        return '建议查看驳回原因后调整';
      case 'PAID':
        return '已完成付款，仅保留记录留痕';
      default:
        return '可查看申请详情';
    }
  };

  const statusQuickFilters = useMemo(() => ([
    { label: '全部', value: '' },
    { label: '草稿', value: 'DRAFT' },
    { label: '审批中', value: 'PENDING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '已付款', value: 'PAID' },
  ]), []);

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const hasActiveFilters = Boolean(searchParams.status || searchParams.paymentType);
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const currentStatusLabel = searchParams.status ? STATUS_LABELS[searchParams.status] || searchParams.status : '全部状态';
  const currentTypeLabel = searchParams.paymentType ? getPaymentTypeLabel(searchParams.paymentType) : '全部类型';
  const draftCount = payments.filter(item => item.status === 'DRAFT').length;
  const pendingCount = payments.filter(item => item.status === 'PENDING').length;
  const approvedCount = payments.filter(item => item.status === 'APPROVED').length;
  const totalAmount = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters ? `${currentStatusLabel} · ${currentTypeLabel}` : '默认视图下全部付款申请',
      icon: <DollarSign size={17} />,
    },
    {
      label: '待补充草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议优先补齐收款与账户信息' : '当前没有待补充草稿',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可快速查看当前审批进度' : '当前没有审批中的申请',
      icon: <Clock3 size={17} />,
    },
    {
      label: '累计申请金额',
      value: formatAmount(totalAmount),
      hint: approvedCount > 0 ? `已通过 ${approvedCount} 条，便于快速判断付款规模` : '用于快速判断当前付款规模',
      icon: <WalletCards size={17} />,
    },
  ]), [approvedCount, currentStatusLabel, currentTypeLabel, draftCount, hasActiveFilters, pendingCount, total, totalAmount]);

  const workspaceOverviewItems = [
    { label: '记录数', value: `${total} 条` },
    { label: '状态', value: currentStatusLabel },
    { label: '类型', value: currentTypeLabel },
    { label: '视图', value: hasActiveFilters ? '筛选结果' : '默认视图' },
  ];

  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const glassModalHeaderClass = 'sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-4';
  const glassModalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50/70 p-4';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-28 rounded-xl';
  const glassModalFooterClass = 'sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4';
  const glassSelectContentClass = '';
  const glassDetailCardClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600"><DollarSign size={14} />{todayLabel}</span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="付款申请"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button className="h-9 rounded-xl px-4" onClick={handleAdd}><Plus size={15} className="mr-2" />新建申请</Button>
              <Button variant="outline" className="h-9 rounded-xl px-4" onClick={handleExport}><Download size={15} className="mr-2 text-slate-500" />导出结果</Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="申请列表"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={workspaceOverviewItems}
              quickFilters={statusQuickFilters}
              activeQuickFilter={searchParams.status}
              onQuickFilterChange={applyStatusFilter}
              quickFilterAside={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-8 rounded-[18px] px-3.5"><RotateCcw size={15} className="mr-2" />清空所有条件</Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">当前未应用额外筛选</span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Select value={paymentTypeInput} onValueChange={setPaymentTypeInput}>
                    <SelectTrigger className="h-10 rounded-[18px] px-4"><SelectValue placeholder="按付款类型筛选" /></SelectTrigger>
                    <SelectContent className={glassSelectContentClass}>
                      <SelectItem className="rounded-[16px]" value="">全部类型</SelectItem>
                      {PAYMENT_TYPE_OPTIONS.map(option => (
                        <SelectItem key={option.value} className="rounded-[16px]" value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={applySearch} className="h-10 rounded-[18px] px-3.5"><Search size={15} className="mr-2" />应用筛选</Button>
                  <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-10 rounded-[18px] px-3.5"><RotateCcw size={15} className="mr-2" />清空条件</Button>
                </div>
              )}
            />

            <WorkspaceResultCard total={total} description="统一展示付款单、收款对象、金额和当前审批动作">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white/72 backdrop-blur-xl">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">付款单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">收款方</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">金额</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">付款类型</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">付款事由</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">创建时间</TableHead>
                      <TableActionHead className="px-4 py-3 w-52 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-white/70">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载付款申请..." />
                    ) : payments.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={8}
                        variant="glass"
                        icon={<DollarSign size={26} />}
                        title={hasActiveFilters ? '当前条件下暂无记录' : '暂无付款申请'}
                        description={hasActiveFilters ? '试试切换状态或付款类型筛选，或者直接新建一条付款申请。' : '创建新的付款申请后，这里会展示收款对象、金额和审批状态。'}
                      />
                    ) : payments.map(item => (
                      <tr key={item.id} className="bg-white/36 transition hover:bg-white/70">
                        <td className="px-4 py-2.5 text-sm text-slate-900">{item.paymentNo || '-'}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{item.payeeName}</td>
                        <td className="px-4 py-2.5 text-sm">{formatAmount(item.amount)}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-600">{getPaymentTypeLabel(item.paymentType)}</td>
                        <td className="max-w-xs truncate px-4 py-2.5 text-sm text-slate-600">{item.reason || '-'}</td>
                        <td className="px-4 py-2.5">{getStatusBadge(item.status || 'DRAFT')}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-600">{item.createTime || '-'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-right">
                          <div className="flex flex-col items-end gap-1">
                            <TableRowActions align="end" className="gap-1" actions={[
                              { label: '详情', icon: <Eye size={14} />, onClick: () => void handleView(item), tone: 'neutral', className: 'rounded-full bg-slate-50/90 px-2.5 ring-1 ring-slate-200/80 hover:bg-slate-100' },
                              { label: '编辑', icon: <Edit size={14} />, onClick: () => handleEdit(item.id!), tone: 'primary', hidden: item.status !== 'DRAFT', className: 'rounded-full bg-pink-50/90 px-2.5 ring-1 ring-pink-100' },
                              { label: '提交', icon: <Send size={14} />, onClick: () => handleSubmit(item.id!), tone: 'success', hidden: item.status !== 'DRAFT', className: 'rounded-full bg-emerald-50/90 px-2.5 ring-1 ring-emerald-100 text-emerald-700 hover:bg-emerald-100' },
                              { label: '删除', icon: <Trash2 size={14} />, onClick: () => handleDelete([item.id!]), tone: 'danger', hidden: item.status !== 'DRAFT', className: 'rounded-full bg-rose-50/90 px-2.5 ring-1 ring-rose-100 text-rose-600 hover:bg-rose-100' },
                            ]} />
                            <span className="text-[10px] font-medium text-slate-400">{getActionHint(item.status)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <WorkspacePaginationBar
                total={total}
                pageNum={searchParams.pageNum}
                totalPages={totalPages}
                onPrev={() => setSearchParams(prev => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))}
                onNext={() => setSearchParams(prev => ({ ...prev, pageNum: prev.pageNum + 1 }))}
                prevDisabled={searchParams.pageNum === 1}
                nextDisabled={searchParams.pageNum * searchParams.pageSize >= total}
              />
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
            <div className={`${glassModalShellClass} max-w-4xl`}>
              <div className={glassModalHeaderClass}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <DollarSign size={14} />
                      付款申请表单
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{currentPayment ? '编辑付款申请' : '新增付款申请'}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">整理收款对象、账户信息、付款类型和附件材料，形成完整的付款申请单。</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDialog(false)} className="rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础付款</div>
                    <div className="mt-1 text-sm text-slate-500">先确定收款方、金额、付款类型和期望日期，方便审批人快速判断付款背景。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>收款方名称 <span className="text-red-500">*</span></label>
                      <Input className={glassModalInputClass} type="text" value={formData.payeeName} onChange={e => setFormData(prev => ({ ...prev, payeeName: e.target.value }))} placeholder="请输入收款方名称" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>付款金额(元) <span className="text-red-500">*</span></label>
                      <Input className={glassModalInputClass} type="number" value={formData.amount || ''} onChange={e => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>付款类型</label>
                      <Select value={formData.paymentType} onValueChange={value => setFormData(prev => ({ ...prev, paymentType: value }))}>
                        <SelectTrigger className={glassModalInputClass}><SelectValue placeholder="请选择付款类型" /></SelectTrigger>
                        <SelectContent className={glassSelectContentClass}>
                          {PAYMENT_TYPE_OPTIONS.map(option => (
                            <SelectItem key={option.value} className="rounded-[16px]" value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>期望付款日期</label>
                      <DatePicker className={glassModalInputClass} type="date" value={formData.expectedDate || ''} onChange={e => setFormData(prev => ({ ...prev, expectedDate: e.target.value }))} />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">账户信息</div>
                    <div className="mt-1 text-sm text-slate-500">补充收款账号和开户银行，保证后续执行付款时信息可直接核对。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>收款账号</label>
                      <Input className={glassModalInputClass} type="text" value={formData.payeeAccount || ''} onChange={e => setFormData(prev => ({ ...prev, payeeAccount: e.target.value }))} placeholder="请输入收款账号" />
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>开户银行</label>
                      <Input className={glassModalInputClass} type="text" value={formData.payeeBank || ''} onChange={e => setFormData(prev => ({ ...prev, payeeBank: e.target.value }))} placeholder="请输入开户银行" />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请说明</div>
                    <div className="mt-1 text-sm text-slate-500">用一段简洁说明交代付款用途、背景和付款必要性。</div>
                  </div>
                  <label className={glassModalLabelClass}>付款事由 <span className="text-red-500">*</span></label>
                  <Textarea className={glassModalTextareaClass} value={formData.reason} onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))} placeholder="例如：供应商项目尾款、驻场服务费、场地租赁费、办公采购付款等" />
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">附件材料</div>
                    <div className="mt-1 text-sm text-slate-500">可附上合同、发票、付款通知或审批附件，帮助审批人与财务快速核实背景。</div>
                  </div>
                  <FileUpload value={formData.attachmentUrl || ''} onChange={urls => setFormData(prev => ({ ...prev, attachmentUrl: urls }))} maxCount={5} hint="可上传合同、付款通知、发票或收款凭证，最多 5 个文件" />
                </section>
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl px-5">取消</Button>
                <Button onClick={handleSave} className="rounded-2xl px-5">保存</Button>
              </div>
            </div>
          </div>
        )}

        {detailPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm" onClick={() => !detailLoading && setDetailPayment(null)}>
            <div className={`flex max-h-[90vh] max-w-5xl flex-col ${glassModalShellClass}`} onClick={e => e.stopPropagation()}>
              <div className={glassModalHeaderClass}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Eye size={14} />
                      申请详情
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{detailPayment.paymentNo || '付款申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{detailPayment.payeeName || '-'}</span>
                      {getStatusBadge(detailPayment.status || 'DRAFT')}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDetailPayment(null)} className="rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {detailLoading ? (
                  <WorkspaceInlineState type="loading" title="正在加载付款详情..." className="py-12" />
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">收款方</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.payeeName)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">付款金额</div><div className="mt-2 text-sm font-semibold text-slate-900">{formatAmount(detailPayment.amount)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">付款类型</div><div className="mt-2 text-sm font-semibold text-slate-900">{getPaymentTypeLabel(detailPayment.paymentType)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">收款账号</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.payeeAccount)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">开户银行</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.payeeBank)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">期望付款日期</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.expectedDate)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">申请人</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.userName)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">所属部门</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.deptName)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">创建时间</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailPayment.createTime)}</div></div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="text-sm font-semibold text-slate-900">付款事由</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">{detailPayment.reason || '-'}</div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">附件</div>
                        <div className="text-xs text-slate-400">支持直接打开已上传文件</div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {getAttachmentList(detailPayment.attachmentUrl).length ? (
                          getAttachmentList(detailPayment.attachmentUrl).map(url => {
                            const label = url.split('/').pop() || '附件';
                            return (
                              <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-cyan-200 hover:bg-white hover:text-cyan-700">
                                <Paperclip size={14} />
                                <span className="truncate">{label}</span>
                              </a>
                            );
                          })
                        ) : (
                          <WorkspaceInlineState title="暂无附件" description="当前付款单还没有上传附件材料。" className="py-5" />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setDetailPayment(null)} className="rounded-2xl px-5">关闭</Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default PaymentRequestPage;
