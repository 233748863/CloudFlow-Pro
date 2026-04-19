import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Edit, Eye, Plus, Receipt, RotateCcw, Search, Send, Trash2, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { expenseClaimApi, ExpenseClaim, ExpenseItem } from '../services/api/expense';
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
        {statusMap[status] || status}
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
  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
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
      icon: <Receipt size={17} />,
    },
    {
      label: '待补充草稿',
      value: `${draftCount}`,
      hint: draftCount > 0 ? '建议先把金额与凭证整理完整' : '当前没有待补充草稿',
      icon: <Edit size={17} />,
    },
    {
      label: '审批中',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '可快速查看当前审批进度' : '当前没有审批中的申请',
      icon: <Clock3 size={17} />,
    },
    {
      label: '累计报销金额',
      value: formatAmount(totalAmount),
      hint: approvedCount > 0 ? `已通过 ${approvedCount} 条，便于快速估算支出规模` : '用于快速判断当前报销规模',
      icon: <WalletCards size={17} />,
    },
  ]), [approvedCount, currentCategoryLabel, currentStatusLabel, draftCount, hasActiveFilters, pendingCount, total, totalAmount]);

  const workspaceOverviewItems = [
    { label: '记录数', value: `${total} 条` },
    { label: '状态', value: currentStatusLabel },
    { label: '类别', value: currentCategoryLabel },
    { label: '视图', value: hasActiveFilters ? '筛选结果' : '默认视图' },
  ];

  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]';
  const glassModalHeaderClass = 'sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4';
  const glassModalSectionClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-28 rounded-xl';
  const glassModalFooterClass = 'sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4';
  const glassSelectContentClass = '';
  const glassDetailCardClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600"><Receipt size={14} />{todayLabel}</span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="报销申请"
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
                <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-8 rounded-xl px-3.5"><RotateCcw size={15} className="mr-2" />清空所有条件</Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">当前未应用额外筛选</span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Select value={categoryInput} onValueChange={setCategoryInput}>
                    <SelectTrigger className="h-10 rounded-xl px-4"><SelectValue placeholder="按报销类别筛选" /></SelectTrigger>
                    <SelectContent className={glassSelectContentClass}>
                      <SelectItem className="rounded-xl" value="">全部类别</SelectItem>
                      <SelectItem className="rounded-xl" value="TRAVEL">差旅</SelectItem>
                      <SelectItem className="rounded-xl" value="OFFICE">办公</SelectItem>
                      <SelectItem className="rounded-xl" value="ENTERTAINMENT">招待</SelectItem>
                      <SelectItem className="rounded-xl" value="TRANSPORT">交通</SelectItem>
                      <SelectItem className="rounded-xl" value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={applySearch} className="h-10 rounded-xl px-3.5"><Search size={15} className="mr-2" />应用筛选</Button>
                  <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-10 rounded-xl px-3.5"><RotateCcw size={15} className="mr-2" />清空条件</Button>
                </div>
              )}
            />

            <WorkspaceResultCard total={total} description="统一展示报销单、金额、说明和当前审批动作">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHeader className="sticky top-0 z-10 bg-white">
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
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载报销申请..." />
                    ) : claims.length === 0 ? (
                      <WorkspaceTableStateRow
                        colSpan={8}
                        variant="glass"
                        icon={<Receipt size={26} />}
                        title={hasActiveFilters ? '当前条件下暂无记录' : '暂无报销申请'}
                        description={hasActiveFilters ? '试试切换状态或类别筛选，或者直接新建一条报销申请。' : '创建新的报销申请后，这里会展示金额、说明和审批状态。'}
                      />
                    ) : claims.map(item => (
                      <tr key={item.id} className="transition hover:bg-slate-50">
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
                              { label: '详情', icon: <Eye size={14} />, onClick: () => void handleView(item), tone: 'neutral', className: 'rounded-full border border-slate-200 bg-white px-2.5 hover:bg-slate-50' },
                              { label: '编辑', icon: <Edit size={14} />, onClick: () => handleEdit(item.id!), tone: 'primary', hidden: item.status !== 'DRAFT', className: 'rounded-full border border-cyan-200 bg-cyan-50 px-2.5 text-cyan-700 hover:bg-cyan-100' },
                              { label: '提交', icon: <Send size={14} />, onClick: () => handleSubmit(item.id!), tone: 'success', hidden: item.status !== 'DRAFT', className: 'rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-emerald-700 hover:bg-emerald-100' },
                              { label: '删除', icon: <Trash2 size={14} />, onClick: () => handleDelete([item.id!]), tone: 'danger', hidden: item.status !== 'DRAFT', className: 'rounded-full border border-rose-200 bg-rose-50 px-2.5 text-rose-600 hover:bg-rose-100' },
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4">
            <div className={`${glassModalShellClass} max-w-4xl`}>
              <div className={glassModalHeaderClass}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Receipt size={14} />
                      报销申请表单
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{currentClaim ? '编辑报销申请' : '新增报销申请'}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">整理报销类别、说明和费用明细，形成完整的报销申请单，方便审批时快速核对金额与背景。</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowDialog(false)} className="rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 p-5">
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
                          <SelectItem className="rounded-xl" value="TRAVEL">差旅</SelectItem>
                          <SelectItem className="rounded-xl" value="OFFICE">办公</SelectItem>
                          <SelectItem className="rounded-xl" value="ENTERTAINMENT">招待</SelectItem>
                          <SelectItem className="rounded-xl" value="TRANSPORT">交通</SelectItem>
                          <SelectItem className="rounded-xl" value="OTHER">其他</SelectItem>
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
                    <Button onClick={addItem} className="h-10 rounded-xl px-4">
                      <Plus size={15} className="mr-2" />
                      添加明细
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {formData.items?.map((item, index) => (
                      <div key={`${index}-${item.expenseDate || 'draft'}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900">明细 {index + 1}</div>
                          <Button variant="outline" size="sm" onClick={() => removeItem(index)} className="h-8 rounded-full border-rose-200 px-3 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
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
                                <SelectItem className="rounded-xl" value="TRANSPORT">交通</SelectItem>
                                <SelectItem className="rounded-xl" value="ACCOMMODATION">住宿</SelectItem>
                                <SelectItem className="rounded-xl" value="MEAL">餐饮</SelectItem>
                                <SelectItem className="rounded-xl" value="COMMUNICATION">通讯</SelectItem>
                                <SelectItem className="rounded-xl" value="OFFICE_SUPPLIES">办公用品</SelectItem>
                                <SelectItem className="rounded-xl" value="OTHER">其他</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className={glassModalLabelClass}>金额(元) <span className="text-red-500">*</span></label>
                            <Input className={glassModalInputClass} type="number" value={item.amount || ''} onChange={e => updateItem(index, 'amount', parseFloat(e.target.value) || 0)} placeholder="0.00" step="0.01" min="0" />
                          </div>
                          <div>
                            <label className={glassModalLabelClass}>费用日期 <span className="text-red-500">*</span></label>
                            <DatePicker className={glassModalInputClass} type="date" value={item.expenseDate} onChange={e => updateItem(index, 'expenseDate', e.target.value)} />
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
                <Button variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl px-5">取消</Button>
                <Button onClick={handleSave} className="rounded-xl px-5">保存</Button>
              </div>
            </div>
          </div>
        )}

        {detailClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4" onClick={() => !detailLoading && setDetailClaim(null)}>
            <div className={`flex max-h-[90vh] max-w-5xl flex-col ${glassModalShellClass}`} onClick={e => e.stopPropagation()}>
              <div className={glassModalHeaderClass}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Eye size={14} />
                      申请详情
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{detailClaim.claimNo || '报销申请'}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{categoryMap[detailClaim.category] || detailClaim.category || '-'}</span>
                      {getStatusBadge(detailClaim.status || 'DRAFT')}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setDetailClaim(null)} className="rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {detailLoading ? (
                  <WorkspaceInlineState type="loading" title="正在加载报销详情..." className="py-12" />
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
                      <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">{detailClaim.description || '-'}</div>
                    </div>

                    <div className={glassModalSectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">报销明细</div>
                        <div className="text-xs text-slate-400">逐条查看费用类型、日期、金额和补充说明</div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {detailClaim.items?.length ? detailClaim.items.map((item, index) => (
                          <div key={`${index}-${item.expenseDate || 'detail'}`} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div><div className="text-xs font-medium text-slate-400">费用类型</div><div className="mt-2 text-sm font-semibold text-slate-900">{expenseTypeMap[item.expenseType] || item.expenseType}</div></div>
                              <div><div className="text-xs font-medium text-slate-400">金额</div><div className="mt-2 text-sm font-semibold text-slate-900">{formatAmount(item.amount)}</div></div>
                              <div><div className="text-xs font-medium text-slate-400">费用日期</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(item.expenseDate)}</div></div>
                              <div><div className="text-xs font-medium text-slate-400">说明</div><div className="mt-2 text-sm font-semibold text-slate-900">{renderDetailValue(item.description)}</div></div>
                            </div>
                            {item.receiptUrl ? (
                              <a href={item.receiptUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-cyan-200 hover:bg-white hover:text-cyan-700">
                                查看报销凭证
                              </a>
                            ) : null}
                          </div>
                        )) : (
                          <WorkspaceInlineState title="暂无报销明细" description="当前报销单还没有录入报销明细。" className="py-8" />
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className={glassModalFooterClass}>
                <Button variant="outline" onClick={() => setDetailClaim(null)} className="rounded-xl px-5">关闭</Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default ExpenseClaimPage;
