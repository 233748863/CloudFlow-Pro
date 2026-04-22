import React, { useEffect, useMemo, useState } from 'react';
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
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
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
  addVehicle,
  deleteVehicle,
  getVehicleList,
  getVehicleStats,
  SysVehicle,
  updateVehicle,
  VehicleStats,
} from '@/services/api/vehicle';

interface InlineStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

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

interface DeleteState {
  ids: number[];
  message: string;
}

const ALL_FILTER_VALUE = '__all__';

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  '1': {
    label: '可用',
    className: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    icon: <CheckCircle size={14} />,
  },
  '2': {
    label: '已预约',
    className: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    icon: <Clock size={14} />,
  },
  '3': {
    label: '使用中',
    className: 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200',
    icon: <Car size={14} />,
  },
  '4': {
    label: '维修中',
    className: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    icon: <Wrench size={14} />,
  },
  '5': {
    label: '已报废',
    className: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    icon: <XCircle size={14} />,
  },
};

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: '1', label: '可用' },
  { value: '2', label: '已预约' },
  { value: '3', label: '使用中' },
  { value: '4', label: '维修中' },
  { value: '5', label: '已报废' },
];

const InlineState: React.FC<InlineStateProps> = ({
  title,
  description,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Car className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

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
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : icon || <Car className="h-4 w-4" />}
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
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
    <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
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
  remark: '',
});

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = STATUS_CONFIG[status] || {
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

const VehicleList: React.FC = () => {
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({
    pageNum: 1,
    pageSize: 10,
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
      const res = await getVehicleStats();
      setStats(res);
    } catch {
      setStats(null);
    }
  };

  useEffect(() => {
    void fetchVehicles();
  }, [query.pageNum, query.pageSize, query.licensePlate, query.status]);

  useEffect(() => {
    void fetchStats();
  }, []);

  const refreshPage = async () => {
    await Promise.all([fetchVehicles(), fetchStats()]);
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
    setQuery({ pageNum: 1, pageSize: 10, licensePlate: '', status: '' });
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
    if (ids.length === 0) {
      return;
    }
    setDeleteState({ ids, message });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteState) {
      return;
    }

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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const allSelected = vehicles.length > 0 && selectedIds.length === vehicles.length;

  const isInsuranceExpiring = (date?: string) => {
    if (!date) return false;
    const expiry = new Date(date);
    const now = new Date();
    const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  };

  const expiringCount = useMemo(
    () => vehicles.filter((vehicle) => isInsuranceExpiring(vehicle.insuranceExpiry)).length,
    [vehicles],
  );
  const hasActiveFilters = Boolean(query.licensePlate || query.status);
  const statusLabel = STATUS_OPTIONS.find((item) => item.value === query.status)?.label || '全部状态';

  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Car className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Vehicles
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          车辆管理
        </h1>
      </div>

      <TablePageLayout
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">共 {stats?.total ?? total} 条</span>
              <span className="text-slate-500 dark:text-slate-400">可用 {stats?.available ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">已预约 {stats?.booked ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">使用中 {stats?.inUse ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">维修中 {stats?.maintenance ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">预警 {stats?.insuranceExpiringSoon ?? expiringCount}</span>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus size={14} className="mr-1.5" />
                新增车辆
              </Button>
            </div>
          </div>
        )}
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  placeholder="搜索车牌号"
                  value={searchPlate}
                  onChange={(event) => setSearchPlate(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearch();
                    }
                  }}
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
                    {STATUS_OPTIONS.filter((item) => item.value).map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
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
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">车辆列表</div>
                  {hasActiveFilters ? (
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {statusLabel} / {query.licensePlate || '全部车牌'}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  共 {total} 条
                </div>
              </div>
            </div>

            <div className="px-4 pt-4">
              {selectedIds.length > 0 ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  <span>已选中 {selectedIds.length} 辆车辆</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start px-0 text-rose-600 hover:bg-transparent hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                    onClick={() => openDeleteConfirm(selectedIds, `确认删除选中的 ${selectedIds.length} 辆车？`)}
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    批量删除
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1040px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">车牌号</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">车辆信息</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">里程 / 位置</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">保险到期</TableHead>
                    <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载车辆数据" loading />
                  ) : vehicles.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      title="暂无车辆数据"
                    />
                  ) : (
                    vehicles.map((vehicle) => (
                      <TableRow
                        key={vehicle.vehicleId}
                        className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
                      >
                        <TableCell className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(vehicle.vehicleId!)}
                            onChange={() => toggleSelect(vehicle.vehicleId!)}
                            className="rounded border-gray-300"
                          />
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm font-mono font-medium text-slate-900 dark:text-slate-100">
                          <div>{vehicle.licensePlate}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{vehicle.purchaseDate || '-'}</div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {[vehicle.brand || '-', vehicle.model || '-'].join(' / ')}
                          </div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {[vehicle.color || '-', `${vehicle.capacity} 座`].join(' / ')}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <StatusBadge status={vehicle.status} />
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {vehicle.mileage?.toLocaleString() || 0} km
                          </div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {vehicle.location ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={12} className="text-slate-400 dark:text-slate-500" />
                                {vehicle.location}
                              </span>
                            ) : (
                              '-'
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          {vehicle.insuranceExpiry ? (
                            <span className={isInsuranceExpiring(vehicle.insuranceExpiry) ? 'font-medium text-amber-600 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}>
                              {isInsuranceExpiring(vehicle.insuranceExpiry) ? (
                                <AlertTriangle size={12} className="mr-1 inline" />
                              ) : null}
                              {vehicle.insuranceExpiry}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            iconOnly
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => handleViewDetail(vehicle),
                                tone: 'neutral',
                                className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                              },
                              {
                                label: '编辑',
                                icon: <Edit2 size={14} />,
                                onClick: () => handleEdit(vehicle),
                                tone: 'primary',
                                className: 'rounded-lg',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm([vehicle.vehicleId!], '确认删除该车辆？删除后不可恢复。'),
                                tone: 'danger',
                                className: 'rounded-lg',
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
          </div>
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={query.pageNum}
              pageSize={query.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) =>
                setQuery((prev) => ({
                  ...prev,
                  pageNum: page,
                }))
              }
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showFormDialog}
        title={currentVehicle ? '编辑车辆' : '新增车辆'}
        onClose={() => {
          setShowFormDialog(false);
          setCurrentVehicle(null);
        }}
        maxWidthClassName="max-w-3xl"
        bodyClassName="space-y-5"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowFormDialog(false);
                setCurrentVehicle(null);
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleSubmit()}>
              {currentVehicle ? '保存修改' : '确认新增'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>车牌号</Label>
              <Input
                placeholder="如：京A12345"
                value={formData.licensePlate || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    licensePlate: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>品牌</Label>
              <Input
                placeholder="如：丰田"
                value={formData.brand || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    brand: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>型号</Label>
              <Input
                placeholder="如：凯美瑞"
                value={formData.model || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    model: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>颜色</Label>
              <Input
                placeholder="如：白色"
                value={formData.color || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    color: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>座位数</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={formData.capacity || 5}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    capacity: parseInt(event.target.value, 10) || 5,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={formData.status || '1'}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as SysVehicle['status'] })
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">可用</SelectItem>
                  <SelectItem value="4">维修中</SelectItem>
                  <SelectItem value="5">已报废</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>当前里程 (km)</Label>
              <Input
                type="number"
                min={0}
                value={formData.mileage || 0}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    mileage: parseFloat(event.target.value) || 0,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>停放位置</Label>
              <Input
                placeholder="如：B1停车场A区"
                value={formData.location || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    location: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>购买日期</Label>
              <DatePicker
                type="date"
                value={formData.purchaseDate || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    purchaseDate: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>保险到期日</Label>
              <DatePicker
                type="date"
                value={formData.insuranceExpiry || ''}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    insuranceExpiry: event.target.value,
                  })
                }
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea
              className="min-h-[120px] resize-none"
              placeholder="其他备注信息"
              value={formData.remark || ''}
              onChange={(event) =>
                setFormData({ ...formData, remark: event.target.value })
              }
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={showDetailDialog && Boolean(detailVehicle)}
        title="车辆详情"
        onClose={() => setShowDetailDialog(false)}
        maxWidthClassName="max-w-2xl"
        bodyClassName="space-y-4"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
              关闭
            </Button>
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
        {detailVehicle ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Car size={22} />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {detailVehicle.licensePlate}
                </div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {detailVehicle.brand} {detailVehicle.model || ''}
                </div>
              </div>
              <div className="ml-auto">
                <StatusBadge status={detailVehicle.status} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="颜色" value={renderDetailValue(detailVehicle.color)} />
              <DetailField label="座位数" value={`${detailVehicle.capacity} 座`} />
              <DetailField label="当前里程" value={`${detailVehicle.mileage?.toLocaleString() || 0} km`} />
              <DetailField label="停放位置" value={renderDetailValue(detailVehicle.location)} />
              <DetailField label="购买日期" value={renderDetailValue(detailVehicle.purchaseDate)} />
              <DetailField
                label="保险到期"
                value={
                  detailVehicle.insuranceExpiry
                    ? `${detailVehicle.insuranceExpiry}${isInsuranceExpiring(detailVehicle.insuranceExpiry) ? ' · 即将到期' : ''}`
                    : '-'
                }
              />
              <DetailField label="创建时间" value={renderDetailValue(detailVehicle.createTime)} />
              <DetailField label="更新时间" value={renderDetailValue(detailVehicle.updateTime)} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">备注</div>
              <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailVehicle.remark || '无'}
              </div>
            </div>
          </>
        ) : null}
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
