import React, { useEffect, useMemo, useState } from 'react';
import {
  Car, Clock, CheckCircle, XCircle, Eye, DollarSign,
  RotateCcw, Loader2,
  MapPin, ArrowLeftRight, Ban, CornerDownLeft,
  Fuel, ParkingCircle, Wrench, Shield, MoreHorizontal,
  Calendar, Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Button,
  Card,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableActionHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceHeroCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
import { WorkspaceBackdrop, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import {
  getUsageList,
  getExpenseList,
  addExpense,
  getExpenseStats,
  approveUsage,
  returnVehicle,
  cancelUsage,
  VehicleUsage,
  VehicleExpense,
  ExpenseStats
} from '@/services/api/vehicle';

// ==================== 常量配置 ====================

/** 用车状态配置 */
const USAGE_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  '0': {
    label: '待审批',
    color: 'text-amber-700',
    bg: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.86))]',
    icon: <Clock size={14} />
  },
  '1': {
    label: '已批准',
    color: 'text-emerald-700',
    bg: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.86))]',
    icon: <CheckCircle size={14} />
  },
  '2': {
    label: '已驳回',
    color: 'text-rose-700',
    bg: 'border-rose-100/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.86))]',
    icon: <XCircle size={14} />
  },
  '3': {
    label: '进行中',
    color: 'text-pink-600',
    bg: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.86))]',
    icon: <Car size={14} />
  },
  '4': {
    label: '已完成',
    color: 'text-cyan-700',
    bg: 'border-cyan-100/80 bg-[linear-gradient(135deg,rgba(236,254,255,0.95),rgba(255,255,255,0.86))]',
    icon: <CheckCircle size={14} />
  },
  '5': {
    label: '已取消',
    color: 'text-slate-500',
    bg: 'border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.86))]',
    icon: <Ban size={14} />
  },
};

/** 费用类型配置 */
const EXPENSE_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  '1': { label: '油费', icon: <Fuel size={14} />, color: 'text-orange-600' },
  '2': { label: '过路费', icon: <ArrowLeftRight size={14} />, color: 'text-pink-500' },
  '3': { label: '停车费', icon: <ParkingCircle size={14} />, color: 'text-violet-600' },
  '4': { label: '维修保养', icon: <Wrench size={14} />, color: 'text-amber-600' },
  '5': { label: '保险', icon: <Shield size={14} />, color: 'text-emerald-600' },
  '6': { label: '其他', icon: <MoreHorizontal size={14} />, color: 'text-slate-600' },
};

const STATUS_QUICK_FILTERS = [
  { label: '全部', value: '' },
  { label: '待审批', value: '0' },
  { label: '已批准', value: '1' },
  { label: '进行中', value: '3' },
  { label: '已完成', value: '4' },
  { label: '已取消', value: '5' },
];

// ==================== 子组件 ====================

/** 轻玻璃状态标签 */
const UsageStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = USAGE_STATUS[status] || {
    label: '未知',
    color: 'text-slate-500',
    bg: 'border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.86))]',
    icon: null
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_8px_18px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] ${config.bg} ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const formatCurrency = (value?: number) => `¥ ${Number(value || 0).toLocaleString()}`;

// ==================== 主组件 ====================

