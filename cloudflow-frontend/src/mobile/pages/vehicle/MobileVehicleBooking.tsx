import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { toBackendDateString } from '@/utils/dateFormat';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight';
import { Button, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, UserSelector } from '@/components/common';
import type { UserBrief } from '@/types/workflow';


export const MobileVehicleBooking: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // 启用键盘自动滚动
  useKeyboardAwareScroll();
  const [formData, setFormData] = useState({
    vehicleId: '',
    startTime: '',
    endTime: '',
    destination: '',
    reason: '',
    passengerCount: 1,
    passengers: '',
    passengerIds: [] as string[],
  });

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoading(true);
      try {
        const res = await getAvailableVehicles();
        setVehicles(res);
      } catch (error: any) {
        toast.error(error.message || '获取车辆列表失败');
      } finally {
        setLoading(false);
      }
    };
    fetchVehicles();
  }, []);

  const validateForm = (): string | null => {
    if (!formData.vehicleId) return '请选择车辆';
    if (!formData.startTime) return '请选择开始时间';
    if (!formData.endTime) return '请选择结束时间';
    
    const startTime = new Date(formData.startTime);
    const endTime = new Date(formData.endTime);
    const now = new Date();
    
    if (startTime < now) return '开始时间不能早于当前时间';
    if (endTime <= startTime) return '结束时间必须晚于开始时间';
    if (!formData.destination || formData.destination.trim().length < 2) return '请输入有效的目的地（至少2个字符）';
    if (!formData.reason || formData.reason.trim().length < 2) return '请输入有效的用车事由（至少2个字符）';
    if (formData.passengerCount < 1 || formData.passengerCount > 50) return '人数必须在1-50之间';
    
    return null;
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('用户信息不存在，请重新登录');
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await submitUsage({
        vehicleId: parseInt(formData.vehicleId),
        applicantId: parseInt(user.id),
        startTime: toBackendDateString(formData.startTime),
        endTime: toBackendDateString(formData.endTime),
        destination: formData.destination.trim(),
        reason: formData.reason.trim(),
        passengerCount: formData.passengerCount,
        passengers: formData.passengers.trim(),
      });
      toast.success('申请提交成功！');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const updatePassengers = useCallback((selectedUsers: UserBrief[]) => {
    setFormData((current) => ({
      ...current,
      passengers: selectedUsers.map((item) => item.name).join('、'),
    }));
  }, []);

  const handleNextStep = () => {
    if (step === 1) {
      if (!formData.vehicleId) {
        toast.error('请选择车辆');
        return;
      }
      if (!formData.startTime) {
        toast.error('请选择开始时间');
        return;
      }
      if (!formData.endTime) {
        toast.error('请选择结束时间');
        return;
      }
      
      const startTime = new Date(formData.startTime);
      const endTime = new Date(formData.endTime);
      const now = new Date();
      
      if (startTime < now) {
        toast.error('开始时间不能早于当前时间');
        return;
      }
      if (endTime <= startTime) {
        toast.error('结束时间必须晚于开始时间');
        return;
      }
    } else if (step === 2) {
      if (!formData.destination || formData.destination.trim().length < 2) {
        toast.error('请输入有效的目的地');
        return;
      }
      if (!formData.reason || formData.reason.trim().length < 2) {
        toast.error('请输入有效的用车事由');
        return;
      }
    }
    setStep(step + 1);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <div className="h-12 border-b flex items-center px-4 sticky top-0 bg-white z-10">
        <button onClick={() => navigate(-1)} className="mr-4">
          <ChevronLeft />
        </button>
        <span className="font-bold text-lg">公务车申请</span>
      </div>

      <div className="p-4 pb-20">
        {/* Progress */}
        <div className="flex mb-8">
          <div className={`flex-1 h-1 ${step >= 1 ? 'bg-pink-500' : 'bg-slate-200'}`}></div>
          <div className={`flex-1 h-1 ${step >= 2 ? 'bg-pink-500' : 'bg-slate-200'}`}></div>
          <div className={`flex-1 h-1 ${step >= 3 ? 'bg-pink-500' : 'bg-slate-200'}`}></div>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">选择车辆与时间</h2>
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="animate-spin text-pink-500" size={32} />
              </div>
            ) : (
              <div className="space-y-4">
              <div>
                <Label htmlFor="vehicle-select">车辆</Label>
                <Select value={formData.vehicleId} onValueChange={(v) => setFormData({...formData, vehicleId: v})}>
                  <SelectTrigger className="mt-2 w-full h-12 text-base">
                    <SelectValue placeholder="请选择车辆" />
                  </SelectTrigger>
                    <SelectContent>
                      {vehicles.length === 0 ? (
                        <div className="p-4 text-center text-slate-500">暂无可用车辆</div>
                      ) : (
                        vehicles.map(v => (
                          <SelectItem key={v.vehicleId} value={String(v.vehicleId)}>
                            {v.licensePlate} ({v.brand})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              <div>
                <Label htmlFor="start-time">开始时间</Label>
                <DatePicker
                  id="start-time"
                  type="datetime-local"
                  className="mt-2"
                  value={formData.startTime}
                  onChange={e => setFormData({...formData, startTime: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="end-time">结束时间</Label>
                <DatePicker
                  id="end-time"
                  type="datetime-local"
                  className="mt-2"
                  value={formData.endTime}
                  onChange={e => setFormData({...formData, endTime: e.target.value})}
                />
              </div>
              </div>
            )}
            <Button 
              className="w-full h-12 text-lg mt-8" 
              onClick={handleNextStep}
              disabled={loading}
            >
              下一步
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">行程信息</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="destination">目的地</Label>
                <Input 
                  id="destination"
                  className="mt-2 h-12 text-base" 
                  placeholder="请输入目的地"
                  value={formData.destination} 
                  onChange={e => setFormData({...formData, destination: e.target.value})}
                  aria-label="输入目的地"
                  aria-required="true"
                />
              </div>
              <div>
                <Label htmlFor="reason">用车事由</Label>
                <Input 
                  id="reason"
                  className="mt-2 h-12 text-base" 
                  placeholder="外出开会、接待等"
                  value={formData.reason} 
                  onChange={e => setFormData({...formData, reason: e.target.value})}
                  aria-label="输入用车事由"
                  aria-required="true"
                />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(1)}>上一步</Button>
              <Button className="flex-1 h-12" onClick={handleNextStep}>下一步</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">随行人员</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="passenger-count">人数</Label>
                <Input 
                  id="passenger-count"
                  type="number" 
                  className="mt-2 h-12 text-base"
                  value={formData.passengerCount} 
                  onChange={e => setFormData({...formData, passengerCount: parseInt(e.target.value)})}
                  aria-label="输入随行人数"
                  aria-required="true"
                  min="1"
                  max="50"
                />
              </div>
              <div>
                <Label htmlFor="passengers">名单 (选填)</Label>
                <UserSelector
                  value={formData.passengerIds}
                  onChange={(passengerIds) => setFormData({...formData, passengerIds})}
                  onUsersChange={updatePassengers}
                  placeholder="搜索姓名、邮箱或部门选择人员"
                  className="mt-2"
                  dropdownPlacement="top"
                />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(2)} disabled={submitting}>
                上一步
              </Button>
              <Button 
                className="flex-1 h-12 bg-pink-500" 
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={20} />
                    提交中...
                  </>
                ) : (
                  '提交申请'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
