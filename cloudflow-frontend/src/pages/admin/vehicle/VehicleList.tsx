import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import {
  AlertTriangle,
  Car,
  CheckCircle,
  Clock,
  Edit2,
  Eye,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import BusinessTimeline from '@/components/common/BusinessTimeline';
import { useAuth } from '@/context/AuthContext';
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
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';
import {
  addVehicle,
  deleteVehicle,
  getVehicleList,
  getVehicleProfile,
  getFuelLogList,
  type VehicleFuelLog,
  getVehicleStats,
  SysVehicle,
  updateVehicle,
  VehicleProfile,
  VehicleStats,
} from '@/services/api/vehicle';

interface TableStateRowProps {
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

interface SummaryMetricProps {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger';
}

interface DeleteState {
  ids: number[];
  message: string;
}

const ALL_FILTER_VALUE = '__all__';

const STATUS_CONFIG: Record<string, { className: string; icon: React.ReactNode }> = {
  '1': {
    className: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    icon: <CheckCircle size={14} />,
  },
  '2': {
    className: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    icon: <Clock size={14} />,
  },
  '3': {
    className: 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    icon: <Car size={14} />,
  },
  '4': {
    className: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    icon: <Wrench size={14} />,
  },
  '5': {
    className: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    icon: <XCircle size={14} />,
  },
};

const STATUS_FILTER_VALUES = ['1', '2', '3', '4', '5'];
const FORM_STATUS_VALUES = ['1', '4', '5'];

const TableStateRow: React.FC<TableStateRowProps> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </TableCell>
  </TableRow>
);

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, tone = 'default' }) => {
  const toneClassName = {
    default: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  }[tone];

  return (
    <div className={`min-w-[7rem] rounded-lg border px-3 py-2 ${toneClassName}`}>
      <div className="text-[11px] leading-none text-current opacity-70">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-none">{value}</div>
    </div>
  );
};

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

const createVehicleForm = (): Partial<SysVehicle> => ({
  licensePlate: '',
  brand: '',
  model: '',
  color: '',
  capacity: 5,
  status: '1',
  mileage: 0,
  location: '',
  purchaseDate: '',
  insuranceExpiry: '',
  annualInspectionExpiry: '',
  maintenanceCycleKm: 5000,
  nextMaintenanceMileage: 0,
  remark: '',
});

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusDict = useDict('oa_vehicle_status');
  const config = STATUS_CONFIG[status] || {
    className: 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: null,
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}>
      {config.icon}
      {statusDict.getLabel(status) || '未知'}
    </span>
  );
};

const renderText = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
};

const formatCurrency = (value?: number | null) => `¥ ${Number(value || 0).toLocaleString()}`;
const formatDateTime = (value?: string | null) => (value ? value.replace('T', ' ').slice(0, 19) : '-');
const formatShortDateTime = (value?: string | null) => (value ? value.replace('T', ' ').slice(5, 16) : '-');
const formatMileage = (value?: number | null) => `${Number(value || 0).toLocaleString()} km`;

