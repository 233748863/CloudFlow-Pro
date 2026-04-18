import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
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
  TableHead,
  TableActionHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";
import { TableRowActions } from "@/components/ui/table-row-actions";
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspacePageContent,
  WorkspaceTableStateRow,
} from "@/components/workspace/WorkspacePrimitives";
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";
import {
  addVehicle,
  deleteVehicle,
  getVehicleList,
  getVehicleStats,
  SysVehicle,
  updateVehicle,
  VehicleStats,
} from "@/services/api/vehicle";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  "1": {
    label: "可用",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200",
    icon: <CheckCircle size={14} />,
  },
  "2": {
    label: "已预约",
    color: "text-pink-600",
    bg: "bg-pink-50 border-pink-100",
    icon: <Clock size={14} />,
  },
  "3": {
    label: "使用中",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
    icon: <Car size={14} />,
  },
  "4": {
    label: "维修中",
    color: "text-yellow-700",
    bg: "bg-yellow-50 border-yellow-200",
    icon: <Wrench size={14} />,
  },
  "5": {
    label: "已报废",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: <XCircle size={14} />,
  },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "1", label: "可用" },
  { value: "2", label: "已预约" },
  { value: "3", label: "使用中" },
  { value: "4", label: "维修中" },
  { value: "5", label: "已报废" },
];

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = STATUS_CONFIG[status] || {
    label: "未知",
    color: "text-gray-700",
    bg: "bg-gray-50 border-gray-200",
    icon: null,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${config.bg} ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

const createVehicleForm = (): Partial<SysVehicle> => ({
  licensePlate: "",
  brand: "",
  model: "",
  color: "",
  capacity: 5,
  status: "1",
  mileage: 0,
  location: "",
  purchaseDate: "",
  insuranceExpiry: "",
  remark: "",
});

const VehicleList: React.FC = () => {
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({
    pageNum: 1,
    pageSize: 10,
    licensePlate: "",
    status: "",
  });
  const [searchPlate, setSearchPlate] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<SysVehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<SysVehicle | null>(null);
  const [formData, setFormData] =
    useState<Partial<SysVehicle>>(createVehicleForm);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params: any = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.licensePlate) params.licensePlate = query.licensePlate;
      if (query.status) params.status = query.status;
      const res = await getVehicleList(params);
      setVehicles(res.rows || []);
      setTotal(res.total || 0);
      setSelectedIds([]);
    } catch (error) {
      console.error("加载车辆列表失败", error);
      toast.error("加载车辆列表失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getVehicleStats();
      setStats(res);
    } catch {
      // 统计接口失败不阻断主流程
    }
  };

  useEffect(() => {
    void fetchVehicles();
  }, [query.pageNum, query.pageSize, query.licensePlate, query.status]);

  useEffect(() => {
    void fetchStats();
  }, []);

  const handleSearch = () => {
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      licensePlate: searchPlate.trim(),
    }));
  };

  const handleReset = () => {
    setSearchPlate("");
    setQuery({ pageNum: 1, pageSize: 10, licensePlate: "", status: "" });
  };

  const handleFilterByStatus = (status: string) => {
    setQuery((prev) => ({
      ...prev,
      pageNum: 1,
      status: prev.status === status ? "" : status,
    }));
  };

  const handleAdd = () => {
    setCurrentVehicle(null);
    setFormData(createVehicleForm());
    setIsFormOpen(true);
  };

  const handleEdit = (vehicle: SysVehicle) => {
    setCurrentVehicle(vehicle);
    setFormData({ ...vehicle });
    setIsFormOpen(true);
  };

  const handleViewDetail = (vehicle: SysVehicle) => {
    setDetailVehicle(vehicle);
    setIsDetailOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确认删除该车辆？删除后不可恢复。")) return;
    try {
      await deleteVehicle([id]);
      toast.success("删除成功");
      await Promise.all([fetchVehicles(), fetchStats()]);
    } catch {
      toast.error("删除失败");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`确认删除选中的 ${selectedIds.length} 辆车？`)) return;
    try {
      await deleteVehicle(selectedIds);
      toast.success("批量删除成功");
      await Promise.all([fetchVehicles(), fetchStats()]);
    } catch {
      toast.error("批量删除失败");
    }
  };

  const handleSubmit = async () => {
    if (!formData.licensePlate?.trim()) return void toast.error("请输入车牌号");
    if (!formData.brand?.trim()) return void toast.error("请输入品牌");

    try {
      if (currentVehicle?.vehicleId) {
        await updateVehicle(formData as SysVehicle);
        toast.success("更新成功");
      } else {
        await addVehicle(formData as SysVehicle);
        toast.success("新增成功");
      }
      setIsFormOpen(false);
      await Promise.all([fetchVehicles(), fetchStats()]);
    } catch {
      toast.error("操作失败，请重试");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === vehicles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(vehicles.map((item) => item.vehicleId!));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const allSelected =
    vehicles.length > 0 && selectedIds.length === vehicles.length;

  const isInsuranceExpiring = (date?: string) => {
    if (!date) return false;
    const expiry = new Date(date);
    const now = new Date();
    const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  };

  const expiringCount = useMemo(
    () =>
      vehicles.filter((vehicle) => isInsuranceExpiring(vehicle.insuranceExpiry))
        .length,
    [vehicles],
  );
  const hasActiveFilters = Boolean(query.licensePlate || query.status);
  const selectedCount = selectedIds.length;
  const statusLabel =
    STATUS_OPTIONS.find((item) => item.value === query.status)?.label ||
    "全部状态";
  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const overviewItems = [
    { label: "当前结果", value: `${vehicles.length} 辆` },
    { label: "状态筛选", value: statusLabel },
    { label: "批量选择", value: `${selectedCount} 辆` },
    { label: "保险预警", value: `${expiringCount} 辆` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Car className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
                {timeLabel}
              </span>
            </div>
          }
          title="车辆管理"
          description="管理公司车辆信息、状态和维保记录，让后台资产类页面统一到工作台视觉语言。"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw size={14} />
                重置
              </Button>
              <Button onClick={handleAdd} className="gap-2">
                <Plus size={16} />
                新增车辆
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="总车辆"
              value={stats?.total ?? total}
              hint="当前系统中的车辆总量"
              aside={<Car className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="可用车辆"
              value={stats?.available ?? 0}
              hint={`使用中 ${stats?.inUse ?? 0} · 预约 ${stats?.booked ?? 0}`}
              aside={
                <CheckCircle className="h-[18px] w-[18px] text-emerald-500" />
              }
            />
            <WorkspaceMetricCard
              label="维修/报废"
              value={(stats?.maintenance ?? 0) + (stats?.scrapped ?? 0)}
              hint={`维修 ${stats?.maintenance ?? 0} · 报废 ${stats?.scrapped ?? 0}`}
              aside={<Wrench className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="保险预警"
              value={stats?.insuranceExpiringSoon ?? expiringCount}
              hint="30 天内到期的车辆"
              aside={
                <AlertTriangle className="h-[18px] w-[18px] text-sky-500" />
              }
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="车辆工作台"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={overviewItems}
          quickFilters={[
            { label: "全部", value: "" },
            { label: "可用", value: "1" },
            { label: "已预约", value: "2" },
            { label: "使用中", value: "3" },
            { label: "维修中", value: "4" },
            { label: "已报废", value: "5" },
          ]}
          activeQuickFilter={query.status}
          onQuickFilterChange={handleFilterByStatus}
          quickFilterAside={
            hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={handleReset}>
                清空筛选
              </Button>
            ) : (
              <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                当前显示全部车辆
              </span>
            )
          }
          filterBar={
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="搜索车牌号..."
                  value={searchPlate}
                  onChange={(event) => setSearchPlate(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Select
                value={query.status || "all"}
                onValueChange={(value) =>
                  setQuery((prev) => ({
                    ...prev,
                    pageNum: 1,
                    status: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.label}
                      value={option.value || "all"}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} className="gap-2">
                <Search size={14} />
                查询
              </Button>
            </div>
          }
        />

        <WorkspaceResultCard
          total={total}
          title="车辆列表"
          description="统一展示车辆基本信息、状态、里程和保险到期情况。"
          footer={
            total > 0 ? (
              <WorkspacePaginationBar
                total={total}
                pageNum={query.pageNum}
                totalPages={totalPages}
                onPrev={() =>
                  setQuery((prev) => ({
                    ...prev,
                    pageNum: Math.max(1, prev.pageNum - 1),
                  }))
                }
                onNext={() =>
                  setQuery((prev) => ({
                    ...prev,
                    pageNum: Math.min(totalPages, prev.pageNum + 1),
                  }))
                }
                prevDisabled={query.pageNum <= 1}
                nextDisabled={query.pageNum >= totalPages}
              />
            ) : null
          }
        >
          <div className="space-y-4 px-4 py-4">
            {selectedIds.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="text-sm font-medium text-rose-700">
                  已选中 {selectedIds.length} 辆车辆
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                  className="gap-1"
                >
                  <Trash2 size={14} />
                  批量删除
                </Button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead>车牌号</TableHead>
                    <TableHead>品牌/型号</TableHead>
                    <TableHead>颜色</TableHead>
                    <TableHead className="text-center">座位数</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">里程 (km)</TableHead>
                    <TableHead>停放位置</TableHead>
                    <TableHead>保险到期</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <WorkspaceTableStateRow
                      colSpan={10}
                      type="loading"
                      title="正在加载车辆数据..."
                    />
                  ) : vehicles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center">
                        <div className="mx-auto max-w-md py-6">
                          <WorkspaceEmptyPanel
                            variant="glass"
                            icon={<Car size={26} strokeWidth={1.6} />}
                            title="暂无车辆数据"
                            description="新增第一辆车辆后，这里会展示车辆状态、里程、保险到期和停放位置。"
                          />
                          <div className="mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleAdd}
                            >
                              添加第一辆车
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vehicles.map((vehicle) => (
                      <TableRow
                        key={vehicle.vehicleId}
                        className="transition-colors hover:bg-slate-50/70"
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(vehicle.vehicleId!)}
                            onChange={() => toggleSelect(vehicle.vehicleId!)}
                            className="rounded border-gray-300"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-medium text-gray-900">
                            {vehicle.licensePlate}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{vehicle.brand}</span>
                            {vehicle.model ? (
                              <span className="ml-1 text-gray-500">
                                {vehicle.model}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full border border-gray-300"
                              style={{
                                backgroundColor:
                                  vehicle.color?.toLowerCase() || "#ccc",
                              }}
                            />
                            {vehicle.color}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {vehicle.capacity}座
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={vehicle.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {vehicle.mileage?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell>
                          {vehicle.location ? (
                            <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                              <MapPin size={12} />
                              {vehicle.location}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {vehicle.insuranceExpiry ? (
                            <span
                              className={`text-sm ${isInsuranceExpiring(vehicle.insuranceExpiry) ? "font-medium text-amber-600" : "text-gray-600"}`}
                            >
                              {isInsuranceExpiring(vehicle.insuranceExpiry) ? (
                                <AlertTriangle
                                  size={12}
                                  className="mr-1 inline"
                                />
                              ) : null}
                              {vehicle.insuranceExpiry}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <TableRowActions
                            align="center"
                            actions={[
                              {
                                label: "详情",
                                icon: <Eye size={14} />,
                                onClick: () => handleViewDetail(vehicle),
                                tone: "info",
                              },
                              {
                                label: "编辑",
                                icon: <Edit2 size={14} />,
                                onClick: () => handleEdit(vehicle),
                                tone: "primary",
                              },
                              {
                                label: "删除",
                                icon: <Trash2 size={14} />,
                                onClick: () =>
                                  void handleDelete(vehicle.vehicleId!),
                                tone: "danger",
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
        </WorkspaceResultCard>

        {isFormOpen ? (
          <WorkspaceDialogShell
            title={currentVehicle ? "编辑车辆信息" : "新增车辆"}
            description="维护车辆的基本信息、状态和扩展信息。"
            onClose={() => setIsFormOpen(false)}
            maxWidthClassName="max-w-2xl"
          >
            <div className="space-y-4">
              <Tabs defaultValue="basic">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">基本信息</TabsTrigger>
                  <TabsTrigger value="extra">扩展信息</TabsTrigger>
                </TabsList>
                <TabsContent value="basic" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>
                        车牌号 <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        placeholder="如：京A12345"
                        value={formData.licensePlate || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            licensePlate: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        品牌 <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        placeholder="如：丰田"
                        value={formData.brand || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            brand: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>型号</Label>
                      <Input
                        placeholder="如：凯美瑞"
                        value={formData.model || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            model: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>颜色</Label>
                      <Input
                        placeholder="如：白色"
                        value={formData.color || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            color: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
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
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>状态</Label>
                      <Select
                        value={formData.status || "1"}
                        onValueChange={(value) =>
                          setFormData({ ...formData, status: value as any })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">可用</SelectItem>
                          <SelectItem value="4">维修中</SelectItem>
                          <SelectItem value="5">已报废</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="extra" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
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
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>停放位置</Label>
                      <Input
                        placeholder="如：B1停车场A区"
                        value={formData.location || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            location: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>购买日期</Label>
                      <DatePicker
                        type="date"
                        value={formData.purchaseDate || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            purchaseDate: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>保险到期日</Label>
                      <DatePicker
                        type="date"
                        value={formData.insuranceExpiry || ""}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            insuranceExpiry: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>备注</Label>
                    <Textarea
                      className="min-h-[80px] resize-none"
                      placeholder="其他备注信息..."
                      value={formData.remark || ""}
                      onChange={(event) =>
                        setFormData({ ...formData, remark: event.target.value })
                      }
                    />
                  </div>
                </TabsContent>
              </Tabs>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsFormOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmit}>
                  {currentVehicle ? "保存修改" : "确认新增"}
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}

        {isDetailOpen && detailVehicle ? (
          <WorkspaceDialogShell
            title="车辆详情"
            description="查看车辆的基础信息、状态与保险到期情况。"
            onClose={() => setIsDetailOpen(false)}
            maxWidthClassName="max-w-lg"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 border-b pb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                  <Car size={24} className="text-slate-700" />
                </div>
                <div>
                  <p className="font-mono text-lg font-bold">
                    {detailVehicle.licensePlate}
                  </p>
                  <p className="text-sm text-gray-500">
                    {detailVehicle.brand} {detailVehicle.model}
                  </p>
                </div>
                <div className="ml-auto">
                  <StatusBadge status={detailVehicle.status} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <span className="text-gray-400">颜色</span>
                  <p className="font-medium">{detailVehicle.color || "-"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">座位数</span>
                  <p className="font-medium">{detailVehicle.capacity}座</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">当前里程</span>
                  <p className="font-mono font-medium">
                    {detailVehicle.mileage?.toLocaleString() || 0} km
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">停放位置</span>
                  <p className="font-medium">{detailVehicle.location || "-"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">购买日期</span>
                  <p className="font-medium">
                    {detailVehicle.purchaseDate || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">保险到期</span>
                  <p
                    className={`font-medium ${isInsuranceExpiring(detailVehicle.insuranceExpiry) ? "text-amber-600" : ""}`}
                  >
                    {detailVehicle.insuranceExpiry || "-"}
                    {isInsuranceExpiring(detailVehicle.insuranceExpiry)
                      ? " · 即将到期"
                      : ""}
                  </p>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-gray-400">备注</span>
                  <p className="font-medium">{detailVehicle.remark || "无"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">创建时间</span>
                  <p className="text-xs font-medium">
                    {detailVehicle.createTime || "-"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">更新时间</span>
                  <p className="text-xs font-medium">
                    {detailVehicle.updateTime || "-"}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDetailOpen(false)}
                >
                  关闭
                </Button>
                <Button
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleEdit(detailVehicle);
                  }}
                >
                  编辑
                </Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};

export default VehicleList;
