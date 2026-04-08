import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Download, Edit, Eye, Plus, Receipt, RotateCcw, Search, Send, Trash2, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { expenseClaimApi, ExpenseClaim, ExpenseItem } from '../services/api/expense';
import { buildExcelFileName, downloadBlob } from '@/utils/download';
import { getErrorMessage } from '@/utils/errorMessage';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceEmptyPanel } from '@/components/workspace/WorkspacePrimitives';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const createDefaultItem = (): ExpenseItem => ({
  expenseType: 'TRANSPORT',
  amount: 0,
  expenseDate: '',
  description: '',
  receiptUrl: '',
});

const createDefaultForm = (): ExpenseClaim => ({
  category: 'TRAVEL',
  description: '',
  items: [createDefaultItem()],
});

export const ExpenseClaimPage: React.FC = () => {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    category: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [categoryInput, setCategoryInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [currentClaim, setCurrentClaim] = useState<ExpenseClaim | null>(null);
  const [detailClaim, setDetailClaim] = useState<ExpenseClaim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formData, setFormData] = useState<ExpenseClaim>(createDefaultForm());

  useEffect(() => {
    void fetchClaims();
  }, [searchParams]);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await expenseClaimApi.list(searchParams);
      if (res) {
        setClaims(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取报销申请列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const applyStatusFilter = (status: string) => {
    setSearchParams(prev => ({ ...prev, status, pageNum: 1 }));
  };

  const applySearch = () => {
    setSearchParams(prev => ({ ...prev, category: categoryInput, pageNum: 1 }));
  };

  const handleResetFilters = () => {
    setCategoryInput('');
    setSearchParams({
      status: '',
      category: '',
      pageNum: 1,
      pageSize: 10,
    });
  };

  const handleAdd = () => {
    setCurrentClaim(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const handleView = async (claim: ExpenseClaim) => {
    setDetailClaim(claim);
    setDetailLoading(true);
    try {
      const res = await expenseClaimApi.getInfo(claim.id!);
      if (res) {
        setDetailClaim(res);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取报销申请详情失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await expenseClaimApi.getInfo(id);
      if (res) {
        setCurrentClaim(res);
        setFormData({
          ...createDefaultForm(),
          ...res,
          items: res.items?.length ? res.items : [createDefaultItem()],
        });
        setShowDialog(true);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取报销申请详情失败'));
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm('确定要删除选中的报销申请吗？')) return;
    try {
      await expenseClaimApi.remove(ids);
      toast.success('删除成功');
      void fetchClaims();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleSubmit = async (id: number) => {
    if (!confirm('确定要提交该报销申请吗？提交后将进入审批流程。')) return;
    try {
      await expenseClaimApi.submit(id);
      toast.success('提交成功');
      void fetchClaims();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败'));
    }
  };

  const handleSave = async () => {
    if (!formData.category || !formData.description?.trim()) {
      toast.error('请填写完整信息');
      return;
    }

    if (!formData.items || formData.items.length === 0) {
      toast.error('请至少添加一条报销明细');
      return;
    }

    for (const item of formData.items) {
      if (!item.expenseType || !item.amount || !item.expenseDate) {
        toast.error('请填写完整的报销明细信息');
        return;
      }
      if (Number(item.amount) <= 0) {
        toast.error('报销金额必须大于 0');
        return;
      }
    }

    try {
      const totalAmount = formData.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const data = { ...formData, totalAmount };
      if (currentClaim?.id) {
        await expenseClaimApi.edit(data);
        toast.success('更新成功');
      } else {
        await expenseClaimApi.add(data);
        toast.success('创建成功');
      }
      setShowDialog(false);
      void fetchClaims();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const addItem = () => {
    setFormData(prev => ({ ...prev, items: [...(prev.items || []), createDefaultItem()] }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => {
      const nextItems = [...(prev.items || [])];
      nextItems.splice(index, 1);
      return { ...prev, items: nextItems.length ? nextItems : [createDefaultItem()] };
    });
  };

  const updateItem = (index: number, field: keyof ExpenseItem, value: string | number) => {
    setFormData(prev => {
      const nextItems = [...(prev.items || [])];
      nextItems[index] = { ...nextItems[index], [field]: value };
      return { ...prev, items: nextItems };
    });
  };

  const handleExport = async () => {
    try {
      const blob = await expenseClaimApi.export(searchParams);
      const fileName = downloadBlob(blob, buildExcelFileName('报销申请'));
      toast.success(total > 0 ? `已导出 ${total} 条报销申请，下载文件：${fileName}` : `已导出空结果，下载文件：${fileName}`);
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败'));
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
    const config: Record<string, string> = {
      DRAFT: 'bg-white/82 text-slate-600 ring-1 ring-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
      PENDING: 'bg-pink-50/88 text-pink-600 ring-1 ring-pink-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
      APPROVED: 'bg-emerald-50/88 text-emerald-600 ring-1 ring-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
      REJECTED: 'bg-rose-50/88 text-rose-600 ring-1 ring-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
      PAID: 'bg-amber-50/88 text-amber-700 ring-1 ring-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
    };
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config[status] || config.DRAFT}`}>{statusMap[status] || status}</span>;
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
        return '可继续补充明细并提交审批';
      case 'PENDING':
        return '可查看单据明细与审批状态';
      case 'APPROVED':
        return '审批通过，可继续核对报销凭证';
      case 'REJECTED':
        return '建议查看驳回原因后重新整理';
      case 'PAID':
        return '已完成打款，仅保留记录留痕';
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
    { label: '已打款', value: 'PAID' },
  ]), []);

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const hasActiveFilters = Boolean(searchParams.status || searchParams.category);
  const currentStatusLabel = searchParams.status ? statusMap[searchParams.status] || searchParams.status : '全部状态';
  const currentCategoryLabel = searchParams.category ? categoryMap[searchParams.category] || searchParams.category : '全部类别';
  const draftCount = claims.filter(item => item.status === 'DRAFT').length;
  const pendingCount = claims.filter(item => item.status === 'PENDING').length;
  const approvedCount = claims.filter(item => item.status === 'APPROVED').length;
  const totalAmount = claims.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const formTotalAmount = formData.items?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;

  const heroMetrics = useMemo(() => ([
    {
      label: '当前结果',
      value: `${total}`,
      hint: hasActiveFilters ? `${currentStatusLabel} · ${currentCategoryLabel}` : '默认视图下全部报销申请',
      panelClassName: 'border-slate-200/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(248,250,252,0.78))]',
      iconWrapClassName: 'bg-white/82 text-slate-700 ring-1 ring-slate-200/85',
      glowClassName: 'from-slate-100/95 via-slate-50/40 to-transparent',
      icon: <Receipt size={17} />,
    },
    {
      label: '待补充草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议先把金额与凭证整理完整' : '当前没有待补充草稿',
      panelClassName: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.82),rgba(255,247,237,0.82))]',
      iconWrapClassName: 'bg-white/88 text-amber-700 ring-1 ring-amber-100',
      glowClassName: 'from-amber-100/90 via-orange-50/45 to-transparent',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可快速查看当前审批进度' : '当前没有审批中的申请',
      panelClassName: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.82),rgba(255,241,242,0.8))]',
      iconWrapClassName: 'bg-white/88 text-pink-600 ring-1 ring-pink-100',
      glowClassName: 'from-pink-100/90 via-rose-50/45 to-transparent',
      icon: <Clock3 size={17} />,
    },
    {
      label: '累计报销金额',
      value: formatAmount(totalAmount),
      hint: approvedCount > 0 ? `已通过 ${approvedCount} 条，便于快速估算支出规模` : '用于快速判断当前报销规模',
      panelClassName: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.82),rgba(236,254,255,0.78))]',
      iconWrapClassName: 'bg-white/88 text-emerald-600 ring-1 ring-emerald-100',
      glowClassName: 'from-emerald-100/90 via-cyan-50/45 to-transparent',
      icon: <WalletCards size={17} />,
    },
  ]), [approvedCount, currentCategoryLabel, currentStatusLabel, draftCount, hasActiveFilters, pendingCount, total, totalAmount]);

  const workspaceOverviewItems = [
    { label: '记录数', value: `${total} 条` },
    { label: '状态', value: currentStatusLabel },
    { label: '类别', value: currentCategoryLabel },
    { label: '视图', value: hasActiveFilters ? '筛选结果' : '默认视图' },
  ];

  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] shadow-[0_30px_80px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-2xl';
  const glassModalHeaderClass = 'sticky top-0 z-10 overflow-hidden border-b border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] px-6 pb-5 pt-6 backdrop-blur-2xl';
  const glassModalSectionClass = 'relative overflow-visible rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-12 rounded-[20px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md';
  const glassModalTextareaClass = 'min-h-28 rounded-[22px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md';
  const glassModalFooterClass = 'sticky bottom-0 flex justify-end gap-3 border-t border-white/75 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.74))] px-6 py-5 backdrop-blur-2xl';
  const glassSelectContentClass = 'rounded-[22px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.78))] p-1 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur-2xl';
  const glassDetailCardClass = 'rounded-[22px] border border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.7))] p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-3">
        <Card className="overflow-hidden rounded-[30px] border-white/80 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="relative p-4 sm:p-5">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_55%)]" />
            <div className="absolute -right-14 top-4 h-32 w-32 rounded-full bg-amber-200/25 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-16 w-16 rounded-full bg-pink-100/45 blur-2xl" />
            <div className="relative space-y-3">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-600 ring-1 ring-amber-100"><Receipt size={14} />{todayLabel}</span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
                  </div>
                  <h1 className="mt-3 text-[1.9rem] font-bold tracking-tight text-slate-950 sm:text-[2.15rem]">报销申请</h1>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button className="h-9 rounded-xl bg-pink-500 px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.2)] hover:bg-pink-600" onClick={handleAdd}><Plus size={15} className="mr-2" />新建申请</Button>
                  <Button variant="outline" className="h-9 rounded-xl bg-white/85 px-4" onClick={handleExport}><Download size={15} className="mr-2 text-pink-500" />导出结果</Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {heroMetrics.map(item => (
                  <div key={item.label} className={`group relative overflow-hidden rounded-[22px] border px-3.5 py-3 shadow-[0_16px_32px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 ${item.panelClassName}`}>
                    <div className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-br ${item.glowClassName}`} />
                    <div className="relative flex min-h-[82px] flex-col justify-between gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400/90">{item.label}</div>
                          <div className="mt-1 text-[1.32rem] font-bold tracking-tight text-slate-950">{item.value}</div>
                        </div>
                        <div className={`rounded-[14px] p-2 shadow-[0_10px_22px_rgba(15,23,42,0.06)] backdrop-blur-md ${item.iconWrapClassName}`}>{item.icon}</div>
                      </div>
                      <div className="max-w-full truncate text-[10px] leading-4 text-slate-600">{item.hint}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04)] backdrop-blur-xl">
              <div className="relative px-4 py-4">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.09),transparent_60%)]" />
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">记录</div>
                      <div className="mt-2 text-[1.65rem] font-bold tracking-tight text-slate-950">申请列表</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">{hasActiveFilters ? '已应用筛选' : '默认视图'}</span>
                      <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">共 {total} 条</span>
                    </div>
                  </div>

                  <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
                    {workspaceOverviewItems.map(item => (
                      <div key={item.label} className="rounded-[18px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] px-3.5 py-2.5 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                        <div className="mt-1.5 text-sm font-semibold tracking-tight">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.76),rgba(255,255,255,0.72))] px-4 py-4 backdrop-blur-xl">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-[20px] bg-white/78 p-1 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-md">
                      {statusQuickFilters.map(item => {
                        const active = searchParams.status === item.value;
                        return (
                          <button key={item.value || 'ALL'} type="button" onClick={() => applyStatusFilter(item.value)} className={active ? 'rounded-[16px] bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-3 py-1.5 text-[11px] font-medium text-white shadow-[0_10px_20px_rgba(236,72,153,0.24)]' : 'rounded-[16px] px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-white/88 hover:text-pink-600'}>
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                    {hasActiveFilters ? (
                      <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-9 rounded-xl border-white/80 bg-white/74 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)] hover:bg-white"><RotateCcw size={15} className="mr-2" />清空所有条件</Button>
                    ) : (
                      <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">当前未应用额外筛选</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <Select value={categoryInput} onValueChange={setCategoryInput}>
                      <SelectTrigger className="h-10 rounded-2xl border-white/85 bg-white/78 px-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)] backdrop-blur-md"><SelectValue placeholder="按报销类别筛选" /></SelectTrigger>
                      <SelectContent className={glassSelectContentClass}>
                        <SelectItem className="rounded-[16px]" value="">全部类别</SelectItem>
                        <SelectItem className="rounded-[16px]" value="TRAVEL">差旅</SelectItem>
                        <SelectItem className="rounded-[16px]" value="OFFICE">办公</SelectItem>
                        <SelectItem className="rounded-[16px]" value="ENTERTAINMENT">招待</SelectItem>
                        <SelectItem className="rounded-[16px]" value="TRANSPORT">交通</SelectItem>
                        <SelectItem className="rounded-[16px]" value="OTHER">其他</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={applySearch} className="h-10 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"><Search size={15} className="mr-2" />应用筛选</Button>
                    <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-10 rounded-2xl border-white/85 bg-white/74 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)] hover:bg-white"><RotateCcw size={15} className="mr-2" />清空条件</Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] shadow-[0_16px_34px_rgba(15,23,42,0.04)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.68))] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">当前结果</div>
                  <div className="mt-1 text-[11px] text-slate-400">统一展示报销单、金额、说明和当前审批动作</div>
                </div>
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">共 {total} 条</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white/72 backdrop-blur-xl">
                    <tr>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">报销单号</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">类别</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">总金额</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">明细</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">说明</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">创建时间</TableHead>
                      <TableActionHead className="px-4 py-3 w-52 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-white/70">
                    {loading ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500"><div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500" /></td></tr>
                    ) : claims.length === 0 ? (
                      <tr><td colSpan={8} className="px-0 py-0"><WorkspaceEmptyPanel variant="glass" icon={<Receipt size={26} />} title={hasActiveFilters ? '当前条件下暂无记录' : '暂无报销申请'} description={hasActiveFilters ? '试试切换状态或类别筛选，或者直接新建一条报销申请。' : '创建新的报销申请后，这里会展示金额、说明和审批状态。'} /></td></tr>
                    ) : claims.map(item => (
                      <tr key={item.id} className="bg-white/36 transition hover:bg-white/70">
                        <td className="px-4 py-2.5 text-sm text-slate-900">{item.claimNo || '-'}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{categoryMap[item.category] || item.category}</td>
                        <td className="px-4 py-2.5 text-sm">{formatAmount(item.totalAmount)}</td>
                        <td className="px-4 py-2.5 text-sm text-slate-600">{item.items?.length || 0} 条</td>
                        <td className="max-w-xs truncate px-4 py-2.5 text-sm text-slate-600">{item.description || '-'}</td>
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
              <div className="flex items-center justify-between border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.6))] px-4 py-3">
                <span className="text-sm text-slate-600">共 {total} 条</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSearchParams(prev => ({ ...prev, pageNum: Math.max(1, prev.pageNum - 1) }))} disabled={searchParams.pageNum === 1} className="h-9 rounded-2xl border-white/80 bg-white/76 px-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-white">上一页</Button>
                  <span className="rounded-full bg-white/76 px-3 py-2 text-sm text-slate-600 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">第 {searchParams.pageNum} 页</span>
                  <Button variant="outline" onClick={() => setSearchParams(prev => ({ ...prev, pageNum: prev.pageNum + 1 }))} disabled={searchParams.pageNum * searchParams.pageSize >= total} className="h-9 rounded-2xl border-white/80 bg-white/76 px-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-white">下一页</Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {showDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.2)] p-4 backdrop-blur-md">
            <div className={`${glassModalShellClass} max-w-4xl`}>
              <div className={glassModalHeaderClass}>
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_70%)]" />
                <div className="absolute left-8 top-0 h-24 w-24 rounded-full bg-pink-100/35 blur-3xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/74 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                      <Receipt size={14} />
                      报销申请表单
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{currentClaim ? '编辑报销申请' : '新增报销申请'}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">整理报销类别、说明和费用明细，形成完整的报销申请单，方便审批时快速核对金额与背景。</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDialog(false)} className="rounded-full bg-white/62 text-slate-400 ring-1 ring-white/75 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-white hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-6">
                <section className={glassModalSectionClass}>
                  <div className="mb-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础信息</div>
                    <div className="mt-1 text-sm text-slate-500">先确定报销类别、报销说明和汇总金额，让审批人快速理解单据背景。</div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={glassModalLabelClass}>报销类别 <span className="text-red-500">*</span></label>
                      <Select value={formData.category} onValueChange={value => setFormData(prev => ({ ...prev, category: value }))}>
                        <SelectTrigger className={glassModalInputClass}><SelectValue placeholder="请选择" /></SelectTrigger>
                        <SelectContent className={glassSelectContentClass}>
                          <SelectItem className="rounded-[16px]" value="TRAVEL">差旅</SelectItem>
                          <SelectItem className="rounded-[16px]" value="OFFICE">办公</SelectItem>
                          <SelectItem className="rounded-[16px]" value="ENTERTAINMENT">招待</SelectItem>
                          <SelectItem className="rounded-[16px]" value="TRANSPORT">交通</SelectItem>
                          <SelectItem className="rounded-[16px]" value="OTHER">其他</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={glassModalLabelClass}>总金额</label>
                      <Input className={glassModalInputClass} value={formatAmount(formTotalAmount)} disabled />
                    </div>
                    <div className="md:col-span-2">
                      <label className={glassModalLabelClass}>报销说明 <span className="text-red-500">*</span></label>
                      <Textarea className={glassModalTextareaClass} value={formData.description || ''} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="例如：项目驻场差旅报销、客户拜访交通住宿费用、办公采购报销等" />
                    </div>
                  </div>
                </section>

                <section className={glassModalSectionClass}>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">费用明细</div>
                      <div className="mt-1 text-sm text-slate-500">逐条填写费用类型、金额、日期与说明，必要时补上凭证链接。</div>
                    </div>
                    <Button onClick={addItem} className="h-10 rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#f97316)] px-4 text-white shadow-[0_12px_22px_rgba(245,158,11,0.2)] hover:bg-amber-500">
                      <Plus size={15} className="mr-2" />
                      添加明细
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {formData.items?.map((item, index) => (
                      <div key={`${index}-${item.expenseDate || 'draft'}`} className="rounded-[24px] border border-white/75 bg-white/72 p-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900">明细 {index + 1}</div>
                          <Button variant="outline" size="sm" onClick={() => removeItem(index)} className="h-8 rounded-full border-rose-100 bg-white/80 px-3 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                            <Trash2 size={14} className="mr-1.5" />
                            删除
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <label className={glassModalLabelClass}>费用类型 <span className="text-red-500">*</span></label>
                            <Select value={item.expenseType} onValueChange={value => updateItem(index, 'expenseType', value)}>
                              <SelectTrigger className={glassModalInputClass}><SelectValue placeholder="请选择" /></SelectTrigger>
                              <SelectContent className={glassSelectContentClass}>
                                <SelectItem className="rounded-[16px]" value="TRANSPORT">交通</SelectItem>
                                <SelectItem className="rounded-[16px]" value="ACCOMMODATION">住宿</SelectItem>
                                <SelectItem className="rounded-[16px]" value="MEAL">餐饮</SelectItem>
                                <SelectItem className="rounded-[16px]" value="COMMUNICATION">通讯</SelectItem>
                                <SelectItem className="rounded-[16px]" value="OFFICE_SUPPLIES">办公用品</SelectItem>
                                <SelectItem className="rounded-[16px]" value="OTHER">其他</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className={glassModalLabelClass}>金额(元) <span className="text-red-500">*</span></label>
                            <Input className={glassModalInputClass} type="number" value={item.amount || ''} onChange={e => updateItem(index, 'amount', parseFloat(e.target.value) || 0)} placeholder="0.00" step="0.01" min="0" />
                          </div>
                          <div>
                            <label className={glassModalLabelClass}>费用日期 <span className="text-red-500">*</span></label>
                            <DatePicker variant="glass" className={glassModalInputClass} type="date" value={item.expenseDate} onChange={e => updateItem(index, 'expenseDate', e.target.value)} />
                          </div>
                          <div>
                            <label className={glassModalLabelClass}>凭证链接</label>
                            <Input className={glassModalInputClass} type="text" value={item.receiptUrl || ''} onChange={e => updateItem(index, 'receiptUrl', e.target.value)} placeholder="可选，填写凭证 URL" />
                          </div>
                          <div className="md:col-span-2 xl:col-span-4">
                            <label className={glassModalLabelClass}>费用说明</label>
                            <Input className={glassModalInputClass} type="text" value={item.description || ''} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="如：高铁往返、项目住宿、商务招待餐费" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-2xl border-white/85 bg-white/76 px-5 shadow-[0_10px_20px_rgba(15,23,42,0.04)] hover:bg-white">取消</Button>
                <Button onClick={handleSave} className="rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-5 text-white shadow-[0_14px_24px_rgba(236,72,153,0.22)] hover:bg-pink-600">保存</Button>
              </div>
            </div>
          </div>
        )}

        {detailClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.22)] p-4 backdrop-blur-md" onClick={() => !detailLoading && setDetailClaim(null)}>
            <div className={`flex max-h-[90vh] max-w-5xl flex-col ${glassModalShellClass}`} onClick={e => e.stopPropagation()}>
              <div className={glassModalHeaderClass}>
                <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_70%)]" />
                <div className="absolute left-8 top-0 h-24 w-24 rounded-full bg-emerald-100/28 blur-3xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/74 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                      <Eye size={14} />
                      申请详情
                    </div>
                    <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{detailClaim.claimNo || '报销申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{categoryMap[detailClaim.category] || detailClaim.category || '-'}</span>
                      {getStatusBadge(detailClaim.status || 'DRAFT')}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDetailClaim(null)} className="rounded-full bg-white/62 text-slate-400 ring-1 ring-white/75 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-white hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-pink-500" />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">报销类别</div><div className="mt-2 text-sm font-semibold text-slate-900">{categoryMap[detailClaim.category] || detailClaim.category || '-'}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">总金额</div><div className="mt-2 text-sm font-semibold text-slate-900">{formatAmount(detailClaim.totalAmount)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">明细数量</div><div className="mt-2 text-sm font-semibold text-slate-900">{detailClaim.items?.length || 0} 条</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">申请人</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailClaim.userName)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">所属部门</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailClaim.deptName)}</div></div>
                      <div className={glassDetailCardClass}><div className="text-xs font-medium text-slate-400">创建时间</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(detailClaim.createTime)}</div></div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="text-sm font-semibold text-slate-900">报销说明</div>
                      <div className="mt-3 whitespace-pre-wrap rounded-[22px] border border-white/70 bg-white/72 p-4 text-sm leading-7 text-slate-600">{detailClaim.description || '-'}</div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">报销明细</div>
                        <div className="text-xs text-slate-400">逐条查看费用类型、日期、金额和补充说明</div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {detailClaim.items?.length ? detailClaim.items.map((item, index) => (
                          <div key={`${index}-${item.expenseDate || 'detail'}`} className="rounded-[22px] border border-white/75 bg-white/76 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div><div className="text-xs font-medium text-slate-400">费用类型</div><div className="mt-2 text-sm font-semibold text-slate-900">{expenseTypeMap[item.expenseType] || item.expenseType}</div></div>
                              <div><div className="text-xs font-medium text-slate-400">金额</div><div className="mt-2 text-sm font-semibold text-slate-900">{formatAmount(item.amount)}</div></div>
                              <div><div className="text-xs font-medium text-slate-400">费用日期</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(item.expenseDate)}</div></div>
                              <div><div className="text-xs font-medium text-slate-400">说明</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(item.description)}</div></div>
                            </div>
                            {item.receiptUrl ? (
                              <a href={item.receiptUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full border border-white/80 bg-white/82 px-3.5 py-2 text-xs font-medium text-pink-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white hover:text-pink-700">
                                查看报销凭证
                              </a>
                            ) : null}
                          </div>
                        )) : (
                          <div className="rounded-[22px] border border-white/70 bg-white/72 px-4 py-6 text-center text-sm text-slate-400">当前没有报销明细。</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setDetailClaim(null)} className="rounded-2xl border-white/85 bg-white/76 px-5 shadow-[0_10px_20px_rgba(15,23,42,0.04)] hover:bg-white">关闭</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpenseClaimPage;
