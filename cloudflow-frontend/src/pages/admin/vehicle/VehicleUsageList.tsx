import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Ban,
  Car,
  CheckCircle,
  Clock,
  CornerDownLeft,
  DollarSign,
  Eye,
  Fuel,
  Loader2,
  MapPin,
  MoreHorizontal,
  ParkingCircle,
  Plus,
  RotateCcw,
  Shield,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  addExpense,
  approveUsage,
  cancelUsage,
  ExpenseStats,
  getExpenseList,
  getExpenseStats,
  getUsageList,
  returnVehicle,
  VehicleExpense,
  VehicleUsage,
} from '@/services/api/vehicle';

interface TableStateRowProps {
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

interface CancelState {
  usageId: number;
  message: string;
}

const ALL_FILTER_VALUE = '__all__';

const USAGE_STATUS: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  '0': {
    label: '待审批',
    className: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    icon: <Clock size={14} />,
  },
  '1': {
    label: '已批准',
    className: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    icon: <CheckCircle size={14} />,
  },
  '2': {
    label: '已驳回',
    className: 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    icon: <XCircle size={14} />,
  },
  '3': {
    label: '进行中',
    className: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    icon: <Car size={14} />,
  },
  '4': {
    label: '已完成',
    className: 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    icon: <CheckCircle size={14} />,
  },
  '5': {
    label: '已取消',
    className: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: <Ban size={14} />,
  },
};

const USAGE_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: '0', label: '待审批' },
  { value: '1', label: '已批准' },
  { value: '3', label: '进行中' },
  { value: '4', label: '已完成' },
  { value: '5', label: '已取消' },
];

const EXPENSE_TYPES: Record<string, { label: string; icon: React.ReactNode }> = {
  '1': { label: '油费', icon: <Fuel size={14} /> },
  '2': { label: '过路费', icon: <ArrowLeftRight size={14} /> },
  '3': { label: '停车费', icon: <ParkingCircle size={14} /> },
  '4': { label: '维修保养', icon: <Wrench size={14} /> },
  '5': { label: '保险', icon: <Shield size={14} /> },
  '6': { label: '其他', icon: <MoreHorizontal size={14} /> },
};

const EXPENSE_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: '1', label: '油费' },
  { value: '2', label: '过路费' },
  { value: '3', label: '停车费' },
  { value: '4', label: '维修保养' },
  { value: '5', label: '保险' },
  { value: '6', label: '其他' },
];

const TableStateRow: React.FC<TableStateRowProps> = ({
  colSpan,
  title,
  description,
  icon,
  loading = false,
}) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon || <Car className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800">
    <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
      {label}
    </div>
    <div className="max-w-[65%] text-right text-sm font-medium text-slate-900 dark:text-slate-100">
      {value}
    </div>
  </div>
);

const DetailSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    </div>
    <div>{children}</div>
  </section>
);

const UsageStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = USAGE_STATUS[status] || {
    label: '未知',
    className: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: null,
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

const ExpenseTypeBadge: React.FC<{ expenseType: string }> = ({ expenseType }) => {
  const config = EXPENSE_TYPES[expenseType] || {
    label: '未知',
    icon: <MoreHorizontal size={14} />,
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
      <span className="text-slate-400 dark:text-slate-500">{config.icon}</span>
      {config.label}
    </span>
  );
};

const createExpenseForm = (): Partial<VehicleExpense> => ({
  expenseType: '1',
  amount: 0,
  expenseDate: new Date().toISOString().split('T')[0],
  description: '',
});

const formatCurrency = (value?: number) => `¥ ${Number(value || 0).toLocaleString()}`;

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '-';
  }
  return value.replace('T', ' ');
};

const renderText = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
};

