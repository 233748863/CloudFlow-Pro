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
  RefreshCw,
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
import BusinessTimeline from '@/components/common/BusinessTimeline';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
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
  Textarea,
} from '@/components/common';
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
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </td>
  </tr>
);

const SummaryMetric: React.FC<SummaryMetricProps> = ({ label, value, tone = 'default' }) => {
  const toneClassName = {
    default: 'border-slate-200 bg-[var(--cf-surface-muted)] text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  }[tone];

  return (
    <div className={`cf-summary-metric ${toneClassName}`}>
      <div className="text-[11px] leading-none text-current opacity-70">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-none">{value}</div>
    </div>
  );
};

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div>
    <span>{label}</span>
    <strong>{value || '-'}</strong>
  </div>
);

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="table-scroll-container admin-inner-table-surface">
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
      </div>
    </div>
    <div className="p-4">{children}</div>
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
    className: 'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    icon: null,
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${config.className}`}>
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
          className={`inline-flex min-w-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 ${compact ? 'max-w-[7rem]' : ''}`}
        >
          <AlertTriangle size={11} />
          <span className={compact ? 'truncate' : ''}>{tag}</span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="rounded-md bg-[var(--cf-surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
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
  const statusLabel = query.status ? (vehicleStatusDict.getLabel(query.status) || '未配置状态') : '全部状态';
  const runtimeInUse = vehicles.filter((item) => (item.runtimeStatus || item.status) === '3').length;
  const runtimeBooked = vehicles.filter((item) => (item.runtimeStatus || item.status) === '2').length;
  const metrics = [
    { label: '车辆总数', value: String(stats?.total ?? total), meta: `当前页 ${vehicles.length}`, icon: <Car size={18} />, tone: 'blue' },
    { label: '使用中', value: String(stats?.inUse ?? runtimeInUse), meta: '实时占用', icon: <Clock size={18} />, tone: 'green' },
    { label: '逾期风险', value: String(stats?.overdueRiskCount ?? 0), meta: '需处理', icon: <ShieldAlert size={18} />, tone: 'amber' },
    { label: '30天费用', value: formatCurrency(stats?.expenseAmount30d), meta: '运营成本', icon: <Wrench size={18} />, tone: 'violet' },
  ];

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">VEHICLE LEDGER</p>
            <h2>车辆管理</h2>
            <span>维护车辆台账、占用状态、预约风险和运营成本</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:vehicle:add')}>
              <Plus size={16} />
              新增车辆
            </Button>
          </div>
        </header>

        <section className="admin-source-stat-grid">
          {metrics.map((metric) => (
            <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
              <div className="admin-source-stat-icon">{metric.icon}</div>
              <div>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                <span>{metric.meta}</span>
              </div>
            </article>
          ))}
        </section>
    </>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar">
          <div className="admin-vehicle-filter-grid">
            <label className="admin-source-search">
              <span className="input-label">车牌号</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  value={searchPlate}
                  onChange={(event) => setSearchPlate(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                  placeholder="搜索车牌号"
                  type="search"
                  className="h-[42px] pl-9"
                />
              </div>
            </label>
            <label>
              <span className="input-label">状态</span>
              <Select value={statusInput || ALL_FILTER_VALUE} onValueChange={(value) => setStatusInput(value === ALL_FILTER_VALUE ? '' : value)}>
                <SelectTrigger className="h-[42px]">
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
            </label>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">{hasActiveFilters ? `${statusLabel} / ${query.licensePlate || '全部车牌'}` : '全部车辆'}</span>
              <Button size="sm" onClick={handleSearch}><Search size={14} />查询</Button>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters}><RotateCcw size={14} />重置</Button>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface
          className="admin-vehicle-table-panel flex min-h-0 flex-1 flex-col"
          wrapperClassName="flex min-h-0 flex-1 flex-col"
        >
            {selectedIds.length > 0 ? (
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center rounded-md bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    已选 {selectedIds.length} 辆
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 justify-start px-2 text-slate-600 hover:bg-[var(--cf-surface-muted)] hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                    onClick={() => openDeleteConfirm(selectedIds, `确认删除选中的 ${selectedIds.length} 辆车？`)}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    批量删除
                  </Button>
                </div>
              </div>
            ) : null}
              <table className="unity-data-table admin-source-table admin-vehicle-table min-w-[1640px] table-fixed">
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
                  <col className="w-44" />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-slate-300 dark:border-slate-700 dark:bg-slate-950" />
                    </th>
                    <th>车牌号</th>
                    <th>车型</th>
                    <th>里程 / 位置</th>
                    <th>状态</th>
                    <th>使用人 / 司机</th>
                    <th>目的地</th>
                    <th>归还 / 预约</th>
                    <th>保险 / 年检</th>
                    <th>30天成本</th>
                    <th>风险</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={12} title="正在加载车辆数据" loading />
                  ) : vehicles.length === 0 ? (
                    <TableStateRow colSpan={12} title="暂无车辆数据" description="新增车辆后，这里会显示实时占用、预约和风险信息。" />
                  ) : (
                    vehicles.map((vehicle) => {
                      const runtimeStatus = vehicle.runtimeStatus || vehicle.status;
                      const currentUsageStatusLabel = vehicle.currentUsageStatus ? usageStatusDict.getLabel(vehicle.currentUsageStatus) : '';
                      return (
                        <tr key={vehicle.vehicleId}>
                          <td>
                            <input type="checkbox"
                              checked={selectedIds.includes(vehicle.vehicleId!)}
                              onChange={() => toggleSelect(vehicle.vehicleId!)}
                              className="rounded border-slate-300 dark:border-slate-700 dark:bg-slate-950"
                            />
                          </td>
                          <td className="font-mono">
                            <div className="truncate" title={vehicle.licensePlate}>{vehicle.licensePlate}</div>
                            <div className="mt-1 truncate text-xs font-normal text-slate-400 dark:text-slate-500" title={vehicle.purchaseDate || '-'}>
                              购置 {vehicle.purchaseDate || '-'}
                            </div>
                          </td>
                          <td>
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={`${vehicle.brand || '-'} / ${vehicle.model || '-'}`}>
                              {[vehicle.brand || '-', vehicle.model || '-'].join(' / ')}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500" title={`${vehicle.color || '-'} / ${vehicle.capacity || 0} 座`}>
                              {[vehicle.color || '-', `${vehicle.capacity || 0} 座`].join(' / ')}
                            </div>
                          </td>
                          <td>
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatMileage(vehicle.mileage)}>
                              {formatMileage(vehicle.mileage)}
                            </div>
                            <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400" title={vehicle.location || '-'}>
                              <MapPin size={12} className="shrink-0 text-slate-400 dark:text-slate-500" />
                              <span className="truncate">{vehicle.location || '-'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="space-y-1.5">
                              <StatusBadge status={runtimeStatus} />
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400" title={`基础 ${vehicleStatusDict.getLabel(vehicle.status || '1') || '-'}`}>
                                基础 {vehicleStatusDict.getLabel(vehicle.status || '1') || '-'}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={vehicle.currentUserName || '-'}>
                                {vehicle.currentUserName || '-'}
                              </span>
                              {currentUsageStatusLabel ? (
                                <span className="shrink-0 rounded-md bg-[var(--cf-surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                                  {currentUsageStatusLabel}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={vehicle.currentDriverName || '-'}>
                              司机 {vehicle.currentDriverName || '-'}
                            </div>
                          </td>
                          <td>
                            <div className="line-clamp-2 min-h-[2.25rem] leading-5" title={vehicle.currentDestination || '-'}>
                              {vehicle.currentDestination || '-'}
                            </div>
                          </td>
                          <td>
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatDateTime(vehicle.plannedReturnTime)}>
                              还 {formatShortDateTime(vehicle.plannedReturnTime)}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={formatDateTime(vehicle.nextBookingStartTime)}>
                              约 {formatShortDateTime(vehicle.nextBookingStartTime)}
                            </div>
                          </td>
                          <td>
                            <div className="truncate" title={vehicle.insuranceExpiry || '-'}>
                              保 {vehicle.insuranceExpiry || '-'}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={vehicle.annualInspectionExpiry || '-'}>
                              检 {vehicle.annualInspectionExpiry || '-'}
                            </div>
                          </td>
                          <td>
                            <div className="truncate font-medium text-slate-900 dark:text-slate-100" title={formatCurrency(vehicle.expenseAmount30d)}>
                              {formatCurrency(vehicle.expenseAmount30d)}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={`保养 ${vehicle.nextMaintenanceMileage != null ? `${vehicle.nextMaintenanceMileage} km` : '-'}`}>
                              保养 {vehicle.nextMaintenanceMileage != null ? `${vehicle.nextMaintenanceMileage} km` : '-'}
                            </div>
                          </td>
                          <td>
                            <div title={vehicle.warningTags || '-'}>
                              <WarningTags value={vehicle.warningTags} compact maxVisible={1} />
                            </div>
                          </td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" title="详情" onClick={() => handleViewDetail(vehicle)}><Eye size={15} /></button>
                              {hasPermission('oa:vehicle:edit') ? <button type="button" title="编辑" onClick={() => handleEdit(vehicle)}><Edit2 size={15} /></button> : null}
                              {hasPermission('oa:vehicle:remove') ? <button type="button" className="danger" title="删除" onClick={() => openDeleteConfirm([vehicle.vehicleId!], '确认删除该车辆？删除后不可恢复。')}><Trash2 size={15} /></button> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                    )}
                </tbody>
              </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
        <Pagination
            total={total}
            page={query.pageNum}
            pageSize={query.pageSize}
            showPageSizeSelector={false}
            showJump={false}
            onPageChange={(page) => setQuery((prev) => ({ ...prev, pageNum: page }))}
            onPageSizeChange={() => {}}
          />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-vehicle-page admin-vehicle-list-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showFormDialog}
        title={currentVehicle ? '编辑车辆' : '新增车辆'}
        onClose={() => {
          setShowFormDialog(false);
          setCurrentVehicle(null);
        }}
        maxWidthClassName="max-w-4xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setShowFormDialog(false); setCurrentVehicle(null); }}>
              取消
            </Button>
            <Button onClick={() => void handleSubmit()}>{currentVehicle ? '保存修改' : '确认新增'}</Button>
          </>
        )}
      >
        <div className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>车牌号</Label>
              <Input value={formData.licensePlate || ''} onChange={(event) => setFormData({ ...formData, licensePlate: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>品牌</Label>
              <Input value={formData.brand || ''} onChange={(event) => setFormData({ ...formData, brand: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>型号</Label>
              <Input value={formData.model || ''} onChange={(event) => setFormData({ ...formData, model: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>颜色</Label>
              <Input value={formData.color || ''} onChange={(event) => setFormData({ ...formData, color: event.target.value })} className="h-11" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>座位数</Label>
              <Input type="number" min={1} max={50} value={formData.capacity || 5} onChange={(event) => setFormData({ ...formData, capacity: parseInt(event.target.value, 10) || 5 })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
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
            <div className="admin-dialog-field">
              <Label>当前里程 (km)</Label>
              <Input type="number" min={0} value={formData.mileage || 0} onChange={(event) => setFormData({ ...formData, mileage: parseFloat(event.target.value) || 0 })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>停放位置</Label>
              <Input value={formData.location || ''} onChange={(event) => setFormData({ ...formData, location: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>购买日期</Label>
              <DatePicker type="date" value={formData.purchaseDate || ''} onChange={(event) => setFormData({ ...formData, purchaseDate: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>保险到期日</Label>
              <DatePicker type="date" value={formData.insuranceExpiry || ''} onChange={(event) => setFormData({ ...formData, insuranceExpiry: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>年检到期日</Label>
              <DatePicker type="date" value={formData.annualInspectionExpiry || ''} onChange={(event) => setFormData({ ...formData, annualInspectionExpiry: event.target.value })} className="h-11" />
            </div>
            <div className="admin-dialog-field">
              <Label>保养周期 (km)</Label>
              <Input type="number" min={0} value={formData.maintenanceCycleKm || 0} onChange={(event) => setFormData({ ...formData, maintenanceCycleKm: parseFloat(event.target.value) || 0 })} className="h-11" />
            </div>
            <div className="admin-dialog-field md:col-span-2">
              <Label>下次保养里程 (km)</Label>
              <Input type="number" min={0} value={formData.nextMaintenanceMileage || 0} onChange={(event) => setFormData({ ...formData, nextMaintenanceMileage: parseFloat(event.target.value) || 0 })} className="h-11" />
            </div>
          </div>

          <div className="admin-dialog-field">
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
        bodyClassName="admin-dialog-stack"
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
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">正在加载运营详情...</div>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <DetailSection title="基础与台账">
                <div className="admin-finance-detail-list">
                  <DetailField label="品牌 / 型号" value={`${renderText(detailVehicle.brand)} / ${renderText(detailVehicle.model)}`} />
                  <DetailField label="颜色 / 座位" value={`${renderText(detailVehicle.color)} / ${detailVehicle.capacity || 0} 座`} />
                  <DetailField label="当前里程" value={`${detailVehicle.mileage?.toLocaleString() || 0} km`} />
                  <DetailField label="停放位置" value={renderText(detailVehicle.location)} />
                  <DetailField label="保险到期" value={renderText(detailVehicle.insuranceExpiry)} />
                  <DetailField label="年检到期" value={renderText(detailVehicle.annualInspectionExpiry)} />
                  <DetailField label="下次保养里程" value={detailVehicle.nextMaintenanceMileage != null ? `${detailVehicle.nextMaintenanceMileage} km` : '-'} />
                </div>
              </DetailSection>

              <DetailSection title="运营摘要">
                <div className="admin-finance-detail-list">
                  <DetailField label="当前使用人" value={renderText(detailProfile?.currentUsage?.applicantName)} />
                  <DetailField label="当前司机" value={renderText(detailProfile?.currentUsage?.driverName)} />
                  <DetailField label="当前目的地" value={renderText(detailProfile?.currentUsage?.destination)} />
                  <DetailField label="预计归还" value={formatDateTime(detailProfile?.currentUsage?.endTime)} />
                  <DetailField label="下一预约" value={formatDateTime(detailProfile?.nextUsage?.startTime)} />
                  <DetailField label="30 天费用" value={formatCurrency(detailProfile?.expenseAmount30d)} />
                  <DetailField label="90 天费用" value={formatCurrency(detailProfile?.expenseAmount90d)} />
                  <DetailField label="30 天单公里成本" value={formatCurrency(detailProfile?.costPerKm30d)} />
                </div>
              </DetailSection>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <DetailSection title="最近用车">
                {(detailProfile?.recentUsages || []).length ? (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
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
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
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
                  <div className="admin-dialog-stack">
                    {detailProfile?.risks.map((risk) => (
                      <div key={risk.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
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
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
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
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
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
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
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
    </>
  );
};

export default VehicleList;
