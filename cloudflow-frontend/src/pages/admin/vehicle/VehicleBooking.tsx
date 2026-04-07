import React, { useState, useMemo } from 'react';
import {
  Car, Loader2, MapPin, Users, Calendar, FileText,
  CheckCircle, AlertCircle, ChevronRight, Search, ArrowLeftRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { toBackendDateString } from '@/utils/dateFormat';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useAsyncData } from '@/hooks/useAsyncData';
import { FileUpload } from '@/components/FileUpload';
import { getErrorMessage } from '@/utils/errorMessage';

/** 车辆卡片组件 */
const VehicleCard: React.FC<{
  vehicle: SysVehicle;
  selected: boolean;
  onSelect: () => void;
}> = ({ vehicle, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
      selected
        ? 'border-pink-400 bg-pink-50/50 shadow-md ring-1 ring-pink-100'
        : 'border-gray-200 hover:border-gray-300 bg-white'
    }`}
  >
    {/* 选中标记 */}
    {selected && (
      <div className="absolute top-2 right-2">
        <CheckCircle size={20} className="text-pink-400" />
      </div>
    )}
    {/* 车辆图标 */}
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
      selected ? 'bg-pink-50' : 'bg-gray-100'
    }`}>
      <Car size={20} className={selected ? 'text-pink-500' : 'text-gray-500'} />
    </div>
    {/* 车牌号 */}
    <p className="font-mono font-bold text-base">{vehicle.licensePlate}</p>
    {/* 品牌型号 */}
    <p className="text-sm text-gray-500 mt-0.5">{vehicle.brand} {vehicle.model}</p>
    {/* 信息标签 */}
    <div className="flex flex-wrap gap-1.5 mt-3">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600">
        <Users size={10} />
        {vehicle.capacity}座
      </span>
      {vehicle.color && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vehicle.color.toLowerCase() }} />
          {vehicle.color}
        </span>
      )}
      {vehicle.location && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600">
          <MapPin size={10} />
          {vehicle.location}
        </span>
      )}
    </div>
  </div>
);

/** 步骤指示器 */
const StepIndicator: React.FC<{ current: number; steps: string[]; align?: 'left' | 'center' }> = ({ current, steps, align = 'center' }) => (
  <div className={`flex items-center gap-2 ${align === 'left' ? 'justify-start' : 'justify-center'}`}>
    {steps.map((step, i) => (
      <React.Fragment key={i}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
            i < current ? 'bg-pink-400 text-white' :
            i === current ? 'bg-pink-400 text-white ring-4 ring-pink-50' :
            'bg-gray-200 text-gray-500'
          }`}>
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          <span className={`text-sm hidden sm:inline ${i === current ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
            {step}
          </span>
        </div>
        {i < steps.length - 1 && (
          <ChevronRight size={16} className="text-gray-300 mx-1" />
        )}
      </React.Fragment>
    ))}
  </div>
);

