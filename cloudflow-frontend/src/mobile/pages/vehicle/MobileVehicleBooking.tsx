import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { ChevronLeft } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'


export const MobileVehicleBooking: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
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

  useEffect(() => {
    getAvailableVehicles().then(res => {
      setVehicles(res);
    });
  }, []);

  const handleSubmit = async () => {
     if (!user) return;
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
       alert('申请成功');
       navigate('/dashboard');
     } catch (e) {
       alert('提交失败');
     }
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
          <div className={`flex-1 h-1 ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
          <div className={`flex-1 h-1 ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
          <div className={`flex-1 h-1 ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">选择车辆与时间</h2>
            <div className="space-y-4">
              <div>
                <Label>车辆</Label>
                <Select value={formData.vehicleId} onValueChange={(v) => setFormData({...formData, vehicleId: v})}>
                  <SelectTrigger className="mt-2 w-full h-12 text-base">
                    <SelectValue placeholder="请选择车辆" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => (
                      <SelectItem key={v.vehicleId} value={String(v.vehicleId)}>
                        {v.licensePlate} ({v.brand})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>开始时间</Label>
                <Input type="datetime-local" className="mt-2 h-12 text-base"
                  value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} />
              </div>
              <div>
                <Label>结束时间</Label>
                <Input type="datetime-local" className="mt-2 h-12 text-base"
                  value={formData.endTime} onChange={e => setFormData({...formData, endTime: e.target.value})} />
              </div>
            </div>
            <Button className="w-full h-12 text-lg mt-8" onClick={() => setStep(2)}>下一步</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">行程信息</h2>
            <div className="space-y-4">
              <div>
                <Label>目的地</Label>
                <Input className="mt-2 h-12 text-base" placeholder="请输入目的地"
                  value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} />
              </div>
              <div>
                <Label>用车事由</Label>
                <Input className="mt-2 h-12 text-base" placeholder="外出开会、接待等"
                  value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(1)}>上一步</Button>
              <Button className="flex-1 h-12" onClick={() => setStep(3)}>下一步</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold">随行人员</h2>
            <div className="space-y-4">
              <div>
                <Label>人数</Label>
                <Input type="number" className="mt-2 h-12 text-base"
                  value={formData.passengerCount} onChange={e => setFormData({...formData, passengerCount: parseInt(e.target.value)})} />
              </div>
              <div>
                <Label>名单 (选填)</Label>
                <Input className="mt-2 h-12 text-base" placeholder="张三, 李四"
                  value={formData.passengers} onChange={e => setFormData({...formData, passengers: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(2)}>上一步</Button>
              <Button className="flex-1 h-12 bg-indigo-600" onClick={handleSubmit}>提交申请</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
