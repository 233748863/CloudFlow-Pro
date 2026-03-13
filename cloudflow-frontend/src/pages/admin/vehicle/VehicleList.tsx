import React, { useEffect, useState } from 'react';
import {
  Car, Plus, Search, Edit2, Trash2, Eye, AlertTriangle,
  CheckCircle, Clock, Wrench, XCircle, MapPin,
  ChevronLeft, ChevronRight, RotateCcw, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, DatePicker, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  getVehicleList, addVehicle, updateVehicle, deleteVehicle,
  getVehicleStats, SysVehicle, VehicleStats
} from '@/services/api/vehicle';

/** 状态配置映射 */
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  '1': { label: '可用', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <CheckCircle size={14} /> },
  '2': { label: '已预约', color: 'text-pink-600', bg: 'bg-pink-50 border-pink-100', icon: <Clock size={14} /> },
  '3': { label: '使用中', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: <Car size={14} /> },
  '4': { label: '维修中', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: <Wrench size={14} /> },
  '5': { label: '已报废', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: <XCircle size={14} /> },
};

/** 状态标签组件 */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = STATUS_CONFIG[status] || { label: '未知', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
};

/** 统计卡片组件 */
const StatCard: React.FC<{
  title: string; value: number; icon: React.ReactNode;
  color: string; onClick?: () => void; active?: boolean;
}> = ({ title, value, icon, color, onClick, active }) => (
  <div
    onClick={onClick}
    className={`relative overflow-hidden rounded-xl border p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
      active ? 'ring-2 ring-pink-400 border-pink-200 shadow-md' : 'border-gray-200 hover:border-gray-300'
    }`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        {icon}
      </div>
    </div>
  </div>
);

const VehicleList: React.FC = () => {
  // 数据状态
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [loading, setLoading] = useState(false);

  // 查询条件
  const [query, setQuery] = useState({
    pageNum: 1,
    pageSize: 10,
    licensePlate: '',
    status: '',
  });

  // 弹窗状态
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<SysVehicle | null>(null);
  const [detailVehicle, setDetailVehicle] = useState<SysVehicle | null>(null);
  const [formData, setFormData] = useState<Partial<SysVehicle>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 加载车辆列表
  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params: any = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.licensePlate) params.licensePlate = query.licensePlate;
      if (query.status && query.status !== 'all') params.status = query.status;
      const res = await getVehicleList(params);
      setVehicles(res.rows || []);
      setTotal(res.total || 0);
    } catch (error) {
      console.error('加载车辆列表失败', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载统计数据
  const fetchStats = async () => {
    try {
      const res = await getVehicleStats();
      setStats(res);
    } catch {
      // 统计接口失败不影响主流程
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [query.pageNum, query.pageSize]);

  useEffect(() => {
    fetchStats();
  }, []);

  // 搜索
  const handleSearch = () => {
    setQuery({ ...query, pageNum: 1 });
    fetchVehicles();
  };

  // 重置搜索
  const handleReset = () => {
    setQuery({ pageNum: 1, pageSize: 10, licensePlate: '', status: '' });
    setTimeout(fetchVehicles, 0);
  };

  // 按状态筛选（点击统计卡片）
  const handleFilterByStatus = (status: string) => {
    const newStatus = query.status === status ? '' : status;
    setQuery({ ...query, status: newStatus, pageNum: 1 });
    setTimeout(fetchVehicles, 0);
  };

  // 新增
  const handleAdd = () => {
    setCurrentVehicle(null);
    setFormData({
      licensePlate: '', brand: '', model: '', color: '',
      capacity: 5, status: '1', mileage: 0, location: '',
      purchaseDate: '', insuranceExpiry: '', remark: '',
    });
    setIsFormOpen(true);
  };

  // 编辑
  const handleEdit = (vehicle: SysVehicle) => {
    setCurrentVehicle(vehicle);
    setFormData({ ...vehicle });
    setIsFormOpen(true);
  };

  // 查看详情
  const handleViewDetail = (vehicle: SysVehicle) => {
    setDetailVehicle(vehicle);
    setIsDetailOpen(true);
  };

  // 删除
  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该车辆？删除后不可恢复。')) return;
    try {
      await deleteVehicle([id]);
      toast.success('删除成功');
      fetchVehicles();
      fetchStats();
    } catch {
      toast.error('删除失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确认删除选中的 ${selectedIds.length} 辆车？`)) return;
    try {
      await deleteVehicle(selectedIds);
      toast.success('批量删除成功');
      setSelectedIds([]);
      fetchVehicles();
      fetchStats();
    } catch {
      toast.error('批量删除失败');
    }
  };

  // 提交表单
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
      setIsFormOpen(false);
      fetchVehicles();
      fetchStats();
    } catch {
      toast.error('操作失败，请重试');
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.length === vehicles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(vehicles.map(v => v.vehicleId!));
    }
  };

  // 单选
  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // 分页
  const totalPages = Math.ceil(total / query.pageSize);

  // 保险即将到期判断
  const isInsuranceExpiring = (date?: string) => {
    if (!date) return false;
    const expiry = new Date(date);
    const now = new Date();
    const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">车辆管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理公司车辆信息、状态和维保记录</p>
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus size={16} />
          新增车辆
        </Button>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard
            title="总车辆" value={stats.total}
            icon={<Car size={20} className="text-gray-600" />}
            color="bg-gray-100"
            onClick={() => handleFilterByStatus('')}
            active={!query.status}
          />
          <StatCard
            title="可用" value={stats.available}
            icon={<CheckCircle size={20} className="text-green-600" />}
            color="bg-green-100"
            onClick={() => handleFilterByStatus('1')}
            active={query.status === '1'}
          />
          <StatCard
            title="已预约" value={stats.booked}
            icon={<Clock size={20} className="text-pink-500" />}
            color="bg-pink-50"
            onClick={() => handleFilterByStatus('2')}
            active={query.status === '2'}
          />
          <StatCard
            title="使用中" value={stats.inUse}
            icon={<Car size={20} className="text-orange-600" />}
            color="bg-orange-100"
            onClick={() => handleFilterByStatus('3')}
            active={query.status === '3'}
          />
          <StatCard
            title="维修中" value={stats.maintenance}
            icon={<Wrench size={20} className="text-yellow-600" />}
            color="bg-yellow-100"
            onClick={() => handleFilterByStatus('4')}
            active={query.status === '4'}
          />
          <StatCard
            title="已报废" value={stats.scrapped}
            icon={<XCircle size={20} className="text-red-600" />}
            color="bg-red-100"
            onClick={() => handleFilterByStatus('5')}
            active={query.status === '5'}
          />
          <StatCard
            title="保险即将到期" value={stats.insuranceExpiringSoon}
            icon={<AlertTriangle size={20} className="text-amber-600" />}
            color="bg-amber-100"
          />
        </div>
      )}

      {/* 搜索栏 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-gray-400" />
              <Input
                placeholder="搜索车牌号..."
                value={query.licensePlate}
                onChange={(e) => setQuery({ ...query, licensePlate: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-56"
              />
            </div>
            <Select
              value={query.status || 'all'}
              onValueChange={(val) => setQuery({ ...query, status: val === 'all' ? '' : val })}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="1">可用</SelectItem>
                <SelectItem value="2">已预约</SelectItem>
                <SelectItem value="3">使用中</SelectItem>
                <SelectItem value="4">维修中</SelectItem>
                <SelectItem value="5">已报废</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} size="sm" className="gap-1">
              <Filter size={14} />
              查询
            </Button>
            <Button onClick={handleReset} variant="outline" size="sm" className="gap-1">
              <RotateCcw size={14} />
              重置
            </Button>
            {selectedIds.length > 0 && (
              <Button onClick={handleBatchDelete} variant="destructive" size="sm" className="ml-auto gap-1">
                <Trash2 size={14} />
                批量删除 ({selectedIds.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 数据表格 */}
      <Card>
        <CardContent className="!p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={vehicles.length > 0 && selectedIds.length === vehicles.length}
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
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center h-32">
                      <div className="flex items-center justify-center gap-2 text-gray-400">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-pink-400" />
                        加载中...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : vehicles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center h-32">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Car size={40} strokeWidth={1} />
                        <span>暂无车辆数据</span>
                        <Button variant="outline" size="sm" onClick={handleAdd}>添加第一辆车</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  vehicles.map((vehicle) => (
                    <TableRow
                      key={vehicle.vehicleId}
                      className="hover:bg-gray-50/50 transition-colors"
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
                          {vehicle.model && (
                            <span className="text-gray-500 ml-1">{vehicle.model}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: vehicle.color?.toLowerCase() || '#ccc' }}
                          />
                          {vehicle.color}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{vehicle.capacity}座</TableCell>
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
                          <span className={`text-sm ${isInsuranceExpiring(vehicle.insuranceExpiry) ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
                            {isInsuranceExpiring(vehicle.insuranceExpiry) && <AlertTriangle size={12} className="inline mr-1" />}
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
                              label: '详情',
                              icon: <Eye size={14} />,
                              onClick: () => handleViewDetail(vehicle),
                              tone: 'info',
                            },
                            {
                              label: '编辑',
                              icon: <Edit2 size={14} />,
                              onClick: () => handleEdit(vehicle),
                              tone: 'primary',
                            },
                            {
                              label: '删除',
                              icon: <Trash2 size={14} />,
                              onClick: () => handleDelete(vehicle.vehicleId!),
                              tone: 'danger',
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

          {/* 分页 */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50">
              <span className="text-sm text-gray-500">
                共 {total} 条记录，第 {query.pageNum}/{totalPages} 页
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={query.pageNum <= 1}
                  onClick={() => setQuery({ ...query, pageNum: query.pageNum - 1 })}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft size={16} />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (query.pageNum <= 3) {
                    page = i + 1;
                  } else if (query.pageNum >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = query.pageNum - 2 + i;
                  }
                  return (
                    <Button
                      key={page}
                      variant={query.pageNum === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setQuery({ ...query, pageNum: page })}
                      className="h-8 w-8 p-0"
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  variant="outline" size="sm"
                  disabled={query.pageNum >= totalPages}
                  onClick={() => setQuery({ ...query, pageNum: query.pageNum + 1 })}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增/编辑弹窗 */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car size={20} />
              {currentVehicle ? '编辑车辆信息' : '新增车辆'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Tabs defaultValue="basic">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="basic">基本信息</TabsTrigger>
                <TabsTrigger value="extra">扩展信息</TabsTrigger>
              </TabsList>
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>车牌号 <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="如：京A12345"
                      value={formData.licensePlate || ''}
                      onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>品牌 <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="如：丰田"
                      value={formData.brand || ''}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>型号</Label>
                    <Input
                      placeholder="如：凯美瑞"
                      value={formData.model || ''}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>颜色</Label>
                    <Input
                      placeholder="如：白色"
                      value={formData.color || ''}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>座位数</Label>
                    <Input
                      type="number" min={1} max={50}
                      value={formData.capacity || 5}
                      onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 5 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>状态</Label>
                    <Select
                      value={formData.status || '1'}
                      onValueChange={(val) => setFormData({ ...formData, status: val as any })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">可用</SelectItem>
                        <SelectItem value="4">维修中</SelectItem>
                        <SelectItem value="5">已报废</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="extra" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>当前里程 (km)</Label>
                    <Input
                      type="number" min={0}
                      value={formData.mileage || 0}
                      onChange={(e) => setFormData({ ...formData, mileage: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>停放位置</Label>
                    <Input
                      placeholder="如：B1停车场A区"
                      value={formData.location || ''}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>购买日期</Label>
                    <DatePicker
                      type="date"
                      value={formData.purchaseDate || ''}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>保险到期日</Label>
                    <DatePicker
                      type="date"
                      value={formData.insuranceExpiry || ''}
                      onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>备注</Label>
                  <Textarea
                    className="min-h-[80px] resize-none"
                    placeholder="其他备注信息..."
                    value={formData.remark || ''}
                    onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>取消</Button>
            <Button onClick={handleSubmit}>
              {currentVehicle ? '保存修改' : '确认新增'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 详情弹窗 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={20} />
              车辆详情
            </DialogTitle>
          </DialogHeader>
          {detailVehicle && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="w-12 h-12 rounded-lg bg-pink-50 flex items-center justify-center">
                  <Car size={24} className="text-pink-500" />
                </div>
                <div>
                  <p className="font-mono text-lg font-bold">{detailVehicle.licensePlate}</p>
                  <p className="text-sm text-gray-500">{detailVehicle.brand} {detailVehicle.model}</p>
                </div>
                <div className="ml-auto">
                  <StatusBadge status={detailVehicle.status} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <span className="text-gray-400">颜色</span>
                  <p className="font-medium">{detailVehicle.color || '-'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">座位数</span>
                  <p className="font-medium">{detailVehicle.capacity}座</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">当前里程</span>
                  <p className="font-medium font-mono">{detailVehicle.mileage?.toLocaleString() || 0} km</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">停放位置</span>
                  <p className="font-medium">{detailVehicle.location || '-'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">购买日期</span>
                  <p className="font-medium">{detailVehicle.purchaseDate || '-'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">保险到期</span>
                  <p className={`font-medium ${isInsuranceExpiring(detailVehicle.insuranceExpiry) ? 'text-amber-600' : ''}`}>
                    {detailVehicle.insuranceExpiry || '-'}
                    {isInsuranceExpiring(detailVehicle.insuranceExpiry) && ' ⚠️ 即将到期'}
                  </p>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-gray-400">备注</span>
                  <p className="font-medium">{detailVehicle.remark || '无'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">创建时间</span>
                  <p className="font-medium text-xs">{detailVehicle.createTime || '-'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-gray-400">更新时间</span>
                  <p className="font-medium text-xs">{detailVehicle.updateTime || '-'}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>关闭</Button>
            <Button onClick={() => { setIsDetailOpen(false); handleEdit(detailVehicle!); }}>编辑</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleList;