const VehicleUsageList: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'usage' | 'expense'>('usage');
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [usageQuery, setUsageQuery] = useState({ pageNum: 1, pageSize: 10, status: '' });
  const [expenseQuery, setExpenseQuery] = useState({
    pageNum: 1,
    pageSize: 10,
    expenseType: '',
    startDate: '',
    endDate: '',
  });
  const [currentUsage, setCurrentUsage] = useState<VehicleUsage | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [cancelState, setCancelState] = useState<CancelState | null>(null);
  const [approveRemark, setApproveRemark] = useState('');
  const [returnMileage, setReturnMileage] = useState(0);
  const [expenseForm, setExpenseForm] = useState<Partial<VehicleExpense>>(createExpenseForm);

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
    } catch (error) {
      toast.error(getErrorMessage(error, '获取用车记录失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async () => {
    setExpenseLoading(true);
    try {
      const res = await getExpenseList({
        pageNum: expenseQuery.pageNum,
        pageSize: expenseQuery.pageSize,
        ...(expenseQuery.expenseType ? { expenseType: expenseQuery.expenseType } : {}),
        ...(expenseQuery.startDate ? { startDate: expenseQuery.startDate } : {}),
        ...(expenseQuery.endDate ? { endDate: expenseQuery.endDate } : {}),
      });
      setExpenses(res.rows || []);
      setExpenseTotal(res.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取费用记录失败'));
    } finally {
      setExpenseLoading(false);
    }
  };

  const fetchStats = async (startDate?: string, endDate?: string) => {
    try {
      const res = await getExpenseStats(startDate, endDate);
      setStats(res);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取费用汇总失败'));
    }
  };

  useEffect(() => {
    void fetchUsages();
  }, [usageQuery.pageNum, usageQuery.pageSize, usageQuery.status]);

  useEffect(() => {
    void fetchExpenses();
  }, [expenseQuery.pageNum, expenseQuery.pageSize, expenseQuery.expenseType, expenseQuery.startDate, expenseQuery.endDate]);

  useEffect(() => {
    void fetchStats(expenseQuery.startDate || undefined, expenseQuery.endDate || undefined);
  }, [expenseQuery.startDate, expenseQuery.endDate]);

  const refreshCurrentView = async () => {
    if (activeTab === 'usage') {
      await Promise.all([fetchUsages(), fetchStats(expenseQuery.startDate || undefined, expenseQuery.endDate || undefined)]);
      return;
    }

    await Promise.all([fetchExpenses(), fetchStats(expenseQuery.startDate || undefined, expenseQuery.endDate || undefined)]);
  };

  const handleViewDetail = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setShowDetailDialog(true);
  };

  const handleOpenApprove = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setApproveRemark('');
    setShowApproveDialog(true);
  };

  const handleApprove = async (approved: boolean) => {
    if (!currentUsage?.usageId) {
      return;
    }

    try {
      await approveUsage(currentUsage.usageId, approved, approveRemark);
      toast.success(approved ? '已批准' : '已驳回');
      setShowApproveDialog(false);
      setCurrentUsage(null);
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, approved ? '批准失败' : '驳回失败'));
    }
  };

  const handleOpenReturn = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setReturnMileage(usage.endMileage || usage.startMileage || 0);
    setShowReturnDialog(true);
  };

  const handleReturn = async () => {
    if (!currentUsage?.usageId) {
      return;
    }
    if (returnMileage <= 0) {
      toast.error('请输入有效的归还里程');
      return;
    }

    try {
      await returnVehicle(currentUsage.usageId, { endMileage: returnMileage });
      toast.success('车辆已归还');
      setShowReturnDialog(false);
      setCurrentUsage(null);
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, '归还失败'));
    }
  };

  const handleOpenExpense = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setExpenseForm(createExpenseForm());
    setShowExpenseDialog(true);
  };

  const handleSubmitExpense = async () => {
    if (!currentUsage?.usageId || !expenseForm.amount || expenseForm.amount <= 0) {
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
      setShowExpenseDialog(false);
      setCurrentUsage(null);
      await Promise.all([
        fetchExpenses(),
        fetchStats(expenseQuery.startDate || undefined, expenseQuery.endDate || undefined),
      ]);
    } catch (error) {
      toast.error(getErrorMessage(error, '录入费用失败'));
    }
  };

  const openCancelConfirm = (usage: VehicleUsage) => {
    if (!usage.usageId) {
      return;
    }
    setCancelState({
      usageId: usage.usageId,
      message: `确认取消 ${usage.vehiclePlate || `车辆#${usage.vehicleId}`} 的用车申请？`,
    });
  };

  const usagePrimaryAction = (usage: VehicleUsage) => {
    if (usage.status === '0') {
      return {
        label: '审批',
        icon: <CheckCircle size={14} />,
        onClick: () => handleOpenApprove(usage),
        tone: 'primary' as const,
      };
    }

    if (usage.status === '1' || usage.status === '3') {
      return {
        label: '归还',
        icon: <CornerDownLeft size={14} />,
        onClick: () => handleOpenReturn(usage),
        tone: 'success' as const,
      };
    }

    if (usage.status === '4') {
      return {
        label: '费用',
        icon: <DollarSign size={14} />,
        onClick: () => handleOpenExpense(usage),
        tone: 'info' as const,
      };
    }

    return null;
  };

  const handleCancelConfirm = async () => {
    if (!cancelState) {
      return;
    }

    try {
      await cancelUsage(cancelState.usageId);
      toast.success('已取消');
      setCancelState(null);
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const pendingCount = useMemo(
    () => usages.filter((item) => item.status === '0').length,
    [usages],
  );
  const inUseCount = useMemo(
    () => usages.filter((item) => item.status === '3').length,
    [usages],
  );
  const completedCount = useMemo(
    () => usages.filter((item) => item.status === '4').length,
    [usages],
  );
  const usageTotalPages = Math.max(1, Math.ceil(usageTotal / usageQuery.pageSize));
  const expenseTotalPages = Math.max(1, Math.ceil(expenseTotal / expenseQuery.pageSize));
  const currentStatusLabel = USAGE_STATUS_OPTIONS.find((item) => item.value === usageQuery.status)?.label || '全部状态';
  const currentExpenseTypeLabel = EXPENSE_TYPE_OPTIONS.find((item) => item.value === expenseQuery.expenseType)?.label || '全部类型';
  const usageSummaryText = `待审批 ${pendingCount} · 进行中 ${inUseCount} · 已完成 ${completedCount}`;
  const selectedExpenseAmount = expenseQuery.expenseType
    ? Number(stats?.byType?.[expenseQuery.expenseType] || 0)
    : null;
  const expenseSummaryText = stats
    ? `汇总 ${formatCurrency(
        expenseQuery.expenseType ? selectedExpenseAmount || 0 : stats.totalAmount,
      )} · 共 ${expenseTotal} 条`
    : `共 ${expenseTotal} 条`;
  const hasExpenseFilters = Boolean(expenseQuery.expenseType || expenseQuery.startDate || expenseQuery.endDate);
  const expenseDateRangeLabel = expenseQuery.startDate || expenseQuery.endDate
    ? `${expenseQuery.startDate || '起'} 至 ${expenseQuery.endDate || '今'}`
    : '全部日期';
  const expenseHeaderLabel = hasExpenseFilters
    ? `${currentExpenseTypeLabel} · ${expenseDateRangeLabel}`
    : '费用明细';
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Car className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Vehicle Usage
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          用车记录与费用
        </h1>
      </div>

      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setActiveTab('usage')}
                  className={[
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'usage'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400',
                  ].join(' ')}
                >
                  用车记录
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('expense')}
                  className={[
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'expense'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-500 dark:text-slate-400',
                  ].join(' ')}
                >
                  费用明细
                </button>
              </div>

              {activeTab === 'usage' ? (
                <>
                  <div className="w-full sm:w-[170px]">
                    <Select
                      value={usageQuery.status || ALL_FILTER_VALUE}
                      onValueChange={(value) =>
                        setUsageQuery((prev) => ({
                          ...prev,
                          status: value === ALL_FILTER_VALUE ? '' : value,
                          pageNum: 1,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="全部状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
                        {USAGE_STATUS_OPTIONS.filter((item) => item.value).map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{usageSummaryText}</div>
                </>
              ) : (
                <>
                  <div className="w-full sm:w-[170px]">
                    <Select
                      value={expenseQuery.expenseType || ALL_FILTER_VALUE}
                      onValueChange={(value) =>
                        setExpenseQuery((prev) => ({
                          ...prev,
                          expenseType: value === ALL_FILTER_VALUE ? '' : value,
                          pageNum: 1,
                        }))
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="全部类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                        {EXPENSE_TYPE_OPTIONS.filter((item) => item.value).map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <DatePicker
                    type="date"
                    value={expenseQuery.startDate}
                    onChange={(event) =>
                      setExpenseQuery((prev) => ({
                        ...prev,
                        startDate: event.target.value,
                        pageNum: 1,
                      }))
                    }
                    className="h-10 w-full sm:w-[156px]"
                  />
                  <DatePicker
                    type="date"
                    value={expenseQuery.endDate}
                    onChange={(event) =>
                      setExpenseQuery((prev) => ({
                        ...prev,
                        endDate: event.target.value,
                        pageNum: 1,
                      }))
                    }
                    className="h-10 w-full sm:w-[156px]"
                  />
                  <div className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                    {expenseSummaryText}
                  </div>
                </>
              )}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
              {activeTab === 'usage' && usageQuery.status ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setUsageQuery((prev) => ({
                      ...prev,
                      status: '',
                      pageNum: 1,
                    }))
                  }
                >
                  清空筛选
                </Button>
              ) : null}
              {activeTab === 'expense' && hasExpenseFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpenseQuery((prev) => ({
                      ...prev,
                      expenseType: '',
                      startDate: '',
                      endDate: '',
                      pageNum: 1,
                    }))
                  }
                >
                  清空筛选
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void refreshCurrentView()} disabled={loading || expenseLoading}>
                <RotateCcw size={14} className={loading || expenseLoading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={() => navigate('/admin/vehicle/booking')}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {activeTab === 'usage' ? currentStatusLabel : expenseHeaderLabel}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {activeTab === 'usage'
                    ? `${usageTotal} 条 · 第 ${usageQuery.pageNum} / ${usageTotalPages} 页`
                    : `${expenseTotal} 条 · 第 ${expenseQuery.pageNum} / ${expenseTotalPages} 页`}
                </div>
              </div>
            </div>

            {activeTab === 'usage' ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                    <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">车辆</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">申请人</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">用车时间</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">目的地</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">事由</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                      <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                      <TableStateRow colSpan={7} title="正在加载用车记录" loading />
                    ) : usages.length === 0 ? (
                      <TableStateRow
                        colSpan={7}
                        title="暂无用车记录"
                        description="新建申请后会显示在这里。"
                      />
                    ) : (
                      usages.map((usage) => (
                        <TableRow
                          key={usage.usageId}
                          className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
                        >
                          <TableCell className="px-4 py-3 align-top">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {usage.vehiclePlate || `车辆#${usage.vehicleId}`}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                              申请 #{usage.usageId}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            {usage.applicantName || `用户${usage.applicantId}`}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            <div>{formatDateTime(usage.startTime)}</div>
                            <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                              至 {formatDateTime(usage.endTime)}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400 dark:text-slate-500" />
                              {usage.destination}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            <span className="line-clamp-1 max-w-[220px]">{usage.reason || '-'}</span>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top">
                            <UsageStatusBadge status={usage.status || '0'} />
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-right">
                            <TableRowActions
                              align="end"
                              iconOnly
                              actions={[
                                {
                                  label: '详情',
                                  icon: <Eye size={14} />,
                                  onClick: () => handleViewDetail(usage),
                                  tone: 'neutral',
                                },
                                ...(usagePrimaryAction(usage) ? [usagePrimaryAction(usage)!] : []),
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                    <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">车辆</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">费用类型</TableHead>
                      <TableHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">金额</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">日期</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">说明</TableHead>
                      <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">录入时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {expenseLoading ? (
                      <TableStateRow colSpan={6} title="正在加载费用记录" loading />
                    ) : expenses.length === 0 ? (
                      <TableStateRow
                        colSpan={6}
                        title="暂无费用记录"
                        description="录入费用后会显示在这里。"
                        icon={<DollarSign className="h-4 w-4" />}
                      />
                    ) : (
                      expenses.map((expense) => (
                        <TableRow
                          key={expense.expenseId}
                          className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
                        >
                          <TableCell className="px-4 py-3 align-top">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {expense.vehiclePlate || `车辆#${expense.vehicleId}`}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top">
                            <ExpenseTypeBadge expenseType={expense.expenseType} />
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrency(expense.amount)}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            {renderText(expense.expenseDate)}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            {renderText(expense.description)}
                          </TableCell>
                          <TableCell className="px-4 py-3 align-top text-sm text-slate-500 dark:text-slate-400">
                            {renderText(expense.createTime)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        pagination={(
          activeTab === 'usage'
            ? (usageTotal > 0 ? (
                <Pagination
                  total={usageTotal}
                  page={usageQuery.pageNum}
                  pageSize={usageQuery.pageSize}
                  showPageSizeSelector={false}
                  showJump={false}
                  onPageChange={(page) =>
                    setUsageQuery((prev) => ({
                      ...prev,
                      pageNum: page,
                    }))
                  }
                  onPageSizeChange={() => {}}
                />
              ) : null)
            : (expenseTotal > 0 ? (
                <Pagination
                  total={expenseTotal}
                  page={expenseQuery.pageNum}
                  pageSize={expenseQuery.pageSize}
                  showPageSizeSelector={false}
                  showJump={false}
                  onPageChange={(page) =>
                    setExpenseQuery((prev) => ({
                      ...prev,
                      pageNum: page,
                    }))
                  }
                  onPageSizeChange={() => {}}
                />
              ) : null)
        )}
      />

      <BaseDialog
        open={showDetailDialog && Boolean(currentUsage)}
        title="用车详情"
        onClose={() => {
          setShowDetailDialog(false);
          setCurrentUsage(null);
        }}
        maxWidthClassName="max-w-3xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDetailDialog(false);
                setCurrentUsage(null);
              }}
            >
              关闭
            </Button>
            {currentUsage?.status === '0' ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (!currentUsage) {
                    return;
                  }
                  setShowDetailDialog(false);
                  openCancelConfirm(currentUsage);
                }}
              >
                取消申请
              </Button>
            ) : null}
            {currentUsage?.status === '3' ? (
              <Button
                onClick={() => {
                  if (!currentUsage) {
                    return;
                  }
                  setShowDetailDialog(false);
                  handleOpenExpense(currentUsage);
                }}
              >
                录入费用
              </Button>
            ) : null}
          </>
        )}
      >
        {currentUsage ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  申请人 {currentUsage.applicantName || `用户${currentUsage.applicantId}`}
                </div>
              </div>
              <div className="ml-auto">
                <UsageStatusBadge status={currentUsage.status || '0'} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DetailSection title="行程信息">
                <DetailField label="开始时间" value={formatDateTime(currentUsage.startTime)} />
                <DetailField label="结束时间" value={formatDateTime(currentUsage.endTime)} />
                <DetailField label="目的地" value={renderText(currentUsage.destination)} />
                <DetailField label="还车地点" value={renderText(currentUsage.returnLocation)} />
                <DetailField label="行程类型" value={currentUsage.isRoundTrip ? '往返' : '单程'} />
                <DetailField label="随行人数" value={`${currentUsage.passengerCount || 0} 人`} />
              </DetailSection>

              <DetailSection title="执行信息">
                <DetailField label="随行人员" value={renderText(currentUsage.passengers)} />
                <DetailField label="出发里程" value={currentUsage.startMileage != null ? `${currentUsage.startMileage} km` : '-'} />
                <DetailField label="归还里程" value={currentUsage.endMileage != null ? `${currentUsage.endMileage} km` : '-'} />
                <DetailField label="审批人" value={renderText(currentUsage.approverName)} />
                <DetailField label="审批意见" value={renderText(currentUsage.approveRemark)} />
                <DetailField label="创建时间" value={renderText(currentUsage.createTime)} />
              </DetailSection>
            </div>

            <DetailSection title="用车事由">
              <div className="px-4 py-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {currentUsage.reason || '-'}
              </div>
            </DetailSection>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showApproveDialog && Boolean(currentUsage)}
        title="审批申请"
        onClose={() => {
          setShowApproveDialog(false);
          setCurrentUsage(null);
        }}
        maxWidthClassName="max-w-2xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowApproveDialog(false);
                setCurrentUsage(null);
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleApprove(false)}
            >
              驳回
            </Button>
            <Button onClick={() => void handleApprove(true)}>
              批准
            </Button>
          </>
        )}
      >
        {currentUsage ? (
          <>
            <DetailSection title="申请信息">
              <DetailField label="车辆" value={currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`} />
              <DetailField label="申请人" value={currentUsage.applicantName || `用户${currentUsage.applicantId}`} />
              <DetailField label="用车时间" value={`${formatDateTime(currentUsage.startTime)} 至 ${formatDateTime(currentUsage.endTime)}`} />
              <DetailField label="目的地" value={renderText(currentUsage.destination)} />
            </DetailSection>

            <DetailSection title="用车事由">
              <div className="px-4 py-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {currentUsage.reason || '-'}
              </div>
            </DetailSection>

            <div className="space-y-2">
              <Label>审批意见</Label>
              <Textarea
                className="min-h-[120px] resize-none"
                placeholder="可选"
                value={approveRemark}
                onChange={(event) => setApproveRemark(event.target.value)}
              />
            </div>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showReturnDialog && Boolean(currentUsage)}
        title="归还车辆"
        onClose={() => {
          setShowReturnDialog(false);
          setCurrentUsage(null);
        }}
        maxWidthClassName="max-w-xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowReturnDialog(false);
                setCurrentUsage(null);
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleReturn()}>
              确认归还
            </Button>
          </>
        )}
      >
        {currentUsage ? (
          <>
            <DetailSection title="当前申请">
              <DetailField label="车辆" value={currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`} />
              <DetailField label="目的地" value={renderText(currentUsage.destination)} />
            </DetailSection>

            <div className="space-y-2">
              <Label>归还里程 (km)</Label>
              <Input
                type="number"
                min={0}
                placeholder="请输入当前里程"
                value={returnMileage || ''}
                onChange={(event) => setReturnMileage(parseFloat(event.target.value) || 0)}
                className="h-11"
              />
            </div>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showExpenseDialog && Boolean(currentUsage)}
        title="录入费用"
        onClose={() => {
          setShowExpenseDialog(false);
          setCurrentUsage(null);
        }}
        maxWidthClassName="max-w-xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowExpenseDialog(false);
                setCurrentUsage(null);
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleSubmitExpense()}>
              提交
            </Button>
          </>
        )}
      >
        {currentUsage ? (
          <>
            <DetailSection title="当前申请">
              <DetailField label="车辆" value={currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`} />
              <DetailField label="申请" value={`#${currentUsage.usageId}`} />
            </DetailSection>

            <div className="space-y-2">
              <Label>费用类型</Label>
              <Select
                value={expenseForm.expenseType || '1'}
                onValueChange={(value) =>
                  setExpenseForm((prev) => ({ ...prev, expenseType: value as VehicleExpense['expenseType'] }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
              <div className="space-y-2">
                <Label>金额 (元)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={expenseForm.amount || ''}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, amount: parseFloat(event.target.value) || 0 }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>日期</Label>
                <DatePicker
                  type="date"
                  value={expenseForm.expenseDate || ''}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, expenseDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>说明</Label>
              <Input
                placeholder="可选"
                value={expenseForm.description || ''}
                onChange={(event) =>
                  setExpenseForm((prev) => ({ ...prev, description: event.target.value }))
                }
                className="h-11"
              />
            </div>
          </>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(cancelState)}
        title="取消申请"
        message={cancelState?.message || ''}
        confirmText="确认取消"
        danger
        onConfirm={() => void handleCancelConfirm()}
        onCancel={() => setCancelState(null)}
      />
    </div>
  );
};

export default VehicleUsageList;
