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
  WorkspaceBackdrop,
  WorkspaceHeroMetricsSection,
  WorkspacePaginationBar,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';
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
    bg: 'border border-amber-200 bg-amber-50',
    icon: <Clock size={14} />
  },
  '1': {
    label: '已批准',
    color: 'text-emerald-700',
    bg: 'border border-emerald-200 bg-emerald-50',
    icon: <CheckCircle size={14} />
  },
  '2': {
    label: '已驳回',
    color: 'text-rose-700',
    bg: 'border border-rose-200 bg-rose-50',
    icon: <XCircle size={14} />
  },
  '3': {
    label: '进行中',
    color: 'text-cyan-700',
    bg: 'border border-cyan-200 bg-cyan-50',
    icon: <Car size={14} />
  },
  '4': {
    label: '已完成',
    color: 'text-cyan-700',
    bg: 'border border-cyan-200 bg-cyan-50',
    icon: <CheckCircle size={14} />
  },
  '5': {
    label: '已取消',
    color: 'text-slate-500',
    bg: 'border border-slate-200 bg-slate-50',
    icon: <Ban size={14} />
  },
};

/** 费用类型配置 */
const EXPENSE_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  '1': { label: '油费', icon: <Fuel size={14} />, color: 'text-orange-600' },
  '2': { label: '过路费', icon: <ArrowLeftRight size={14} />, color: 'text-cyan-600' },
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
    bg: 'border border-slate-200 bg-slate-50',
    icon: null
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
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
      icon: activeTab === 'usage' ? <Car size={17} /> : <DollarSign size={17} />,
    },
    {
      label: '待审批',
      value: `${pendingCount}`,
      hint: pendingCount > 0 ? '建议优先处理待审批用车申请' : '当前没有待审批的申请',
      icon: <Clock size={17} />,
    },
    {
      label: '进行中',
      value: `${inUseCount}`,
      hint: completedCount > 0 ? `已完成 ${completedCount} 条归还记录` : '暂无已完成归还记录',
      icon: <Car size={17} />,
    },
    {
      label: '累计费用',
      value: formatCurrency(stats?.totalAmount),
      hint: stats?.count ? `共 ${stats.count} 笔费用记录` : '当前还没有录入车辆费用',
      icon: <DollarSign size={17} />,
    },
  ]), [activeTab, completedCount, expenseTotal, inUseCount, pendingCount, stats, usageTotal]);

  const workspaceOverviewItems = useMemo(() => {
    if (activeTab === 'usage') {
      return [
        { label: '记录数', value: `${usageTotal} 条` },
        { label: '状态', value: currentStatusLabel },
        { label: '当前页', value: `第 ${usageQuery.pageNum} 页` },
        { label: '视图', value: hasUsageFilters ? '筛选结果' : '默认视图' },
      ];
    }

    return [
      { label: '费用笔数', value: `${expenseTotal} 条` },
      { label: '本月费用', value: formatCurrency(stats?.monthlyAmount) },
      { label: '上月费用', value: formatCurrency(stats?.lastMonthAmount) },
      { label: '视图', value: '费用明细' },
    ];
  }, [activeTab, currentStatusLabel, expenseTotal, hasUsageFilters, stats, usageQuery.pageNum, usageTotal]);

  const workspaceTitle = activeTab === 'usage' ? '用车记录' : '费用明细';
  const glassModalShellClass = 'w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_22px_44px_rgba(15,23,42,0.14)]';
  const glassModalHeaderClass = 'sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4';
  const glassModalSectionClass = 'overflow-visible rounded-2xl border border-slate-200 bg-slate-50 p-4';
  const glassModalLabelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
  const glassModalInputClass = 'h-11 rounded-xl';
  const glassModalTextareaClass = 'min-h-28 rounded-xl';
  const glassModalFooterClass = 'sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4';
  const glassDetailCardClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';

  // ==================== 渲染 ====================

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Calendar size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="用车记录与费用"
          actions={(
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button size="lg" onClick={() => navigate('/admin/vehicle/booking')}>
                <Plus size={15} className="mr-2" />
                新建申请
              </Button>
              <Button variant="outline" size="lg" onClick={handleRefreshCurrentTab}>
                <RotateCcw size={15} className="mr-2" />
                刷新数据
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
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
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                      {activeTab === 'usage' ? (hasUsageFilters ? '已应用筛选' : '默认视图') : '费用追踪'}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                      共 {activeTab === 'usage' ? usageTotal : expenseTotal} 条
                    </span>
                  </>
                )}
                filterBar={(
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <TabsList className="inline-flex h-auto flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
                        <TabsTrigger
                          value="usage"
                          className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                          <Car size={14} className="mr-1.5" />
                          用车记录
                        </TabsTrigger>
                        <TabsTrigger
                          value="expense"
                          className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                          <DollarSign size={14} className="mr-1.5" />
                          费用明细
                        </TabsTrigger>
                      </TabsList>

                      {activeTab === 'usage' ? (
                        hasUsageFilters ? (
                          <Button variant="outline" size="sm" onClick={resetUsageFilters}>
                            <RotateCcw size={15} className="mr-2" />
                            清空所有条件
                          </Button>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                            当前未应用额外筛选
                          </span>
                        )
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
                          {expenseTypeSummary.length > 0 ? `覆盖 ${expenseTypeSummary.length} 类费用` : '当前暂无费用分布'}
                        </span>
                      )}
                    </div>

                    {activeTab === 'usage' ? (
                      <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
                        {STATUS_QUICK_FILTERS.map((item) => {
                          const active = usageQuery.status === item.value;
                          return (
                            <button
                              key={item.value || 'ALL'}
                              type="button"
                              onClick={() => applyStatusFilter(item.value)}
                              className={[
                                'rounded-lg px-3 py-1.5 text-[11px] font-medium transition',
                                active
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-500 hover:text-slate-900',
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
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600"
                          >
                            <span className={item.color}>{item.icon}</span>
                            <span>{item.label}</span>
                            <span className="font-semibold text-slate-900">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[12px] text-slate-400">
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
                      <TableHeader className="bg-slate-50">
                        <TableRow className="border-slate-200 hover:bg-transparent">
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
                              <TableRow key={usage.usageId} className="border-slate-100 transition hover:bg-slate-50">
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
                      <TableHeader className="bg-slate-50">
                        <TableRow className="border-slate-200 hover:bg-transparent">
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
                              <TableRow key={expense.expenseId} className="border-slate-100 transition hover:bg-slate-50">
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
      </WorkspacePageContent>

      {/* ==================== 详情弹窗 ==================== */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className={`${glassModalShellClass} max-w-3xl`}>
          <DialogHeader className={glassModalHeaderClass}>
            <div>
              <DialogTitle className="flex items-center gap-2 text-[1.5rem] font-bold tracking-tight text-slate-950">
                <Eye size={18} className="text-slate-500" />
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
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setIsDetailDialogOpen(false)}>
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
            <div>
              <DialogTitle className="flex items-center gap-2 text-[1.35rem] font-bold tracking-tight text-slate-950">
                <CheckCircle size={18} className="text-slate-500" />
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
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setIsApproveDialogOpen(false)}>
                  取消
                </Button>
                <Button variant="destructive" className="h-11 rounded-xl" onClick={() => handleApprove(false)}>
                  <XCircle size={14} className="mr-2" />
                  驳回
                </Button>
                <Button className="h-11 rounded-xl" onClick={() => handleApprove(true)}>
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
            <div>
              <DialogTitle className="flex items-center gap-2 text-[1.35rem] font-bold tracking-tight text-slate-950">
                <CornerDownLeft size={18} className="text-slate-500" />
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
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setIsReturnDialogOpen(false)}>
                  取消
                </Button>
                <Button className="h-11 rounded-xl" onClick={handleReturn}>
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
            <div>
              <DialogTitle className="flex items-center gap-2 text-[1.35rem] font-bold tracking-tight text-slate-950">
                <DollarSign size={18} className="text-slate-500" />
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
                <SelectContent className="rounded-xl border-slate-200 bg-white">
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
                  className={glassModalInputClass}
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
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setIsExpenseDialogOpen(false)}>
              取消
            </Button>
            <Button className="h-11 rounded-xl" onClick={handleSubmitExpense}>
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

