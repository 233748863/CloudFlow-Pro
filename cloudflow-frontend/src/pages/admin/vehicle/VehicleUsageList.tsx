import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Ban,
  Car,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  Fuel,
  Loader2,
  MoreHorizontal,
  ParkingCircle,
  Plus,
  RotateCcw,
  Send,
  Shield,
  UserCog,
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
  SegmentedControl,
  SegmentedControlItem,
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
  UserSelector,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  addExpense,
  approveUsage,
  cancelUsage,
  dispatchUsage,
  getExpenseList,
  getExpenseStats,
  getUsageList,
  returnVehicle,
  ExpenseStats,
  VehicleExpense,
  VehicleUsage,
} from '@/services/api/vehicle';
import { expenseClaimApi } from '@/services/api/expense';
import type { UserBrief } from '@/types/workflow';
import { useAuth } from '@/context/AuthContext';

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
  { value: '2', label: '已驳回' },
  { value: '3', label: '进行中' },
  { value: '4', label: '已完成' },
  { value: '5', label: '已取消' },
];

const EXPENSE_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  '1': { label: '油费', icon: <Fuel size={14} />, color: 'text-orange-600 dark:text-orange-300' },
  '2': { label: '过路费', icon: <ArrowLeftRight size={14} />, color: 'text-cyan-600 dark:text-cyan-300' },
  '3': { label: '停车费', icon: <ParkingCircle size={14} />, color: 'text-violet-600 dark:text-violet-300' },
  '4': { label: '维修保养', icon: <Wrench size={14} />, color: 'text-amber-600 dark:text-amber-300' },
  '5': { label: '保险', icon: <Shield size={14} />, color: 'text-emerald-600 dark:text-emerald-300' },
  '6': { label: '其他', icon: <MoreHorizontal size={14} />, color: 'text-slate-600 dark:text-slate-300' },
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

const createExpenseForm = (): Partial<VehicleExpense> => ({
  expenseType: '1',
  amount: 0,
  expenseDate: new Date().toISOString().split('T')[0],
  description: '',
});

const createDispatchForm = () => ({
  driverMode: '0',
  driverIds: [] as string[],
  driverId: undefined as number | undefined,
  startMileage: 0,
  dispatchRemark: '',
  actualStartTime: new Date().toISOString().slice(0, 16),
});

const TableStateRow: React.FC<TableStateRowProps> = ({ colSpan, title, description, icon, loading = false }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon || <Car className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </TableCell>
  </TableRow>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800">
    <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">{label}</div>
    <div className="max-w-[65%] text-right text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
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
    color: 'text-slate-600 dark:text-slate-300',
  };

  return <span className={cn('inline-flex items-center gap-1.5 text-sm', config.color)}>{config.icon}{config.label}</span>;
};

const formatCurrency = (value?: number | string | null) => `¥ ${Number(value || 0).toLocaleString()}`;
const formatDateTime = (value?: string | null) => (value ? value.replace('T', ' ').slice(0, 19) : '-');
const renderText = (value?: string | number | null) => (value === null || value === undefined || value === '' ? '-' : String(value));

