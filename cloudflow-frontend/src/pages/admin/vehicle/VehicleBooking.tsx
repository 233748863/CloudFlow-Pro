import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useMount } from '@/hooks/useMount';

const VehicleBooking: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [formData, setFormData] = useState({
    vehicleId: '',
    startTime: '',
    endTime: '',
    destination: '',
    reason: '',
    passengerCount: 1,
    passengers: '',
  });

  useMount(() => {
    const loadVehicles = async () => {
      const res = await getAvailableVehicles();
      setVehicles(res);
    };
    loadVehicles();
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await submitUsage({
        vehicleId: parseInt(formData.vehicleId),
        applicantId: parseInt(user.id),
        startTime: formData.startTime.replace('T', ' ') + ':00', // Format adjustment
        endTime: formData.endTime.replace('T', ' ') + ':00',
        destination: formData.destination,
        reason: formData.reason,
        passengerCount: formData.passengerCount,
        passengers: formData.passengers,
      });
      alert('申请已提交，请等待审批');
      navigate('/admin/vehicle/usage'); // Redirect to history
    } catch (error) {
      console.error('Submission failed', error);
      alert('提交失败，请检查冲突或网络');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>公务车预约申请</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>选择车辆</Label>
              <Select
                value={formData.vehicleId}
                onValueChange={(val) => setFormData({ ...formData, vehicleId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择车辆" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.vehicleId} value={String(v.vehicleId)}>
                      {v.licensePlate} - {v.brand} {v.model} ({v.capacity}座)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始时间</Label>
                <Input
                  type="datetime-local"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>结束时间</Label>
                <Input
                  type="datetime-local"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>目的地</Label>
              <Input
                required
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>用车事由</Label>
              <Input
                required
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>随行人数</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.passengerCount}
                  onChange={(e) => setFormData({ ...formData, passengerCount: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>随行人员名单</Label>
                <Input
                  placeholder="张三, 李四"
                  value={formData.passengers}
                  onChange={(e) => setFormData({ ...formData, passengers: e.target.value })}
                />
              </div>
            </div>

            <Button type="submit" className="w-full">提交申请</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VehicleBooking;