const VehicleUsageList: React.FC = () => {
  const navigate = useNavigate();

  // 数据状态
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'usage' | 'expense'>('usage');

  // 查询条件
  const [usageQuery, setUsageQuery] = useState({ pageNum: 1, pageSize: 10, status: '' });
  const [expenseQuery, setExpenseQuery] = useState({ pageNum: 1, pageSize: 10 });

  // 弹窗状态
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  const [currentUsage, setCurrentUsage] = useState<VehicleUsage | null>(null);

  // 表单数据
  const [expenseForm, setExpenseForm] = useState<Partial<VehicleExpense>>({
    expenseType: '1',
    amount: 0,
    expenseDate: new Date().toISOString().split('T')[0],
    description: '',
  });
  const [approveRemark, setApproveRemark] = useState('');
  const [returnMileage, setReturnMileage] = useState(0);

  // ==================== 数据加载 ====================

  const fetchUsages = async () => {
    setLoading(true);
    try {
      const params = {
        pageNum: usageQuery.pageNum,
        pageSize: usageQuery.pageSize,
        ...(usageQuery.status ? { status: usageQuery.status } : {}),
      };
      const res = await getUsageList(params);
      setUsages(res.rows || []);
      setUsageTotal(res.total || 0);
    } catch {
      toast.error('获取用车记录失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async () => {
    setExpenseLoading(true);
    try {
      const res = await getExpenseList({ pageNum: expenseQuery.pageNum, pageSize: expenseQuery.pageSize });
      setExpenses(res.rows || []);
      setExpenseTotal(res.total || 0);
    } catch {
      toast.error('获取费用明细失败');
    } finally {
      setExpenseLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getExpenseStats();
      setStats(res);
    } catch {
      toast.error('获取费用统计失败');
    }
  };

  useEffect(() => {
    void fetchUsages();
  }, [usageQuery.pageNum, usageQuery.pageSize, usageQuery.status]);

  useEffect(() => {
    void fetchExpenses();
  }, [expenseQuery.pageNum, expenseQuery.pageSize]);

  useEffect(() => {
    void fetchStats();
  }, []);

  // ==================== 操作处理 ====================

  const handleViewDetail = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setIsDetailDialogOpen(true);
  };

  const handleOpenApprove = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setApproveRemark('');
    setIsApproveDialogOpen(true);
  };

  const handleApprove = async (approved: boolean) => {
    if (!currentUsage?.usageId) {
      return;
    }
    try {
      await approveUsage(currentUsage.usageId, approved, approveRemark);
      toast.success(approved ? '已批准' : '已驳回');
      setIsApproveDialogOpen(false);
      void fetchUsages();
    } catch {
      toast.error('操作失败');
    }
  };

  const handleOpenReturn = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setReturnMileage(0);
    setIsReturnDialogOpen(true);
  };

  const handleReturn = async () => {
    if (!currentUsage?.usageId) {
      return;
    }
    if (returnMileage <= 0) {
      toast.error('请输入有效的结束里程');
      return;
    }
    try {
      await returnVehicle(currentUsage.usageId, { endMileage: returnMileage });
      toast.success('车辆已归还');
      setIsReturnDialogOpen(false);
      void fetchUsages();
    } catch {
      toast.error('归还失败');
    }
  };

  const handleCancel = async (usage: VehicleUsage) => {
    if (!confirm('确认取消该用车申请？')) {
      return;
    }
    try {
      await cancelUsage(usage.usageId!);
      toast.success('已取消');
      void fetchUsages();
    } catch {
      toast.error('取消失败');
    }
  };

  const handleOpenExpense = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setExpenseForm({
      expenseType: '1',
      amount: 0,
      expenseDate: new Date().toISOString().split('T')[0],
      description: '',
    });
    setIsExpenseDialogOpen(true);
  };

  const handleSubmitExpense = async () => {
    if (!currentUsage || !expenseForm.amount || expenseForm.amount <= 0) {
      toast.error('请输入有效的费用金额');
      return;
    }
    try {
      await addExpense({
        ...expenseForm,
        usageId: currentUsage.usageId,
        vehicleId: currentUsage.vehicleId,
      } as VehicleExpense);
      toast.success('费用已录入');
      setIsExpenseDialogOpen(false);
      void fetchExpenses();
      void fetchStats();
    } catch {
      toast.error('录入失败');
    }
  };

  const handleRefreshCurrentTab = () => {
    if (activeTab === 'usage') {
      void fetchUsages();
    } else {
      void fetchExpenses();
    }
    void fetchStats();
  };

  const applyStatusFilter = (status: string) => {
    setUsageQuery((prev) => ({
      ...prev,
      status,
      pageNum: 1,
    }));
  };

  const resetUsageFilters = () => {
    setUsageQuery((prev) => ({
      ...prev,
      status: '',
      pageNum: 1,
    }));
  };

  // ==================== 衍生状态 ====================

  const usageTotalPages = Math.max(1, Math.ceil(usageTotal / usageQuery.pageSize));
  const expenseTotalPages = Math.max(1, Math.ceil(expenseTotal / expenseQuery.pageSize));
  const now = useMemo(() => new Date(), []);
  const todayLabel = useMemo(() => formatDateCN(now), [now]);
  const timeLabel = useMemo(() => now.toTimeString().slice(0, 5), [now]);
  const pendingCount = useMemo(() => usages.filter((item) => item.status === '0').length, [usages]);
  const inUseCount = useMemo(() => usages.filter((item) => item.status === '3').length, [usages]);
  const completedCount = useMemo(() => usages.filter((item) => item.status === '4').length, [usages]);
  const currentStatusLabel = usageQuery.status ? (USAGE_STATUS[usageQuery.status]?.label || '未知状态') : '全部状态';
  const hasUsageFilters = Boolean(usageQuery.status);

  const expenseTypeSummary = useMemo(() => (
    Object.entries(stats?.byType || {}).map(([type, amount]) => {
      const config = EXPENSE_TYPES[type] || {
        label: '未知',
        icon: <MoreHorizontal size={14} />,
        color: 'text-slate-600',
      };
      return {
        type,
        amount: amount as number,
        ...config,
      };
    })
  ), [stats]);

  const heroMetrics = useMemo(() => ([
    {
      label: '当前视图',
      value: activeTab === 'usage' ? `${usageTotal}` : `${expenseTotal}`,
      hint: activeTab === 'usage' ? '聚焦审批、归还与状态流转' : '查看车辆费用明细与录入情况',
      valueClassName: 'text-slate-950',
      panelClassName: 'border-slate-100/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.82),rgba(239,246,255,0.75))] shadow-[0_16px_32px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-slate-600 ring-1 ring-slate-100 shadow-[0_10px_22px_rgba(15,23,42,0.08)]',
      hintClassName: 'text-slate-500',
      glowClassName: 'from-slate-100/90 via-sky-50/45 to-transparent',
      icon: activeTab === 'usage' ? <Car size={17} /> : <DollarSign size={17} />,
    },
    {
      label: '待审批',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '建议优先处理待审批用车申请' : '当前没有待审批的申请',
      valueClassName: 'text-amber-700',
      panelClassName: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.82),rgba(255,247,237,0.78))] shadow-[0_16px_32px_rgba(245,158,11,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-amber-600 ring-1 ring-amber-100 shadow-[0_10px_22px_rgba(245,158,11,0.08)]',
      hintClassName: 'text-slate-500',
      glowClassName: 'from-amber-100/90 via-orange-50/45 to-transparent',
      icon: <Clock size={17} />,
    },
    {
      label: '进行中',
      value: `${inUseCount}`,
      hint: completedCount > 0 ? `已完成 ${completedCount} 条归还记录` : '暂无已完成归还记录',
      valueClassName: 'text-pink-600',
      panelClassName: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.82),rgba(255,241,242,0.8))] shadow-[0_16px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-pink-600 ring-1 ring-pink-100 shadow-[0_10px_22px_rgba(236,72,153,0.08)]',
      hintClassName: 'text-slate-500',
      glowClassName: 'from-pink-100/90 via-rose-50/45 to-transparent',
      icon: <Car size={17} />,
    },
    {
      label: '累计费用',
      value: formatCurrency(stats?.totalAmount),
      hint: stats?.count ? `共 ${stats.count} 笔费用记录` : '当前还没有录入车辆费用',
      valueClassName: 'text-emerald-700',
      panelClassName: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.82),rgba(236,254,255,0.78))] shadow-[0_16px_32px_rgba(16,185,129,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-emerald-600 ring-1 ring-emerald-100 shadow-[0_10px_22px_rgba(16,185,129,0.08)]',
      hintClassName: 'text-slate-500',
      glowClassName: 'from-emerald-100/90 via-cyan-50/45 to-transparent',
      icon: <DollarSign size={17} />,
    },
  ]), [activeTab, completedCount, expenseTotal, inUseCount, pendingCount, stats, usageTotal]);

  const workspaceOverviewItems = useMemo(() => {
    const defaultTone = 'border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]';
    const accentTone = 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.9),rgba(255,255,255,0.82))] text-pink-600 shadow-[0_10px_24px_rgba(236,72,153,0.06),inset_0_1px_0_rgba(255,255,255,0.75)]';

    if (activeTab === 'usage') {
      return [
        { label: '记录数', value: `${usageTotal} 条`, toneClassName: defaultTone },
        { label: '状态', value: currentStatusLabel, toneClassName: defaultTone },
        { label: '当前页', value: `第 ${usageQuery.pageNum} 页`, toneClassName: defaultTone },
        { label: '视图', value: hasUsageFilters ? '筛选结果' : '默认视图', toneClassName: hasUsageFilters ? accentTone : defaultTone },
      ];
    }

    return [
      { label: '费用笔数', value: `${expenseTotal} 条`, toneClassName: defaultTone },
      { label: '本月费用', value: formatCurrency(stats?.monthlyAmount), toneClassName: defaultTone },
      { label: '上月费用', value: formatCurrency(stats?.lastMonthAmount), toneClassName: defaultTone },
      { label: '视图', value: '费用明细', toneClassName: accentTone },
    ];
  }, [activeTab, currentStatusLabel, expenseTotal, hasUsageFilters, stats, usageQuery.pageNum, usageTotal]);

  const workspaceTitle = activeTab === 'usage' ? '用车记录' : '费用明细';
  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-[36px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-0 shadow-[0_30px_80px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.74)] backdrop-blur-2xl';
  const glassModalHeaderClass = 'sticky top-0 z-10 overflow-hidden border-b border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] px-6 pb-5 pt-6 backdrop-blur-2xl';
  const glassModalSectionClass = 'overflow-visible rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.72))] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-12 rounded-[20px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md';
  const glassModalTextareaClass = 'min-h-28 rounded-[22px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md';
  const glassModalFooterClass = 'sticky bottom-0 flex justify-end gap-3 border-t border-white/75 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.74))] px-6 py-5 backdrop-blur-2xl';
  const glassDetailCardClass = 'rounded-[22px] border border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.7))] p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl';

  // ==================== 渲染 ====================

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3 px-4 py-4 md:px-6">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Calendar size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="用车记录与费用"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                className="h-9 rounded-xl bg-pink-500 px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.2)] hover:bg-pink-600"
                onClick={() => navigate('/admin/vehicle/booking')}
              >
                <Plus size={15} className="mr-2" />
                新建申请
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl border-white/80 bg-white/85 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
                onClick={handleRefreshCurrentTab}
              >
                <RotateCcw size={15} className="mr-2 text-pink-500" />
                刷新数据
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_55%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_46%)]"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {heroMetrics.map((item) => (
              <div
                key={item.label}
                className={`group relative overflow-hidden rounded-[22px] border px-3.5 py-3 backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 ${item.panelClassName}`}
              >
                <div className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-br ${item.glowClassName}`} />
                <div className="pointer-events-none absolute inset-[1px] rounded-[21px] bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.12)_38%,transparent_100%)] opacity-80" />
                <div className="relative flex min-h-[82px] flex-col justify-between gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400/90">{item.label}</div>
                      <div className={`mt-1 text-[1.32rem] font-bold tracking-tight ${item.valueClassName}`}>{item.value}</div>
                    </div>
                    <div className={`rounded-[14px] p-2 backdrop-blur-md ${item.iconWrapClassName}`}>
                      {item.icon}
                    </div>
                  </div>

                  <div className={`max-w-full truncate text-[10px] leading-4 ${item.hintClassName}`}>{item.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </WorkspaceHeroCard>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'usage' | 'expense')}>
            <div className="flex flex-col gap-3">
              <WorkspaceWorkbenchCard
                eyebrow={activeTab === 'usage' ? '记录' : '费用'}
                title={workspaceTitle}
                total={activeTab === 'usage' ? usageTotal : expenseTotal}
                hasActiveFilters={activeTab === 'usage' ? hasUsageFilters : false}
                overviewItems={workspaceOverviewItems}
                headerBadges={(
                  <>
                    <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                      {activeTab === 'usage' ? (hasUsageFilters ? '已应用筛选' : '默认视图') : '费用追踪'}
                    </span>
                    <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                      共 {activeTab === 'usage' ? usageTotal : expenseTotal} 条
                    </span>
                  </>
                )}
                filterBar={(
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <TabsList className="inline-flex h-auto flex-wrap items-center gap-1 rounded-[20px] bg-white/78 p-1 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-md">
                        <TabsTrigger
                          value="usage"
                          className="rounded-[16px] px-3 py-1.5 text-[11px] font-medium data-[state=active]:bg-[linear-gradient(135deg,#f472b6,#ec4899)] data-[state=active]:text-white data-[state=active]:shadow-[0_10px_20px_rgba(236,72,153,0.24)]"
                        >
                          <Car size={14} className="mr-1.5" />
                          用车记录
                        </TabsTrigger>
                        <TabsTrigger
                          value="expense"
                          className="rounded-[16px] px-3 py-1.5 text-[11px] font-medium data-[state=active]:bg-[linear-gradient(135deg,#f472b6,#ec4899)] data-[state=active]:text-white data-[state=active]:shadow-[0_10px_20px_rgba(236,72,153,0.24)]"
                        >
                          <DollarSign size={14} className="mr-1.5" />
                          费用明细
                        </TabsTrigger>
                      </TabsList>

                      {activeTab === 'usage' ? (
                        hasUsageFilters ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={resetUsageFilters}
                            className="h-9 rounded-xl border-white/80 bg-white/74 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)] hover:bg-white"
                          >
                            <RotateCcw size={15} className="mr-2" />
                            清空所有条件
                          </Button>
                        ) : (
                          <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                            当前未应用额外筛选
                          </span>
                        )
                      ) : (
                        <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                          {expenseTypeSummary.length > 0 ? `覆盖 ${expenseTypeSummary.length} 类费用` : '当前暂无费用分布'}
                        </span>
                      )}
                    </div>

                    {activeTab === 'usage' ? (
                      <div className="inline-flex flex-wrap items-center gap-1 rounded-[20px] bg-white/78 p-1 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur-md">
                        {STATUS_QUICK_FILTERS.map((item) => {
                          const active = usageQuery.status === item.value;
                          return (
                            <button
                              key={item.value || 'ALL'}
                              type="button"
                              onClick={() => applyStatusFilter(item.value)}
                              className={[
                                'rounded-[16px] px-3 py-1.5 text-[11px] font-medium transition',
                                active
                                  ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_10px_20px_rgba(236,72,153,0.24)]'
                                  : 'text-slate-600 hover:bg-white/88 hover:text-pink-600',
                              ].join(' ')}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : expenseTypeSummary.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {expenseTypeSummary.map((item) => (
                          <div
                            key={item.type}
                            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                          >
                            <span className={item.color}>{item.icon}</span>
                            <span>{item.label}</span>
                            <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-white/75 bg-white/70 px-3.5 py-3 text-[12px] text-slate-400 shadow-[0_10px_22px_rgba(15,23,42,0.03)]">
                        录入车辆费用后，这里会自动汇总类型分布。
                      </div>
                    )}
                  </div>
                )}
              />
              <TabsContent value="usage" className="mt-0">
                <WorkspaceResultCard total={usageTotal} description="展示车辆使用记录、审批状态与当前可执行操作">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-white/72 backdrop-blur-xl">
                        <TableRow className="border-white/70 hover:bg-transparent">
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">车辆</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">申请人</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">用车时间</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">目的地</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">事由</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                          <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                        </TableRow>
                      </TableHeader>
                        <TableBody>
                          {loading ? (
                            <WorkspaceTableStateRow
                              type="loading"
                              colSpan={7}
                              title="正在加载用车记录..."
                              icon={<Loader2 className="animate-spin" size={18} />}
                            />
                          ) : usages.length === 0 ? (
                            <WorkspaceTableStateRow
                              colSpan={7}
                              icon={<Car size={26} />}
                              title="暂无用车记录"
                              description="新建用车申请后，这里会显示审批状态、归还动作和费用录入入口。"
                            />
                          ) : (
                            usages.map((usage) => (
                              <TableRow key={usage.usageId} className="border-white/60 transition hover:bg-white/55">
                                <TableCell className="px-4 py-4 align-top">
                                  <div className="text-sm font-semibold text-slate-900">
                                    {usage.vehiclePlate || `车辆#${usage.vehicleId}`}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-400">用车编号 #{usage.usageId}</div>
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                                  {usage.applicantName || `用户${usage.applicantId}`}
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                                  <div>{usage.startTime}</div>
                                  <div className="mt-1 text-[11px] text-slate-400">至 {usage.endTime}</div>
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin size={12} className="text-slate-400" />
                                    {usage.destination}
                                  </span>
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                                  <span className="line-clamp-1 max-w-[180px]">{usage.reason || '-'}</span>
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top">
                                  <UsageStatusBadge status={usage.status || '0'} />
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top">
                                  <TableRowActions
                                    align="center"
                                    actions={[
                                      {
                                        label: '详情',
                                        icon: <Eye size={14} />,
                                        onClick: () => handleViewDetail(usage),
                                        tone: 'info',
                                      },
                                      {
                                        label: '审批',
                                        icon: <CheckCircle size={14} />,
                                        onClick: () => handleOpenApprove(usage),
                                        tone: 'primary',
                                        hidden: usage.status !== '0',
                                      },
                                      {
                                        label: '归还',
                                        icon: <CornerDownLeft size={14} />,
                                        onClick: () => handleOpenReturn(usage),
                                        tone: 'success',
                                        hidden: usage.status !== '1' && usage.status !== '3',
                                      },
                                      {
                                        label: '费用',
                                        icon: <DollarSign size={14} />,
                                        onClick: () => handleOpenExpense(usage),
                                        tone: 'info',
                                        hidden: usage.status !== '3' && usage.status !== '4',
                                      },
                                      {
                                        label: '取消',
                                        icon: <Ban size={14} />,
                                        onClick: () => handleCancel(usage),
                                        tone: 'danger',
                                        hidden: usage.status !== '0',
                                      },
                                    ]}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {usageTotal > 0 ? (
                      <WorkspacePaginationBar
                        total={usageTotal}
                        pageNum={usageQuery.pageNum}
                        totalPages={usageTotalPages}
                        onPrev={() => setUsageQuery({ ...usageQuery, pageNum: usageQuery.pageNum - 1 })}
                        onNext={() => setUsageQuery({ ...usageQuery, pageNum: usageQuery.pageNum + 1 })}
                        prevDisabled={usageQuery.pageNum <= 1}
                        nextDisabled={usageQuery.pageNum >= usageTotalPages}
                      />
                    ) : null}
                </WorkspaceResultCard>
              </TabsContent>

              <TabsContent value="expense" className="mt-0">
                <WorkspaceResultCard total={expenseTotal} title="费用记录" description="展示每笔车辆费用的类型、金额、日期与录入说明">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-white/72 backdrop-blur-xl">
                        <TableRow className="border-white/70 hover:bg-transparent">
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">车辆</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">费用类型</TableHead>
                          <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">金额</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">日期</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">说明</TableHead>
                          <TableHead className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">录入时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenseLoading ? (
                          <WorkspaceTableStateRow
                            type="loading"
                            colSpan={6}
                            title="正在加载费用明细..."
                            icon={<Loader2 className="animate-spin" size={18} />}
                          />
                        ) : expenses.length === 0 ? (
                          <WorkspaceTableStateRow
                            colSpan={6}
                            icon={<DollarSign size={26} />}
                            title="暂无费用记录"
                            description="在用车完成或进行中录入费用后，这里会按轻玻璃表格自动汇总展示。"
                          />
                        ) : (
                          expenses.map((expense) => {
                            const typeConfig = EXPENSE_TYPES[expense.expenseType] || {
                              label: '未知',
                              icon: <MoreHorizontal size={14} />,
                              color: 'text-slate-600',
                            };
                            return (
                              <TableRow key={expense.expenseId} className="border-white/60 transition hover:bg-white/55">
                                <TableCell className="px-4 py-4 align-top">
                                  <div className="text-sm font-semibold text-slate-900">
                                    {expense.vehiclePlate || `车辆#${expense.vehicleId}`}
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top">
                                  <span className={`inline-flex items-center gap-1 text-sm ${typeConfig.color}`}>
                                    {typeConfig.icon}
                                    {typeConfig.label}
                                  </span>
                                </TableCell>
                                <TableCell className="px-4 py-4 text-right align-top text-sm font-semibold text-slate-900">
                                  {formatCurrency(expense.amount)}
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                                  {expense.expenseDate}
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-sm text-slate-600">
                                  {expense.description || '-'}
                                </TableCell>
                                <TableCell className="px-4 py-4 align-top text-[12px] text-slate-400">
                                  {expense.createTime || '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {expenseTotal > 0 ? (
                    <WorkspacePaginationBar
                      total={expenseTotal}
                      pageNum={expenseQuery.pageNum}
                      totalPages={expenseTotalPages}
                      onPrev={() => setExpenseQuery({ ...expenseQuery, pageNum: expenseQuery.pageNum - 1 })}
                      onNext={() => setExpenseQuery({ ...expenseQuery, pageNum: expenseQuery.pageNum + 1 })}
                      prevDisabled={expenseQuery.pageNum <= 1}
                      nextDisabled={expenseQuery.pageNum >= expenseTotalPages}
                    />
                  ) : null}
                </WorkspaceResultCard>
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </div>

      {/* ==================== 详情弹窗 ==================== */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className={`${glassModalShellClass} max-w-3xl`}>
          <DialogHeader className={glassModalHeaderClass}>
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_56%)]" />
            <div className="relative">
              <DialogTitle className="flex items-center gap-2 text-[1.5rem] font-bold tracking-tight text-slate-950">
                <Eye size={18} className="text-pink-500" />
                用车详情
              </DialogTitle>
              <p className="mt-2 text-sm text-slate-500">查看车辆信息、申请行程、审批备注和里程情况。</p>
            </div>
          </DialogHeader>
          {currentUsage && (
            <>
              <div className="space-y-4 px-6 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-[1.25rem] font-semibold tracking-tight text-slate-950">
                      {currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      申请人：{currentUsage.applicantName || `用户${currentUsage.applicantId}`}
                    </div>
                  </div>
                  <UsageStatusBadge status={currentUsage.status || '0'} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className={glassDetailCardClass}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">时间安排</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>
                        <div className="text-slate-400">开始时间</div>
                        <div className="mt-1 font-medium text-slate-900">{currentUsage.startTime}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">结束时间</div>
                        <div className="mt-1 font-medium text-slate-900">{currentUsage.endTime}</div>
                      </div>
                    </div>
                  </div>

                  <div className={glassDetailCardClass}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">行程摘要</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>
                        <div className="text-slate-400">目的地</div>
                        <div className="mt-1 font-medium text-slate-900">{currentUsage.destination}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">随行人数</div>
                        <div className="mt-1 font-medium text-slate-900">{currentUsage.passengerCount || 0} 人</div>
                      </div>
                    </div>
                  </div>

                  <div className={`${glassDetailCardClass} md:col-span-2`}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">申请说明</div>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-sm text-slate-400">用车事由</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{currentUsage.reason || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-400">随行人员</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{currentUsage.passengers || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-400">出发里程</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {currentUsage.startMileage != null ? `${currentUsage.startMileage} km` : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-400">归还里程</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {currentUsage.endMileage != null ? `${currentUsage.endMileage} km` : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-400">审批人</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{currentUsage.approverName || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-400">审批意见</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">{currentUsage.approveRemark || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className={glassModalFooterClass}>
                <Button
                  variant="outline"
                  className="h-11 rounded-2xl border-white/85 bg-white/78 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
                  onClick={() => setIsDetailDialogOpen(false)}
                >
                  关闭
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== 审批弹窗 ==================== */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className={`${glassModalShellClass} max-w-xl`}>
          <DialogHeader className={glassModalHeaderClass}>
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_56%)]" />
            <div className="relative">
              <DialogTitle className="flex items-center gap-2 text-[1.35rem] font-bold tracking-tight text-slate-950">
                <CheckCircle size={18} className="text-pink-500" />
                审批用车申请
              </DialogTitle>
              <p className="mt-2 text-sm text-slate-500">确认是否批准本次用车，并按需填写审批意见。</p>
            </div>
          </DialogHeader>
          {currentUsage && (
            <>
              <div className="space-y-4 px-6 py-5">
                <div className={glassModalSectionClass}>
                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <div>
                      <div className="text-slate-400">车辆</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">申请人</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.applicantName || `用户${currentUsage.applicantId}`}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">目的地</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.destination}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">用车时间</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.startTime} 至 {currentUsage.endTime}</div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-slate-400">用车事由</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.reason}</div>
                    </div>
                  </div>
                </div>
                <div className={glassModalSectionClass}>
                  <Label className={glassModalLabelClass}>审批意见（可选）</Label>
                  <Textarea
                    className={`${glassModalTextareaClass} resize-none`}
                    placeholder="请输入审批意见..."
                    value={approveRemark}
                    onChange={(e) => setApproveRemark(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className={glassModalFooterClass}>
                <Button
                  variant="outline"
                  className="h-11 rounded-2xl border-white/85 bg-white/78 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
                  onClick={() => setIsApproveDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-2xl border-rose-100/90 bg-white/78 px-4 text-rose-600 shadow-[0_10px_18px_rgba(244,63,94,0.08)] hover:bg-rose-50/70"
                  onClick={() => handleApprove(false)}
                >
                  <XCircle size={14} className="mr-2" />
                  驳回
                </Button>
                <Button
                  className="h-11 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
                  onClick={() => handleApprove(true)}
                >
                  <CheckCircle size={14} className="mr-2" />
                  批准
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== 归还弹窗 ==================== */}
      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent className={`${glassModalShellClass} max-w-xl`}>
          <DialogHeader className={glassModalHeaderClass}>
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.12),transparent_56%)]" />
            <div className="relative">
              <DialogTitle className="flex items-center gap-2 text-[1.35rem] font-bold tracking-tight text-slate-950">
                <CornerDownLeft size={18} className="text-pink-500" />
                归还车辆
              </DialogTitle>
              <p className="mt-2 text-sm text-slate-500">录入当前里程表读数，完成本次用车归还。</p>
            </div>
          </DialogHeader>
          {currentUsage && (
            <>
              <div className="space-y-4 px-6 py-5">
                <div className={glassModalSectionClass}>
                  <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <div>
                      <div className="text-slate-400">车辆</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">目的地</div>
                      <div className="mt-1 font-medium text-slate-900">{currentUsage.destination}</div>
                    </div>
                  </div>
                </div>

                <div className={glassModalSectionClass}>
                  <Label className={glassModalLabelClass}>归还里程 (km) <span className="text-rose-500">*</span></Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="请输入当前里程表读数"
                    value={returnMileage || ''}
                    onChange={(e) => setReturnMileage(parseFloat(e.target.value) || 0)}
                    className={glassModalInputClass}
                  />
                </div>
              </div>
              <DialogFooter className={glassModalFooterClass}>
                <Button
                  variant="outline"
                  className="h-11 rounded-2xl border-white/85 bg-white/78 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
                  onClick={() => setIsReturnDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  className="h-11 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
                  onClick={handleReturn}
                >
                  <CornerDownLeft size={14} className="mr-2" />
                  确认归还
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== 录入费用弹窗 ==================== */}
      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className={`${glassModalShellClass} max-w-xl`}>
          <DialogHeader className={glassModalHeaderClass}>
            <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_56%)]" />
            <div className="relative">
              <DialogTitle className="flex items-center gap-2 text-[1.35rem] font-bold tracking-tight text-slate-950">
                <DollarSign size={18} className="text-pink-500" />
                录入费用
              </DialogTitle>
              <p className="mt-2 text-sm text-slate-500">为当前用车记录补充油费、过路费、停车费等费用信息。</p>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className={glassModalSectionClass}>
              <Label className={glassModalLabelClass}>费用类型</Label>
              <Select
                value={expenseForm.expenseType || '1'}
                onValueChange={(value) => setExpenseForm({ ...expenseForm, expenseType: value as VehicleExpense['expenseType'] })}
              >
                <SelectTrigger className={glassModalInputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[20px] border-white/80 bg-white/92 backdrop-blur-xl">
                  <SelectItem value="1">油费</SelectItem>
                  <SelectItem value="2">过路费</SelectItem>
                  <SelectItem value="3">停车费</SelectItem>
                  <SelectItem value="4">维修保养</SelectItem>
                  <SelectItem value="5">保险</SelectItem>
                  <SelectItem value="6">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>金额 (元) <span className="text-rose-500">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={expenseForm.amount || ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })}
                  className={glassModalInputClass}
                />
              </div>

              <div className={glassModalSectionClass}>
                <Label className={glassModalLabelClass}>日期</Label>
                <DatePicker
                  variant="glass"
                  type="date"
                  value={expenseForm.expenseDate || ''}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                />
              </div>
            </div>

            <div className={glassModalSectionClass}>
              <Label className={glassModalLabelClass}>说明</Label>
              <Input
                placeholder="费用说明..."
                value={expenseForm.description || ''}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                className={glassModalInputClass}
              />
            </div>
          </div>
          <DialogFooter className={glassModalFooterClass}>
            <Button
              variant="outline"
              className="h-11 rounded-2xl border-white/85 bg-white/78 px-4 shadow-[0_10px_18px_rgba(15,23,42,0.04)]"
              onClick={() => setIsExpenseDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              className="h-11 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] px-4 text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
              onClick={handleSubmitExpense}
            >
              <DollarSign size={14} className="mr-2" />
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleUsageList;