const VehicleUsageList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'usage' | 'expense'>('usage');
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [stats, setStats] = useState<ExpenseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [usageQuery, setUsageQuery] = useState({ pageNum: 1, pageSize: 10, status: '' });
  const [expenseQuery, setExpenseQuery] = useState({ pageNum: 1, pageSize: 10, expenseType: '', startDate: '', endDate: '', vehicleId: '', usageId: '' });
  const [currentUsage, setCurrentUsage] = useState<VehicleUsage | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [cancelState, setCancelState] = useState<CancelState | null>(null);
  const [approveRemark, setApproveRemark] = useState('');
  const [returnMileage, setReturnMileage] = useState(0);
  const [returnLocation, setReturnLocation] = useState('');
  const [returnRemark, setReturnRemark] = useState('');
  const [expenseForm, setExpenseForm] = useState<Partial<VehicleExpense>>(createExpenseForm);
  const [dispatchForm, setDispatchForm] = useState(createDispatchForm);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);

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
      const params = {
        pageNum: expenseQuery.pageNum,
        pageSize: expenseQuery.pageSize,
        ...(expenseQuery.expenseType ? { expenseType: expenseQuery.expenseType } : {}),
        ...(expenseQuery.startDate ? { startDate: expenseQuery.startDate } : {}),
        ...(expenseQuery.endDate ? { endDate: expenseQuery.endDate } : {}),
        ...(expenseQuery.vehicleId ? { vehicleId: Number(expenseQuery.vehicleId) } : {}),
        ...(expenseQuery.usageId ? { usageId: Number(expenseQuery.usageId) } : {}),
      };
      const res = await getExpenseList(params);
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
      setStats(await getExpenseStats(startDate, endDate));
    } catch (error) {
      toast.error(getErrorMessage(error, '获取费用汇总失败'));
    }
  };

  useEffect(() => { void fetchUsages(); }, [usageQuery.pageNum, usageQuery.pageSize, usageQuery.status]);
  useEffect(() => { void fetchExpenses(); }, [expenseQuery.pageNum, expenseQuery.pageSize, expenseQuery.expenseType, expenseQuery.startDate, expenseQuery.endDate, expenseQuery.vehicleId, expenseQuery.usageId]);
  useEffect(() => { void fetchStats(expenseQuery.startDate || undefined, expenseQuery.endDate || undefined); }, [expenseQuery.startDate, expenseQuery.endDate]);

  const refreshCurrentView = async () => {
    if (activeTab === 'usage') {
      await fetchUsages();
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
    if (!currentUsage?.usageId) return;
    setActionLoading(true);
    try {
      await approveUsage(currentUsage.usageId, approved, approveRemark);
      toast.success(approved ? '已批准' : '已驳回');
      setShowApproveDialog(false);
      setCurrentUsage(null);
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, approved ? '批准失败' : '驳回失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDispatch = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setDispatchForm({
      driverMode: usage.driverMode === 1 ? '1' : '0',
      driverIds: usage.driverId ? [String(usage.driverId)] : [],
      driverId: usage.driverId,
      startMileage: usage.startMileage || 0,
      dispatchRemark: usage.dispatchRemark || '',
      actualStartTime: new Date().toISOString().slice(0, 16),
    });
    setShowDispatchDialog(true);
  };

  const updateDispatchUsers = useCallback((users: UserBrief[]) => {
    const first = users[0];
    setDispatchForm((prev) => ({
      ...prev,
      driverId: first ? Number(first.id) : undefined,
    }));
  }, []);

  const handleDispatch = async () => {
    if (!currentUsage?.usageId) return;
    if (dispatchForm.driverMode === '1' && !dispatchForm.driverId) {
      toast.error('请选择司机');
      return;
    }
    setActionLoading(true);
    try {
      await dispatchUsage(currentUsage.usageId, {
        driverMode: dispatchForm.driverMode === '1' ? 1 : 0,
        driverId: dispatchForm.driverMode === '1' ? dispatchForm.driverId : undefined,
        startMileage: dispatchForm.startMileage,
        dispatchRemark: dispatchForm.dispatchRemark,
        actualStartTime: `${dispatchForm.actualStartTime}:00`,
      });
      toast.success('派车成功');
      setShowDispatchDialog(false);
      setCurrentUsage(null);
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, '派车失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReturn = (usage: VehicleUsage) => {
    setCurrentUsage(usage);
    setReturnMileage(usage.endMileage || usage.startMileage || 0);
    setReturnLocation(usage.returnLocation || '');
    setReturnRemark(usage.returnRemark || '');
    setShowReturnDialog(true);
  };

  const handleReturn = async () => {
    if (!currentUsage?.usageId) return;
    if (returnMileage <= 0) {
      toast.error('请输入有效的归还里程');
      return;
    }
    setActionLoading(true);
    try {
      await returnVehicle(currentUsage.usageId, {
        endMileage: returnMileage,
        returnLocation,
        remark: returnRemark,
      });
      toast.success('车辆已归还');
      setShowReturnDialog(false);
      setCurrentUsage(null);
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, '归还失败'));
    } finally {
      setActionLoading(false);
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
    setActionLoading(true);
    try {
      await addExpense({
        ...expenseForm,
        usageId: currentUsage.usageId,
        vehicleId: currentUsage.vehicleId,
      } as VehicleExpense);
      toast.success('费用已录入');
      setShowExpenseDialog(false);
      setCurrentUsage(null);
      await Promise.all([fetchExpenses(), fetchStats(expenseQuery.startDate || undefined, expenseQuery.endDate || undefined)]);
    } catch (error) {
      toast.error(getErrorMessage(error, '录入费用失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertExpenses = async () => {
    if (selectedExpenseIds.length === 0) {
      toast.error('请选择需要转报销的费用');
      return;
    }
    if (!user?.id) {
      toast.error('当前登录用户无效');
      return;
    }
    setActionLoading(true);
    try {
      await expenseClaimApi.convertVehicleExpense({ vehicleExpenseIds: selectedExpenseIds, userId: Number(user.id) });
      toast.success('已生成报销草稿');
      setSelectedExpenseIds([]);
    } catch (error) {
      toast.error(getErrorMessage(error, '转报销失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const openCancelConfirm = (usage: VehicleUsage) => {
    if (!usage.usageId) return;
    setCancelState({
      usageId: usage.usageId,
      message: `确认取消 ${usage.vehiclePlate || `车辆#${usage.vehicleId}`} 的用车申请？`,
    });
  };

  const handleCancelConfirm = async () => {
    if (!cancelState) return;
    const currentCancelState = cancelState;
    setCancelState(null);
    setActionLoading(true);
    try {
      await cancelUsage(currentCancelState.usageId);
      toast.success('已取消');
      await fetchUsages();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const usagePrimaryActions = useMemo(() => ({
    pending: usages.filter((item) => item.status === '0').length,
    approved: usages.filter((item) => item.status === '1').length,
    inUse: usages.filter((item) => item.status === '3').length,
    completed: usages.filter((item) => item.status === '4').length,
  }), [usages]);

  const expenseTypeSummary = useMemo(() => Object.entries(stats?.byType || {}).map(([type, amount]) => {
    const config = EXPENSE_TYPES[type] || { label: '未知', icon: <MoreHorizontal size={14} />, color: 'text-slate-600 dark:text-slate-300' };
    return { type, amount: amount as number, ...config };
  }), [stats]);

  const hasUsageFilters = Boolean(usageQuery.status);
  const hasExpenseFilters = Boolean(expenseQuery.expenseType || expenseQuery.startDate || expenseQuery.endDate || expenseQuery.vehicleId || expenseQuery.usageId);
  const currentStatusLabel = USAGE_STATUS_OPTIONS.find((item) => item.value === usageQuery.status)?.label || '全部状态';
  const expenseDateSummary = useMemo(() => {
    if (expenseQuery.startDate && expenseQuery.endDate) return `${expenseQuery.startDate} 至 ${expenseQuery.endDate}`;
    if (expenseQuery.startDate) return `自 ${expenseQuery.startDate}`;
    if (expenseQuery.endDate) return `截至 ${expenseQuery.endDate}`;
    return '全部时间';
  }, [expenseQuery.endDate, expenseQuery.startDate]);

  const resetUsageFilters = () => setUsageQuery((prev) => ({ ...prev, status: '', pageNum: 1 }));
  const resetExpenseFilters = () => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, expenseType: '', startDate: '', endDate: '', vehicleId: '', usageId: '' }));

  const usageTable = (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">用车记录</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>状态 {currentStatusLabel}</span>
            <span>待审批 {usagePrimaryActions.pending}</span>
            <span>待派车 {usagePrimaryActions.approved}</span>
            <span>进行中 {usagePrimaryActions.inUse}</span>
            <span>已完成 {usagePrimaryActions.completed}</span>
          </div>
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500">共 {usageTotal} 条</div>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[1200px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
              <TableHead>车辆</TableHead>
              <TableHead>申请人 / 司机</TableHead>
              <TableHead>用车时间</TableHead>
              <TableHead>目的地</TableHead>
              <TableHead>里程 / 费用</TableHead>
              <TableHead>状态</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableStateRow loading colSpan={7} title="正在加载用车记录" />
            ) : usages.length === 0 ? (
              <TableStateRow colSpan={7} icon={<Car size={20} />} title="暂无用车记录" description="新建申请后，这里会显示审批、派车、归还和录费处理。" />
            ) : (
              usages.map((usage) => (
                <TableRow key={usage.usageId}>
                  <TableCell className="align-top">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{usage.vehiclePlate || `车辆#${usage.vehicleId}`}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">申请单 #{usage.usageId}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{usage.applicantName || `用户${usage.applicantId}`}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      司机 {usage.driverName || (usage.driverMode === 0 ? '自驾' : '-')}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-600 dark:text-slate-300">
                    <div>{formatDateTime(usage.startTime)}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">至 {formatDateTime(usage.endTime)}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">派车 {formatDateTime(usage.dispatchTime)}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-600 dark:text-slate-300">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{usage.destination || '-'}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{usage.reason || '-'}</div>
                  </TableCell>
                  <TableCell className="align-top text-sm text-slate-600 dark:text-slate-300">
                    <div>起 {renderText(usage.startMileage)} km / 终 {renderText(usage.endMileage)} km</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">单次费用 {formatCurrency(usage.totalExpenseAmount)}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">里程 {usage.tripDistance != null ? `${usage.tripDistance} km` : '-'}</div>
                  </TableCell>
                  <TableCell className="align-top"><UsageStatusBadge status={usage.status || '0'} /></TableCell>
                  <TableCell className="align-top text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { label: '详情', icon: <Eye size={14} />, onClick: () => handleViewDetail(usage), tone: 'neutral' },
                        { label: '审批', icon: <CheckCircle size={14} />, onClick: () => handleOpenApprove(usage), hidden: usage.status !== '0', tone: 'neutral' },
                        { label: '派车', icon: <UserCog size={14} />, onClick: () => handleOpenDispatch(usage), hidden: usage.status !== '1', tone: 'neutral' },
                        { label: '归还', icon: <Send size={14} />, onClick: () => handleOpenReturn(usage), hidden: usage.status !== '3', tone: 'neutral' },
                        { label: '录费', icon: <DollarSign size={14} />, onClick: () => handleOpenExpense(usage), hidden: !['3', '4'].includes(usage.status || ''), tone: 'neutral' },
                        { label: '取消', icon: <Ban size={14} />, onClick: () => openCancelConfirm(usage), hidden: usage.status !== '0', tone: 'neutral' },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const expenseTable = (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">费用明细</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>时间 {expenseDateSummary}</span>
            <span>本月 {formatCurrency(stats?.monthlyAmount)}</span>
            <span>上月 {formatCurrency(stats?.lastMonthAmount)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-slate-400 dark:text-slate-500">已选 {selectedExpenseIds.length} 条</div>
          <Button size="sm" variant="outline" onClick={() => void handleConvertExpenses()} disabled={selectedExpenseIds.length === 0 || actionLoading}>
            转报销
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[1180px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={expenses.length > 0 && selectedExpenseIds.length === expenses.filter((item) => item.expenseId).length}
                  onChange={() => {
                    const pageIds = expenses.map((item) => item.expenseId).filter(Boolean) as number[];
                    setSelectedExpenseIds((prev) => prev.length === pageIds.length ? [] : pageIds);
                  }}
                  className="rounded border-gray-300"
                />
              </TableHead>
              <TableHead>车辆 / 申请</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>日期</TableHead>
              <TableHead>说明</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenseLoading ? (
              <TableStateRow loading colSpan={7} title="正在加载费用记录" />
            ) : expenses.length === 0 ? (
              <TableStateRow colSpan={7} icon={<DollarSign size={20} />} title="暂无费用记录" description="用车进行中或已完成后，可以在记录里补录车辆费用。" />
            ) : (
              expenses.map((expense) => (
                <TableRow key={expense.expenseId}>
                  <TableCell className="align-top">
                    <input
                      type="checkbox"
                      checked={selectedExpenseIds.includes(expense.expenseId || 0)}
                      onChange={() => {
                        if (!expense.expenseId) return;
                        setSelectedExpenseIds((prev) => prev.includes(expense.expenseId!) ? prev.filter((item) => item !== expense.expenseId) : [...prev, expense.expenseId!]);
                      }}
                      className="rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{expense.vehiclePlate || `车辆#${expense.vehicleId}`}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">申请 #{expense.usageId || '-'}</div>
                  </TableCell>
                  <TableCell className="align-top"><ExpenseTypeBadge expenseType={expense.expenseType} /></TableCell>
                  <TableCell className="align-top text-sm font-medium text-slate-900 dark:text-slate-100">{formatCurrency(expense.amount)}</TableCell>
                  <TableCell className="align-top text-sm text-slate-600 dark:text-slate-300">{expense.expenseDate || '-'}</TableCell>
                  <TableCell className="align-top text-sm text-slate-600 dark:text-slate-300">{expense.description || '-'}</TableCell>
                  <TableCell className="align-top text-xs text-slate-500 dark:text-slate-400">{renderText(expense.createTime)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {expenseTypeSummary.length ? (
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          {expenseTypeSummary.map((item) => (
            <div key={item.type} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div className={cn('inline-flex items-center gap-1.5 text-sm font-medium', item.color)}>{item.icon}{item.label}</div>
              <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(item.amount)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-3"
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {activeTab === 'usage' ? (
                <>
                  <span className="font-medium text-slate-900 dark:text-slate-100">共 {usageTotal} 条</span>
                  <span className="text-slate-500 dark:text-slate-400">待审批 {usagePrimaryActions.pending}</span>
                  <span className="text-slate-500 dark:text-slate-400">待派车 {usagePrimaryActions.approved}</span>
                  <span className="text-slate-500 dark:text-slate-400">进行中 {usagePrimaryActions.inUse}</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-900 dark:text-slate-100">总费用 {formatCurrency(stats?.totalAmount)}</span>
                  <span className="text-slate-500 dark:text-slate-400">本月 {formatCurrency(stats?.monthlyAmount)}</span>
                  <span className="text-slate-500 dark:text-slate-400">上月 {formatCurrency(stats?.lastMonthAmount)}</span>
                  <span className="text-slate-500 dark:text-slate-400">共 {expenseTotal} 条</span>
                </>
              )}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshCurrentView()}>
                <RotateCcw size={14} className="mr-1.5" />
                刷新
              </Button>
              <Button size="sm" onClick={() => navigate('/admin/vehicle/booking')}>
                <Plus size={14} className="mr-1.5" />
                新建申请
              </Button>
            </div>
          </div>
        }
        filters={
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <SegmentedControl className="min-h-9">
                  <SegmentedControlItem size="sm" active={activeTab === 'usage'} onClick={() => setActiveTab('usage')}>
                    <Car size={14} className="mr-1.5" />
                    用车记录
                  </SegmentedControlItem>
                  <SegmentedControlItem size="sm" active={activeTab === 'expense'} onClick={() => setActiveTab('expense')}>
                    <DollarSign size={14} className="mr-1.5" />
                    费用明细
                  </SegmentedControlItem>
                </SegmentedControl>

                {activeTab === 'usage' ? (
                  <div className="w-full sm:w-40">
                    <Select value={usageQuery.status || ALL_FILTER_VALUE} onValueChange={(value) => setUsageQuery((prev) => ({ ...prev, pageNum: 1, status: value === ALL_FILTER_VALUE ? '' : value }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
                      <SelectContent>
                        {USAGE_STATUS_OPTIONS.map((item) => (
                          <SelectItem key={item.value || ALL_FILTER_VALUE} value={item.value || ALL_FILTER_VALUE}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="w-full sm:w-40">
                      <Select value={expenseQuery.expenseType || ALL_FILTER_VALUE} onValueChange={(value) => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, expenseType: value === ALL_FILTER_VALUE ? '' : value }))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="全部类型" /></SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPE_OPTIONS.map((item) => (
                            <SelectItem key={item.value || ALL_FILTER_VALUE} value={item.value || ALL_FILTER_VALUE}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="h-10 w-full sm:w-32" placeholder="车辆ID" value={expenseQuery.vehicleId} onChange={(event) => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, vehicleId: event.target.value }))} />
                    <Input className="h-10 w-full sm:w-32" placeholder="申请ID" value={expenseQuery.usageId} onChange={(event) => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, usageId: event.target.value }))} />
                    <DatePicker className="h-10 w-full sm:w-40" type="date" value={expenseQuery.startDate} onChange={(event) => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, startDate: event.target.value }))} />
                    <DatePicker className="h-10 w-full sm:w-40" type="date" value={expenseQuery.endDate} onChange={(event) => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, endDate: event.target.value }))} />
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'usage' && hasUsageFilters ? <Button variant="outline" size="sm" onClick={resetUsageFilters}>清空筛选</Button> : null}
                {activeTab === 'expense' && hasExpenseFilters ? <Button variant="outline" size="sm" onClick={resetExpenseFilters}>清空筛选</Button> : null}
              </div>
            </div>
          </div>
        }
        table={activeTab === 'usage' ? usageTable : expenseTable}
        pagination={activeTab === 'usage'
          ? (usageTotal > 0 ? <Pagination total={usageTotal} page={usageQuery.pageNum} pageSize={usageQuery.pageSize} onPageChange={(page) => setUsageQuery((prev) => ({ ...prev, pageNum: page }))} onPageSizeChange={(pageSize) => setUsageQuery((prev) => ({ ...prev, pageNum: 1, pageSize }))} /> : undefined)
          : expenseTotal > 0 ? <Pagination total={expenseTotal} page={expenseQuery.pageNum} pageSize={expenseQuery.pageSize} onPageChange={(page) => setExpenseQuery((prev) => ({ ...prev, pageNum: page }))} onPageSizeChange={(pageSize) => setExpenseQuery((prev) => ({ ...prev, pageNum: 1, pageSize }))} /> : undefined}
      />

      <BaseDialog
        open={showDetailDialog && Boolean(currentUsage)}
        title="用车详情"
        onClose={() => { setShowDetailDialog(false); setCurrentUsage(null); }}
        width="wide"
        bodyClassName="space-y-4"
        footer={<Button variant="outline" onClick={() => { setShowDetailDialog(false); setCurrentUsage(null); }}>关闭</Button>}
      >
        {currentUsage ? (
          <>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`}</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  申请人 {currentUsage.applicantName || `用户${currentUsage.applicantId}`} / 司机 {currentUsage.driverName || (currentUsage.driverMode === 0 ? '自驾' : '-')}
                </div>
              </div>
              <UsageStatusBadge status={currentUsage.status || '0'} />
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
                <DetailField label="司机模式" value={currentUsage.driverMode === 1 ? '行政派司机' : '自驾'} />
                <DetailField label="派车时间" value={formatDateTime(currentUsage.dispatchTime)} />
                <DetailField label="派车备注" value={renderText(currentUsage.dispatchRemark)} />
                <DetailField label="出发里程" value={currentUsage.startMileage != null ? `${currentUsage.startMileage} km` : '-'} />
                <DetailField label="归还里程" value={currentUsage.endMileage != null ? `${currentUsage.endMileage} km` : '-'} />
                <DetailField label="归还备注" value={renderText(currentUsage.returnRemark)} />
              </DetailSection>
            </div>

            <DetailSection title="费用与执行摘要">
              <DetailField label="单次费用" value={formatCurrency(currentUsage.totalExpenseAmount)} />
              <DetailField label="本次里程" value={currentUsage.tripDistance != null ? `${currentUsage.tripDistance} km` : '-'} />
              <DetailField label="实际出发" value={formatDateTime(currentUsage.actualStartTime)} />
              <DetailField label="实际归还" value={formatDateTime(currentUsage.actualEndTime)} />
            </DetailSection>

            <DetailSection title="用车事由">
              <div className="px-4 py-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{currentUsage.reason || '-'}</div>
            </DetailSection>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showApproveDialog && Boolean(currentUsage)}
        title="审批申请"
        onClose={() => { setShowApproveDialog(false); setCurrentUsage(null); }}
        maxWidthClassName="max-w-2xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowApproveDialog(false); setCurrentUsage(null); }}>取消</Button>
            <Button variant="destructive" onClick={() => void handleApprove(false)} disabled={actionLoading}>驳回</Button>
            <Button onClick={() => void handleApprove(true)} disabled={actionLoading}>批准</Button>
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

            <div className="space-y-2">
              <Label>审批意见</Label>
              <Textarea className="min-h-[120px] resize-none" placeholder="可选" value={approveRemark} onChange={(event) => setApproveRemark(event.target.value)} />
            </div>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showDispatchDialog && Boolean(currentUsage)}
        title="派车"
        onClose={() => { setShowDispatchDialog(false); setCurrentUsage(null); }}
        maxWidthClassName="max-w-2xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowDispatchDialog(false); setCurrentUsage(null); }}>取消</Button>
            <Button onClick={() => void handleDispatch()} disabled={actionLoading}>确认派车</Button>
          </>
        )}
      >
        {currentUsage ? (
          <>
            <DetailSection title="当前申请">
              <DetailField label="车辆" value={currentUsage.vehiclePlate || `车辆#${currentUsage.vehicleId}`} />
              <DetailField label="申请人" value={currentUsage.applicantName || `用户${currentUsage.applicantId}`} />
              <DetailField label="用车时间" value={`${formatDateTime(currentUsage.startTime)} 至 ${formatDateTime(currentUsage.endTime)}`} />
            </DetailSection>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>司机模式</Label>
                <Select value={dispatchForm.driverMode} onValueChange={(value) => setDispatchForm((prev) => ({ ...prev, driverMode: value }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">自驾</SelectItem>
                    <SelectItem value="1">行政派司机</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>实际出发时间</Label>
                <DatePicker type="datetime-local" value={dispatchForm.actualStartTime} onChange={(event) => setDispatchForm((prev) => ({ ...prev, actualStartTime: event.target.value }))} className="h-11" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>司机</Label>
                <UserSelector
                  value={dispatchForm.driverIds}
                  onChange={(driverIds) => setDispatchForm((prev) => ({ ...prev, driverIds }))}
                  onUsersChange={updateDispatchUsers}
                  multiple={false}
                  disabled={dispatchForm.driverMode !== '1'}
                  placeholder="选择司机"
                  dropdownPlacement="top"
                />
              </div>
              <div className="space-y-2">
                <Label>出发里程 (km)</Label>
                <Input type="number" min={0} value={dispatchForm.startMileage || ''} onChange={(event) => setDispatchForm((prev) => ({ ...prev, startMileage: parseFloat(event.target.value) || 0 }))} className="h-11" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>派车备注</Label>
                <Textarea className="min-h-[100px] resize-none" value={dispatchForm.dispatchRemark} onChange={(event) => setDispatchForm((prev) => ({ ...prev, dispatchRemark: event.target.value }))} />
              </div>
            </div>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showReturnDialog && Boolean(currentUsage)}
        title="归还车辆"
        onClose={() => { setShowReturnDialog(false); setCurrentUsage(null); }}
        maxWidthClassName="max-w-xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowReturnDialog(false); setCurrentUsage(null); }}>取消</Button>
            <Button onClick={() => void handleReturn()} disabled={actionLoading}>确认归还</Button>
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
              <Input type="number" min={0} placeholder="请输入当前里程" value={returnMileage || ''} onChange={(event) => setReturnMileage(parseFloat(event.target.value) || 0)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>还车地点</Label>
              <Input value={returnLocation} onChange={(event) => setReturnLocation(event.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>归还备注</Label>
              <Textarea className="min-h-[100px] resize-none" value={returnRemark} onChange={(event) => setReturnRemark(event.target.value)} />
            </div>
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showExpenseDialog && Boolean(currentUsage)}
        title="录入费用"
        onClose={() => { setShowExpenseDialog(false); setCurrentUsage(null); }}
        maxWidthClassName="max-w-xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowExpenseDialog(false); setCurrentUsage(null); }}>取消</Button>
            <Button onClick={() => void handleSubmitExpense()} disabled={actionLoading}>提交</Button>
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
              <Select value={expenseForm.expenseType || '1'} onValueChange={(value) => setExpenseForm((prev) => ({ ...prev, expenseType: value as VehicleExpense['expenseType'] }))}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
                <Input type="number" min={0} step={0.01} placeholder="0.00" value={expenseForm.amount || ''} onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: parseFloat(event.target.value) || 0 }))} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label>日期</Label>
                <DatePicker type="date" value={expenseForm.expenseDate || ''} onChange={(event) => setExpenseForm((prev) => ({ ...prev, expenseDate: event.target.value }))} className="h-11" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>说明</Label>
              <Input placeholder="可选" value={expenseForm.description || ''} onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))} className="h-11" />
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