export const VehicleBooking: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: vehicles, loading, error } = useAsyncData<SysVehicle[]>(() => getAvailableVehicles());

  // 步骤控制
  const [step, setStep] = useState(0);
  const steps = ['选择车辆', '填写信息', '确认提交'];

  // 搜索过滤
  const [searchText, setSearchText] = useState('');
  const [capacityFilter, setCapacityFilter] = useState('all');

  // 表单数据
  const [formData, setFormData] = useState({
    vehicleId: '',
    startTime: '',
    endTime: '',
    destination: '',
    returnLocation: '',
    isRoundTrip: 0,
    reason: '',
    passengerCount: 1,
    passengers: '',
    attachmentUrl: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // 过滤后的车辆列表
  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter(v => {
      const matchSearch = !searchText ||
        v.licensePlate.toLowerCase().includes(searchText.toLowerCase()) ||
        v.brand.toLowerCase().includes(searchText.toLowerCase()) ||
        v.model.toLowerCase().includes(searchText.toLowerCase());
      const matchCapacity = capacityFilter === 'all' ||
        (capacityFilter === 'small' && v.capacity <= 5) ||
        (capacityFilter === 'medium' && v.capacity > 5 && v.capacity <= 7) ||
        (capacityFilter === 'large' && v.capacity > 7);
      return matchSearch && matchCapacity;
    });
  }, [vehicles, searchText, capacityFilter]);

  // 选中的车辆
  const selectedVehicle = useMemo(() => {
    return vehicles?.find(v => String(v.vehicleId) === formData.vehicleId) || null;
  }, [vehicles, formData.vehicleId]);

  // 表单验证
  const canProceedToStep2 = !!formData.vehicleId;
  const canProceedToStep3 = !!(
    formData.startTime && formData.endTime && formData.destination && formData.reason
  );

  const roundTripLabel = formData.isRoundTrip ? '往返' : '单程';

  // 时间验证
  const timeError = useMemo(() => {
    if (formData.startTime && formData.endTime) {
      const start = new Date(formData.startTime);
      const end = new Date(formData.endTime);
      if (end <= start) return '结束时间必须晚于开始时间';
      const now = new Date();
      if (start < now) return '开始时间不能早于当前时间';
    }
    return '';
  }, [formData.startTime, formData.endTime]);

  // 提交
  const handleSubmit = async () => {
    if (!user) return;
    if (timeError) {
      toast.error(timeError);
      return;
    }
    setSubmitting(true);
    try {
      await submitUsage({
        vehicleId: parseInt(formData.vehicleId),
        applicantId: parseInt(user.id),
        startTime: toBackendDateString(formData.startTime),
        endTime: toBackendDateString(formData.endTime),
        destination: formData.destination,
        returnLocation: formData.returnLocation,
        isRoundTrip: formData.isRoundTrip,
        reason: formData.reason,
        passengerCount: formData.passengerCount,
        passengers: formData.passengers,
        attachmentUrl: formData.attachmentUrl,
      });
      toast.success('用车申请已提交，请等待审批');
      navigate('/admin/vehicle/usage');
    } catch (error) {
      toast.error(getErrorMessage(error, '提交失败，该时段可能已被预约'));
    } finally {
      setSubmitting(false);
    }
  };

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin mx-auto text-pink-400" size={32} />
          <p className="text-gray-500">正在加载可用车辆...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <AlertCircle size={40} className="mx-auto text-red-400" />
              <p className="text-red-500">加载失败: {error.message}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>重试</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 无可用车辆
  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-3">
              <Car size={48} className="mx-auto text-gray-300" strokeWidth={1} />
              <p className="text-gray-500 text-lg">暂无可用车辆</p>
              <p className="text-gray-400 text-sm">所有车辆当前均已被预约或不可用</p>
              <Button variant="outline" onClick={() => navigate('/admin/vehicle')}>
                查看车辆列表
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stepTips: Record<number, string> = {
    0: '选择车辆后可继续填写用车信息。',
    1: '请确认时间与目的地信息准确无误。',
    2: '提交后进入审批流程，可在用车记录中查看进度。',
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="rounded-2xl border border-pink-100/70 bg-gradient-to-r from-pink-50 via-white to-amber-50 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">公务车预约申请</h1>
              <p className="text-sm text-gray-500 mt-1">选择车辆并填写用车信息，提交后等待审批</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="px-3 py-1 rounded-full bg-white/80 border border-pink-100">可用车辆 {vehicles.length} 辆</span>
              <span className="px-3 py-1 rounded-full bg-white/80 border border-pink-100">当前步骤 {step + 1}/3</span>
            </div>
          </div>
          <div className="mt-4">
            <StepIndicator current={step} steps={steps} align="left" />
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-6">
            {/* 步骤1：选择车辆 */}
            {step === 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Car size={20} />
                    选择车辆
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      共 {vehicles.length} 辆可用
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 搜索和筛选 */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        placeholder="搜索车牌号、品牌、型号..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                      <SelectTrigger className="w-full sm:w-32">
                        <SelectValue placeholder="座位数" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="small">5座及以下</SelectItem>
                        <SelectItem value="medium">6-7座</SelectItem>
                        <SelectItem value="large">7座以上</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 车辆网格 */}
                  {filteredVehicles.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <Car size={32} className="mx-auto mb-2" strokeWidth={1} />
                      <p>没有匹配的车辆</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                      {filteredVehicles.map((v) => (
                        <VehicleCard
                          key={v.vehicleId}
                          vehicle={v}
                          selected={String(v.vehicleId) === formData.vehicleId}
                          onSelect={() => setFormData({ ...formData, vehicleId: String(v.vehicleId) })}
                        />
                      ))}
                    </div>
                  )}

                  {/* 下一步 */}
                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={() => setStep(1)}
                      disabled={!canProceedToStep2}
                      className="gap-1"
                    >
                      下一步
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 步骤2：填写信息 */}
            {step === 1 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText size={20} />
                    填写用车信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* 已选车辆提示 */}
                  {selectedVehicle && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-pink-50 border border-pink-100">
                      <Car size={18} className="text-pink-500" />
                      <span className="text-sm">
                        已选车辆：
                        <span className="font-mono font-bold ml-1">{selectedVehicle.licensePlate}</span>
                        <span className="text-gray-500 ml-2">{selectedVehicle.brand} {selectedVehicle.model}</span>
                      </span>
                      <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setStep(0)}>
                        更换
                      </Button>
                    </div>
                  )}

                  {/* 时间选择 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        <Calendar size={14} />
                        开始时间 <span className="text-red-500">*</span>
                      </Label>
                      <DatePicker
                        type="datetime-local"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        <Calendar size={14} />
                        结束时间 <span className="text-red-500">*</span>
                      </Label>
                      <DatePicker
                        type="datetime-local"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                  {timeError && (
                    <p className="text-red-500 text-sm flex items-center gap-1">
                      <AlertCircle size={14} />
                      {timeError}
                    </p>
                  )}

                  {/* 目的地 & 还车地点 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        <MapPin size={14} />
                        目的地 <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        placeholder="请输入目的地"
                        required
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        <MapPin size={14} />
                        还车地点
                      </Label>
                      <Input
                        placeholder="默认原地还车"
                        value={formData.returnLocation}
                        onChange={(e) => setFormData({ ...formData, returnLocation: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 是否往返 */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      <ArrowLeftRight size={14} />
                      行程类型
                    </Label>
                    <div className="flex gap-4">
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${formData.isRoundTrip === 0 ? 'border-pink-400 bg-pink-50 text-pink-600' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="roundTrip" className="hidden" checked={formData.isRoundTrip === 0} onChange={() => setFormData({ ...formData, isRoundTrip: 0 })} />
                        <span className="text-sm font-medium">单程</span>
                      </label>
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${formData.isRoundTrip === 1 ? 'border-pink-400 bg-pink-50 text-pink-600' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="roundTrip" className="hidden" checked={formData.isRoundTrip === 1} onChange={() => setFormData({ ...formData, isRoundTrip: 1 })} />
                        <span className="text-sm font-medium">往返</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      <FileText size={14} />
                      用车事由 <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      className="min-h-[80px] resize-none"
                      placeholder="请详细描述用车事由..."
                      required
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    />
                  </div>

                  {/* 附件上传 */}
                  <div className="space-y-1.5">
                    <Label>附件</Label>
                    <FileUpload
                      value={formData.attachmentUrl}
                      onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                      maxCount={3}
                      hint="可上传行程单、审批文件等，最多3个文件"
                    />
                  </div>

                  {/* 随行人员 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        <Users size={14} />
                        随行人数
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={selectedVehicle?.capacity || 50}
                        value={formData.passengerCount}
                        onChange={(e) => setFormData({ ...formData, passengerCount: parseInt(e.target.value) || 1 })}
                      />
                      {selectedVehicle && formData.passengerCount > selectedVehicle.capacity && (
                        <p className="text-amber-500 text-xs">超出车辆座位数 ({selectedVehicle.capacity}座)</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>随行人员名单</Label>
                      <Input
                        placeholder="如：张三, 李四"
                        value={formData.passengers}
                        onChange={(e) => setFormData({ ...formData, passengers: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep(0)}>上一步</Button>
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!canProceedToStep3 || !!timeError}
                      className="gap-1"
                    >
                      下一步
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 步骤3：确认提交 */}
            {step === 2 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle size={20} />
                    确认申请信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* 信息汇总 */}
                  <div className="rounded-lg border divide-y">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4">
                      <div>
                        <span className="text-xs text-gray-400">车辆</span>
                        <p className="font-mono font-bold">{selectedVehicle?.licensePlate}</p>
                        <p className="text-xs text-gray-500">{selectedVehicle?.brand} {selectedVehicle?.model}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">目的地</span>
                        <p className="font-medium">{formData.destination}</p>
                        {formData.returnLocation && <p className="text-xs text-gray-500">还车: {formData.returnLocation}</p>}
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">行程 / 人数</span>
                        <p className="font-medium">{roundTripLabel} · {formData.passengerCount}人</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                      <div>
                        <span className="text-xs text-gray-400">开始时间</span>
                        <p className="font-medium text-sm">{formData.startTime.replace('T', ' ')}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">结束时间</span>
                        <p className="font-medium text-sm">{formData.endTime.replace('T', ' ')}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <span className="text-xs text-gray-400">用车事由</span>
                      <p className="font-medium text-sm mt-1">{formData.reason}</p>
                    </div>
                    {formData.passengers && (
                      <div className="p-4">
                        <span className="text-xs text-gray-400">随行人员</span>
                        <p className="font-medium text-sm mt-1">{formData.passengers}</p>
                      </div>
                    )}
                  </div>

                  {/* 提示 */}
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>提交后将进入审批流程，审批通过后方可使用车辆。如需取消请在审批前操作。</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep(1)}>上一步</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="gap-2 min-w-[120px]">
                      {submitting ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          提交中...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={16} />
                          确认提交
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧摘要栏 */}
          <div className="space-y-4 lg:sticky lg:top-24 h-fit">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">申请摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs text-gray-400 mb-2">当前步骤</div>
                  <div className="space-y-2">
                    {steps.map((s, i) => (
                      <div key={s} className={`flex items-center gap-2 text-sm ${i === step ? 'text-pink-600 font-medium' : i < step ? 'text-gray-700' : 'text-gray-400'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          i < step ? 'bg-pink-500 text-white' : i === step ? 'bg-pink-50 text-pink-600 border border-pink-200' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {i < step ? <CheckCircle size={12} /> : i + 1}
                        </div>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="text-xs text-gray-400 mb-2">已选车辆</div>
                  {selectedVehicle ? (
                    <div className="text-sm">
                      <div className="font-mono font-semibold">{selectedVehicle.licensePlate}</div>
                      <div className="text-gray-500">{selectedVehicle.brand} {selectedVehicle.model}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-gray-600">
                        <span className="px-2 py-0.5 rounded-md bg-gray-100">{selectedVehicle.capacity}座</span>
                        {selectedVehicle.color && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-100">{selectedVehicle.color}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">尚未选择车辆</div>
                  )}
                </div>

                <div className="border-t pt-3">
                  <div className="text-xs text-gray-400 mb-2">行程信息</div>
                  {step >= 1 ? (
                    <div className="space-y-1 text-sm">
                      <div className="text-gray-700">{formData.destination || '未填写目的地'}</div>
                      <div className="text-xs text-gray-500">{formData.startTime ? formData.startTime.replace('T', ' ') : '开始时间未填写'}</div>
                      <div className="text-xs text-gray-500">{formData.endTime ? formData.endTime.replace('T', ' ') : '结束时间未填写'}</div>
                      {timeError && <div className="text-xs text-red-500">{timeError}</div>}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">填写信息后显示</div>
                  )}
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-gray-600">
                  {stepTips[step]}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleBooking;
