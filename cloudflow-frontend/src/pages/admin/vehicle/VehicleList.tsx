import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui'
import { getVehicleList, addVehicle, updateVehicle, deleteVehicle, SysVehicle } from '@/services/api/vehicle';
import { PageQuery } from '@/types';

const VehicleList: React.FC = () => {
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<PageQuery & { licensePlate?: string; status?: string }>({
    pageNum: 1,
    pageSize: 10,
    licensePlate: '',
    status: '',
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentVehicle, setCurrentVehicle] = useState<SysVehicle | null>(null);
  const [formData, setFormData] = useState<Partial<SysVehicle>>({});

  const fetchVehicles = async () => {
    try {
      const res = await getVehicleList(query);
      setVehicles(res.rows);
      setTotal(res.total);
    } catch (error) {
      console.error('Failed to fetch vehicles', error);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [query.pageNum, query.pageSize, query.licensePlate, query.status]);

  const handleSearch = () => {
    setQuery({ ...query, pageNum: 1 });
  };

  const handleAdd = () => {
    setCurrentVehicle(null);
    setFormData({
      licensePlate: '',
      brand: '',
      model: '',
      color: '',
      capacity: 4,
      status: '1',
      mileage: 0,
      location: '',
      remark: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (vehicle: SysVehicle) => {
    setCurrentVehicle(vehicle);
    setFormData({ ...vehicle });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('确认删除该车辆吗？')) {
      await deleteVehicle([id]);
      fetchVehicles();
    }
  };

  const handleSubmit = async () => {
    try {
      if (currentVehicle?.vehicleId) {
        await updateVehicle(formData as SysVehicle);
      } else {
        await addVehicle(formData as SysVehicle);
      }
      setIsDialogOpen(false);
      fetchVehicles();
    } catch (error) {
      console.error('Operation failed', error);
    }
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      '1': '可用',
      '2': '已预约',
      '3': '使用中',
      '4': '维修中',
      '5': '报废',
    };
    return map[status] || status;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">车辆管理</h1>
        <Button onClick={handleAdd}>新增车辆</Button>
      </div>

      <div className="flex space-x-4">
        <Input
          placeholder="车牌号"
          value={query.licensePlate}
          onChange={(e) => setQuery({ ...query, licensePlate: e.target.value })}
          className="w-64"
        />
        <Select
          value={query.status}
          onValueChange={(val) => setQuery({ ...query, status: val })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">全部</SelectItem>
            <SelectItem value="1">可用</SelectItem>
            <SelectItem value="2">已预约</SelectItem>
            <SelectItem value="3">使用中</SelectItem>
            <SelectItem value="4">维修中</SelectItem>
            <SelectItem value="5">报废</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSearch} variant="outline">查询</Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>车牌号</TableHead>
              <TableHead>品牌/型号</TableHead>
              <TableHead>颜色</TableHead>
              <TableHead>载客量</TableHead>
              <TableHead>当前状态</TableHead>
              <TableHead>里程 (km)</TableHead>
              <TableHead>位置</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((vehicle) => (
              <TableRow key={vehicle.vehicleId}>
                <TableCell>{vehicle.licensePlate}</TableCell>
                <TableCell>{vehicle.brand} {vehicle.model}</TableCell>
                <TableCell>{vehicle.color}</TableCell>
                <TableCell>{vehicle.capacity}</TableCell>
                <TableCell>{getStatusLabel(vehicle.status)}</TableCell>
                <TableCell>{vehicle.mileage}</TableCell>
                <TableCell>{vehicle.location}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(vehicle)}>编辑</Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(vehicle.vehicleId!)}>删除</Button>
                </TableCell>
              </TableRow>
            ))}
            {vehicles.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24">暂无数据</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{currentVehicle ? '编辑车辆' : '新增车辆'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">车牌号</label>
                <Input
                  value={formData.licensePlate}
                  onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">品牌</label>
                <Input
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">型号</label>
                <Input
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">颜色</label>
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">载客量</label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">状态</label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">可用</SelectItem>
                    <SelectItem value="4">维修中</SelectItem>
                    <SelectItem value="5">报废</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">当前里程</label>
                <Input
                  type="number"
                  value={formData.mileage}
                  onChange={(e) => setFormData({ ...formData, mileage: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">停放位置</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleList;