const WarningTags: React.FC<{ value?: string; compact?: boolean; maxVisible?: number }> = ({ value, compact = false, maxVisible }) => {
  const tags = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (tags.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500">-</span>;
  }
  const visibleTags = typeof maxVisible === 'number' ? tags.slice(0, maxVisible) : tags;
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className={compact ? 'flex min-w-0 items-center gap-1' : 'flex flex-wrap gap-1'}>
      {visibleTags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex min-w-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 ${compact ? 'max-w-[7rem]' : ''}`}
        >
          <AlertTriangle size={11} />
          <span className={compact ? 'truncate' : ''}>{tag}</span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
};

const VehicleList: React.FC = () => {
  const { hasPermission } = useAuth();
  const vehicleStatusDict = useDict('oa_vehicle_status');
  const usageStatusDict = useDict('oa_vehicle_usage_status');
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailProfile, setDetailProfile] = useState<VehicleProfile | null>(null);
  const [detailFuelLogs, setDetailFuelLogs] = useState<VehicleFuelLog[]>([]);
  const [query, setQuery] = useState({
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    licensePlate: '',
    status: '',
  });
  const [searchPlate, setSearchPlate] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<SysVehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<SysVehicle | null>(null);
  const [formData, setFormData] = useState<Partial<SysVehicle>>(createVehicleForm);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const res = await getVehicleList(query);
      setVehicles(res.rows || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载车辆列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStats(await getVehicleStats());
    } catch {
      setStats(null);
    }
  };

  const fetchVehicleProfile = async (vehicleId: number) => {
    setDetailLoading(true);
    try {
      setDetailProfile(await getVehicleProfile(vehicleId));
      try {
        const fuelPage = await getFuelLogList({ vehicleId, pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
        setDetailFuelLogs(Array.isArray(fuelPage?.records) ? fuelPage.records : []);
      } catch {
        setDetailFuelLogs([]);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '加载车辆运营详情失败'));
      setDetailProfile(null);
      setDetailFuelLogs([]);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void fetchVehicles();
  }, [query.pageNum, query.pageSize, query.licensePlate, query.status]);

  useEffect(() => {
    void fetchStats();
  }, []);

  useEffect(() => {
    if (!showDetailDialog || !detailVehicle?.vehicleId) {
      setDetailProfile(null);
      return;
    }
    void fetchVehicleProfile(detailVehicle.vehicleId);
  }, [showDetailDialog, detailVehicle?.vehicleId]);

  const refreshPage = async () => {
    await Promise.all([fetchVehicles(), fetchStats()]);
    if (showDetailDialog && detailVehicle?.vehicleId) {
      await fetchVehicleProfile(detailVehicle.vehicleId);
    }
  };

  const handleSearch = () => {
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      licensePlate: searchPlate.trim(),
      status: statusInput,
    }));
  };

  const handleReset = () => {
    setSearchPlate('');
    setStatusInput('');
    setQuery({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), licensePlate: '', status: '' });
  };

  const handleAdd = () => {
    setCurrentVehicle(null);
    setFormData(createVehicleForm());
    setShowFormDialog(true);
  };

  const handleEdit = (vehicle: SysVehicle) => {
    setCurrentVehicle(vehicle);
    setFormData({ ...vehicle });
    setShowFormDialog(true);
  };

  const handleViewDetail = (vehicle: SysVehicle) => {
    setDetailVehicle(vehicle);
    setShowDetailDialog(true);
  };

  const openDeleteConfirm = (ids: number[], message: string) => {
    if (ids.length === 0) return;
    setDeleteState({ ids, message });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteState) return;
    const currentDeleteState = deleteState;
    setDeleteState(null);
    try {
      await deleteVehicle(currentDeleteState.ids);
      toast.success(currentDeleteState.ids.length > 1 ? '批量删除成功' : '删除成功');
      await refreshPage();
    } catch (error) {
      toast.error(getErrorMessage(error, currentDeleteState.ids.length > 1 ? '批量删除失败' : '删除失败'));
    }
  };

  const handleSubmit = async () => {
    if (!formData.licensePlate?.trim()) {
      toast.error('请输入车牌号');
      return;
    }
    if (!formData.brand?.trim()) {
      toast.error('请输入品牌');
      return;
    }

    try {
      if (currentVehicle?.vehicleId) {
        await updateVehicle(formData as SysVehicle);
        toast.success('更新成功');
      } else {
        await addVehicle(formData as SysVehicle);
        toast.success('新增成功');
      }
      setShowFormDialog(false);
      setCurrentVehicle(null);
      setFormData(createVehicleForm());
      await refreshPage();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存车辆失败'));
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === vehicles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(vehicles.map((item) => item.vehicleId!).filter(Boolean));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const allSelected = vehicles.length > 0 && selectedIds.length === vehicles.length;
  const hasActiveFilters = Boolean(query.licensePlate || query.status);
  const statusLabel = query.status ? (vehicleStatusDict.getLabel(query.status) || '全部状态') : '全部状态';
  const runtimeInUse = vehicles.filter((item) => (item.runtimeStatus || item.status) === '3').length;
  const runtimeBooked = vehicles.filter((item) => (item.runtimeStatus || item.status) === '2').length;

  return (
    <div className="space-y-4">
      <TablePageLayout
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-2">
              <SummaryMetric label="车辆总数" value={stats?.total ?? total} />
              <SummaryMetric label="使用中" value={stats?.inUse ?? runtimeInUse} />
              <SummaryMetric label="已预约" value={stats?.booked ?? runtimeBooked} />
              <SummaryMetric label="逾期风险" value={stats?.overdueRiskCount ?? 0} tone={(stats?.overdueRiskCount ?? 0) > 0 ? 'danger' : 'default'} />
              <SummaryMetric label="维保到期" value={stats?.maintenanceDueSoon ?? 0} tone={(stats?.maintenanceDueSoon ?? 0) > 0 ? 'warning' : 'default'} />
              <SummaryMetric label="保险到期" value={stats?.insuranceExpiringSoon ?? 0} tone={(stats?.insuranceExpiringSoon ?? 0) > 0 ? 'warning' : 'default'} />
              <SummaryMetric label="30天费用" value={formatCurrency(stats?.expenseAmount30d)} />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:vehicle:add')}>
                <Plus size={14} className="mr-1.5" />
                新增车辆
              </Button>
            </div>
          </div>
        )}
        className="gap-3"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  placeholder="搜索车牌号"
                  value={searchPlate}
                  onChange={(event) => setSearchPlate(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                  className="h-10 pl-10"
                />
              </div>
              <div className="w-full sm:w-[170px]">
                <Select value={statusInput || ALL_FILTER_VALUE} onValueChange={(value) => setStatusInput(value === ALL_FILTER_VALUE ? '' : value)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
                    {STATUS_FILTER_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {vehicleStatusDict.getLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {hasActiveFilters ? `${statusLabel} / ${query.licensePlate || '全部车牌'}` : '全部车辆'}
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search size={14} className="mr-1.5" />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} className="mr-1.5" />
                清空筛选
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="flex min-h-[40rem] flex-col">
            {selectedIds.length > 0 ? (
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    已选 {selectedIds.length} 辆
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 justify-start px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                    onClick={() => openDeleteConfirm(selectedIds, `确认删除选中的 ${selectedIds.length} 辆车？`)}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    批量删除
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table disableScrollWrapper className="min-w-[1556px] table-auto">
                <colgroup>
                  <col className="w-11" />
                  <col className="w-32" />
                  <col className="w-[10.5rem]" />
                  <col className="w-[8.25rem]" />
                  <col className="w-[7.25rem]" />
                  <col className="w-[8.75rem]" />
                  <col className="w-[10.5rem]" />
                  <col className="w-40" />
                  <col className="w-[9.25rem]" />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col className="w-32" />
                  </colgroup>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="px-3 py-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-gray-300" />
                    </TableHead>
                    <TableHead className="px-3 py-3">车牌号</TableHead>
                    <TableHead className="px-3 py-3">车型</TableHead>
                    <TableHead className="px-3 py-3">里程 / 位置</TableHead>
                    <TableHead className="px-3 py-3">状态</TableHead>
                    <TableHead className="px-3 py-3">使用人 / 司机</TableHead>
                    <TableHead className="px-3 py-3">目的地</TableHead>
                    <TableHead className="px-3 py-3">归还 / 预约</TableHead>
                    <TableHead className="px-3 py-3">保险 / 年检</TableHead>
                    <TableHead className="px-3 py-3">30天成本</TableHead>
                    <TableHead className="px-3 py-3">风险</TableHead>
                    <TableHead className="px-2 py-3 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={12} title="正在加载车辆数据" loading />
                  ) : vehicles.length === 0 ? (
                    <TableStateRow colSpan={12} title="暂无车辆数据" description="新增车辆后，这里会显示实时占用、预约和风险信息。" />
                  ) : (
                    vehicles.map((vehicle) => {
                      const runtimeStatus = vehicle.runtimeStatus || vehicle.status;
                      const currentUsageStatusLabel = vehicle.currentUsageStatus ? usageStatusDict.getLabel(vehicle.currentUsageStatus) : '';
                      return (
                        <TableRow key={vehicle.vehicleId} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <TableCell className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(vehicle.vehicleId!)}
                              onChange={() => toggleSelect(vehicle.vehicleId!)}
                              className="rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2.5 font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                            <div className="truncate" title={vehicle.licensePlate}>{vehicle.licensePlate}</div>
                            <div className="mt-1 truncate text-xs font-normal text-slate-400 dark:text-slate-500" title={vehicle.purchaseDate || '-'}>
                              购置 {vehicle.purchaseDate || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={`${vehicle.brand || '-'} / ${vehicle.model || '-'}`}>
                              {[vehicle.brand || '-', vehicle.model || '-'].join(' / ')}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500" title={`${vehicle.color || '-'} / ${vehicle.capacity || 0} 座`}>
                              {[vehicle.color || '-', `${vehicle.capacity || 0} 座`].join(' / ')}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatMileage(vehicle.mileage)}>
                              {formatMileage(vehicle.mileage)}
                            </div>
                            <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400" title={vehicle.location || '-'}>
                              <MapPin size={12} className="shrink-0 text-slate-400 dark:text-slate-500" />
                              <span className="truncate">{vehicle.location || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5">
                            <div className="space-y-1.5">
                              <StatusBadge status={runtimeStatus} />
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400" title={`基础 ${vehicleStatusDict.getLabel(vehicle.status || '1') || '-'}`}>
                                基础 {vehicleStatusDict.getLabel(vehicle.status || '1') || '-'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={vehicle.currentUserName || '-'}>
                                {vehicle.currentUserName || '-'}
                              </span>
                              {currentUsageStatusLabel ? (
                                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                  {currentUsageStatusLabel}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={vehicle.currentDriverName || '-'}>
                              司机 {vehicle.currentDriverName || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="line-clamp-2 min-h-[2.25rem] leading-5" title={vehicle.currentDestination || '-'}>
                              {vehicle.currentDestination || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatDateTime(vehicle.plannedReturnTime)}>
                              还 {formatShortDateTime(vehicle.plannedReturnTime)}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={formatDateTime(vehicle.nextBookingStartTime)}>
                              约 {formatShortDateTime(vehicle.nextBookingStartTime)}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                            <div className="truncate" title={vehicle.insuranceExpiry || '-'}>
                              保 {vehicle.insuranceExpiry || '-'}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={vehicle.annualInspectionExpiry || '-'}>
                              检 {vehicle.annualInspectionExpiry || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm">
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatCurrency(vehicle.expenseAmount30d)}>
                              {formatCurrency(vehicle.expenseAmount30d)}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={`保养 ${vehicle.nextMaintenanceMileage != null ? `${vehicle.nextMaintenanceMileage} km` : '-'}`}>
                              保养 {vehicle.nextMaintenanceMileage != null ? `${vehicle.nextMaintenanceMileage} km` : '-'}
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-2.5 text-sm">
                            <div title={vehicle.warningTags || '-'}>
                              <WarningTags value={vehicle.warningTags} compact maxVisible={1} />
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-2.5 text-right">
                            <TableRowActions
                              align="end"
                              maxVisibleActions={1}
                              overflowLabel="更多"
                              buttonLayout="compact"
                              actions={[
                                { label: '详情', icon: <Eye size={14} />, onClick: () => handleViewDetail(vehicle), tone: 'neutral', isPrimary: true },
                                { label: '编辑', icon: <Edit2 size={14} />, onClick: () => handleEdit(vehicle), tone: 'neutral', menuOnly: true, permissionKey: 'oa:vehicle:edit' },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => openDeleteConfirm([vehicle.vehicleId!], '确认删除该车辆？删除后不可恢复。'),
                                  tone: 'neutral',
                                  menuOnly: true,
                                  permissionKey: 'oa:vehicle:remove',
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                    )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination
            total={total}
            page={query.pageNum}
            pageSize={query.pageSize}
            showPageSizeSelector={false}
            showJump={false}
            onPageChange={(page) => setQuery((prev) => ({ ...prev, pageNum: page }))}
            onPageSizeChange={() => {}}
          />
        ) : null}
      />

      <BaseDialog
        open={showFormDialog}
        title={currentVehicle ? '编辑车辆' : '新增车辆'}
        onClose={() => {
          setShowFormDialog(false);
          setCurrentVehicle(null);
        }}
        maxWidthClassName="max-w-4xl"
        bodyClassName="space-y-5"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowFormDialog(false); setCurrentVehicle(null); }}>
              取消
            </Button>
            <Button onClick={() => void handleSubmit()}>{currentVehicle ? '保存修改' : '确认新增'}</Button>
          </>
        )}
      >
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>车牌号</Label>
              <Input value={formData.licensePlate || ''} onChange={(event) => setFormData({ ...formData, licensePlate: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>品牌</Label>
              <Input value={formData.brand || ''} onChange={(event) => setFormData({ ...formData, brand: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>型号</Label>
              <Input value={formData.model || ''} onChange={(event) => setFormData({ ...formData, model: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>颜色</Label>
              <Input value={formData.color || ''} onChange={(event) => setFormData({ ...formData, color: event.target.value })} className="h-11" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>座位数</Label>
              <Input type="number" min={1} max={50} value={formData.capacity || 5} onChange={(event) => setFormData({ ...formData, capacity: parseInt(event.target.value, 10) || 5 })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={formData.status || '1'} onValueChange={(value) => setFormData({ ...formData, status: value as SysVehicle['status'] })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_STATUS_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>{vehicleStatusDict.getLabel(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>当前里程 (km)</Label>
              <Input type="number" min={0} value={formData.mileage || 0} onChange={(event) => setFormData({ ...formData, mileage: parseFloat(event.target.value) || 0 })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>停放位置</Label>
              <Input value={formData.location || ''} onChange={(event) => setFormData({ ...formData, location: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>购买日期</Label>
              <DatePicker type="date" value={formData.purchaseDate || ''} onChange={(event) => setFormData({ ...formData, purchaseDate: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>保险到期日</Label>
              <DatePicker type="date" value={formData.insuranceExpiry || ''} onChange={(event) => setFormData({ ...formData, insuranceExpiry: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>年检到期日</Label>
              <DatePicker type="date" value={formData.annualInspectionExpiry || ''} onChange={(event) => setFormData({ ...formData, annualInspectionExpiry: event.target.value })} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>保养周期 (km)</Label>
              <Input type="number" min={0} value={formData.maintenanceCycleKm || 0} onChange={(event) => setFormData({ ...formData, maintenanceCycleKm: parseFloat(event.target.value) || 0 })} className="h-11" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>下次保养里程 (km)</Label>
              <Input type="number" min={0} value={formData.nextMaintenanceMileage || 0} onChange={(event) => setFormData({ ...formData, nextMaintenanceMileage: parseFloat(event.target.value) || 0 })} className="h-11" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea className="min-h-[120px] resize-none" value={formData.remark || ''} onChange={(event) => setFormData({ ...formData, remark: event.target.value })} />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showDetailDialog && Boolean(detailVehicle)}
        title={detailVehicle?.licensePlate || '车辆详情'}
        onClose={() => setShowDetailDialog(false)}
        maxWidthClassName="max-w-5xl"
        headerAside={detailVehicle ? <StatusBadge status={detailVehicle.runtimeStatus || detailVehicle.status} /> : null}
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>关闭</Button>
            <Button
              onClick={() => {
                if (!detailVehicle) return;
                setShowDetailDialog(false);
                handleEdit(detailVehicle);
              }}
            >
              编辑
            </Button>
          </>
        )}
      >
        {!detailVehicle ? null : detailLoading ? (
          <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">正在加载运营详情...</div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <DetailSection title="基础与台账">
                <DetailField label="品牌 / 型号" value={`${renderText(detailVehicle.brand)} / ${renderText(detailVehicle.model)}`} />
                <DetailField label="颜色 / 座位" value={`${renderText(detailVehicle.color)} / ${detailVehicle.capacity || 0} 座`} />
                <DetailField label="当前里程" value={`${detailVehicle.mileage?.toLocaleString() || 0} km`} />
                <DetailField label="停放位置" value={renderText(detailVehicle.location)} />
                <DetailField label="保险到期" value={renderText(detailVehicle.insuranceExpiry)} />
                <DetailField label="年检到期" value={renderText(detailVehicle.annualInspectionExpiry)} />
                <DetailField label="下次保养里程" value={detailVehicle.nextMaintenanceMileage != null ? `${detailVehicle.nextMaintenanceMileage} km` : '-'} />
              </DetailSection>

              <DetailSection title="运营摘要">
                <DetailField label="当前使用人" value={renderText(detailProfile?.currentUsage?.applicantName)} />
                <DetailField label="当前司机" value={renderText(detailProfile?.currentUsage?.driverName)} />
                <DetailField label="当前目的地" value={renderText(detailProfile?.currentUsage?.destination)} />
                <DetailField label="预计归还" value={formatDateTime(detailProfile?.currentUsage?.endTime)} />
                <DetailField label="下一预约" value={formatDateTime(detailProfile?.nextUsage?.startTime)} />
                <DetailField label="30 天费用" value={formatCurrency(detailProfile?.expenseAmount30d)} />
                <DetailField label="90 天费用" value={formatCurrency(detailProfile?.expenseAmount90d)} />
                <DetailField label="30 天单公里成本" value={formatCurrency(detailProfile?.costPerKm30d)} />
              </DetailSection>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <DetailSection title="最近用车">
                {(detailProfile?.recentUsages || []).length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailProfile?.recentUsages.map((item) => (
                      <div key={item.usageId} className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.applicantName || `用户${item.applicantId}`}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(item.startTime)} 至 {formatDateTime(item.endTime)}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.destination || '-'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">暂无记录</div>
                )}
              </DetailSection>

              <DetailSection title="最近费用">
                {(detailProfile?.recentExpenses || []).length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailProfile?.recentExpenses.map((item) => (
                      <div key={item.expenseId} className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(item.amount)}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.expenseDate || '-'} · {item.description || '车辆费用'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">暂无费用</div>
                )}
              </DetailSection>

              <DetailSection title="风险与预警">
                {(detailProfile?.risks || []).length ? (
                  <div className="space-y-2 px-4 py-3">
                    {detailProfile?.risks.map((risk) => (
                      <div key={risk.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <div className="flex items-center gap-2 font-medium">
                          <ShieldAlert size={14} />
                          {risk.riskName}
                        </div>
                        <div className="mt-1 text-xs opacity-80">{risk.riskLevel} / {risk.riskStatus} / {formatDateTime(risk.detectedTime)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">暂无风险</div>
                )}
              </DetailSection>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <DetailSection title="维保摘要">
                {(detailProfile?.maintenances || []).length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailProfile?.maintenances.map((item) => (
                      <div key={item.maintenanceId} className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.maintenanceDate || '-'} · {item.status || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description || '-'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">暂无维保记录</div>
                )}
              </DetailSection>

              <DetailSection title="违章摘要">
                {(detailProfile?.violations || []).length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {detailProfile?.violations.map((item) => (
                      <div key={item.violationId} className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.violationReason}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(item.violationTime)} · 罚款 {formatCurrency(item.penaltyAmount)} · 扣分 {item.points || 0}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.status || '-'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">暂无违章记录</div>
                )}
              </DetailSection>
            </div>

            <DetailSection title="油耗记录 (最近 10 笔)">
              {detailFuelLogs.length ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailFuelLogs.map((item) => (
                    <div key={item.fuelLogId} className="grid grid-cols-2 gap-2 px-4 py-3 text-sm sm:grid-cols-5">
                      <div>
                        <div className="text-xs text-slate-400">日期</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{item.fuelDate}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">加油量 / 单价</div>
                        <div className="font-mono text-xs text-slate-700 dark:text-slate-200">
                          {item.liters} L · ¥{item.unitPrice}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">总额</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(Number(item.totalAmount))}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">行驶里程</div>
                        <div className="text-xs text-slate-700 dark:text-slate-200">{item.driveDistance ?? '-'} km</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">百公里油耗</div>
                        <div className="font-medium text-emerald-600 dark:text-emerald-300">
                          {item.fuelPer100km != null ? `${item.fuelPer100km} L` : '-'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">暂无油耗记录</div>
              )}
            </DetailSection>

            {detailVehicle.remark ? (
              <DetailSection title="备注">
                <div className="px-4 py-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{detailVehicle.remark}</div>
              </DetailSection>
            ) : null}

            <BusinessTimeline businessType="VEHICLE" businessId={detailVehicle.vehicleId} />
          </>
        )}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteState)}
        title="删除车辆"
        message={deleteState?.message || ''}
        confirmText="删除"
        danger
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteState(null)}
      />
    </div>
  );
};

export default VehicleList;

