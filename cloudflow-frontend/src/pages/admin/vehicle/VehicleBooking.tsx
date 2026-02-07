import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { useAsyncData } from '@/hooks/useAsyncData';

export const VehicleBooking: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: vehicles, loading, error } = useAsyncData<SysVehicle[]>(() => getAvailableVehicles());
  const [formData, setFormData] = useState({
    vehicleId: '',
    startTime: '',
    endTime: '',
    destination: '',
    reason: '',
    passengerCount: 1,
    passengers: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      await submitUsage({
        vehicleId: parseInt(formData.vehicleId),
        applicantId: parseInt(user.id),
        startTime: formData.startTime.replace('T', ' ') + ':00',
        endTime: formData.endTime.replace('T', ' ') + ':00',
        destination: formData.destination,
        reason: formData.reason,
        passengerCount: formData.passengerCount,
        passengers: formData.passengers,
      });
      toast.success('申请已提交，请等待审批');
      navigate('/admin/vehicle/usage');
    } catch (error) {
      toast.error('提交失败，请检查冲突或网络');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin mr-2" />
        <span>加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="text-red-500 text-center">
              <p>加载失败: {error.message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="text-gray-500 text-center">暂无可用车辆</div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  提交中...
                </>
              ) : (
                '提交申请'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
