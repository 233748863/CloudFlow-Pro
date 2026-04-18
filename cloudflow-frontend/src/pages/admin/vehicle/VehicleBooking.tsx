import React, { useState, useMemo } from 'react';
import {
  Car, Loader2, MapPin, Users, Calendar, FileText, Clock,
  CheckCircle, AlertCircle, ChevronRight, Search, ArrowLeftRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { toBackendDateString } from '@/utils/dateFormat';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useAsyncData } from '@/hooks/useAsyncData';
import { FileUpload } from '@/components/FileUpload';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  WorkspaceBackdrop,
  WorkspaceEmptyPanel,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceSectionCard,
  WorkspaceStatusPage,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

/** 车辆卡片组件 */
const VehicleCard: React.FC<{
  vehicle: SysVehicle;
  selected: boolean;
  onSelect: () => void;
}> = ({ vehicle, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 ${
      selected
        ? 'border-slate-300 bg-slate-50 shadow-md'
        : 'border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md'
    }`}
  >
    <div>
    {/* 选中标记 */}
    {selected && (
      <div className="absolute top-2 right-2">
        <CheckCircle size={20} className="text-slate-600" />
      </div>
    )}
    {/* 车辆图标 */}
    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border ${
      selected ? 'border-slate-300 bg-white text-slate-700 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-500'
    }`}>
      <Car size={20} />
    </div>
    {/* 车牌号 */}
    <p className="font-mono text-base font-bold text-slate-900">{vehicle.licensePlate}</p>
    {/* 品牌型号 */}
    <p className="mt-0.5 text-sm text-slate-500">{vehicle.brand} {vehicle.model}</p>
    {/* 信息标签 */}
    <div className="flex flex-wrap gap-1.5 mt-3">
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
        <Users size={10} />
        {vehicle.capacity}座
      </span>
      {vehicle.color && (
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vehicle.color.toLowerCase() }} />
          {vehicle.color}
        </span>
      )}
      {vehicle.location && (
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
          <MapPin size={10} />
          {vehicle.location}
        </span>
      )}
    </div>
    </div>
  </div>
);

/** 步骤指示器 */
const StepIndicator: React.FC<{ current: number; steps: string[]; align?: 'left' | 'center' }> = ({ current, steps, align = 'center' }) => (
  <div className={`flex items-center gap-2 ${align === 'left' ? 'justify-start' : 'justify-center'}`}>
    {steps.map((step, i) => (
      <React.Fragment key={i}>
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
            i < current ? 'bg-slate-900 text-white' :
            i === current ? 'border border-slate-300 bg-white text-slate-900 shadow-sm' :
            'border border-slate-200 bg-slate-50 text-slate-400'
          }`}>
            {i < current ? <CheckCircle size={16} /> : i + 1}
          </div>
          <span className={`hidden text-sm sm:inline ${i === current ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
            {step}
          </span>
        </div>
        {i < steps.length - 1 && (
          <ChevronRight size={16} className="mx-1 text-slate-300" />
        )}
      </React.Fragment>
    ))}
  </div>
);

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

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
      <WorkspaceStatusPage
        icon={<Loader2 className="animate-spin text-slate-500" size={32} />}
        title="正在加载可用车辆"
        description="正在同步当前时段可预约的车辆资源，请稍候。"
        iconWrapClassName="text-slate-500"
      />
    );
  }

  // 错误状态
  if (error) {
    return (
      <WorkspaceStatusPage
        icon={<AlertCircle size={34} className="text-rose-500" />}
        title="加载车辆失败"
        description={`当前无法读取可用车辆信息：${error.message}`}
        iconWrapClassName="text-rose-500"
        actions={(
          <Button variant="outline" size="lg" onClick={() => window.location.reload()}>
            重试
          </Button>
        )}
      />
    );
  }

  // 无可用车辆
  if (!vehicles || vehicles.length === 0) {
    return (
      <WorkspaceStatusPage
        icon={<Car size={34} className="text-slate-400" strokeWidth={1.8} />}
        title="暂无可用车辆"
        description="所有车辆当前均已被预约或暂不可用，你也可以先前往车辆列表查看库存状态。"
        actions={(
          <Button variant="outline" size="lg" onClick={() => navigate('/admin/vehicle')}>
            查看车辆列表
          </Button>
        )}
      />
    );
  }

  const stepTips: Record<number, string> = {
    0: '选择车辆后可继续填写用车信息。',
    1: '请确认时间与目的地信息准确无误。',
    2: '提交后进入审批流程，可在用车记录中查看进度。',
  };
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const attachmentCount = formData.attachmentUrl
    ? formData.attachmentUrl.split(',').filter(Boolean).length
    : 0;
  const hasVehicleFilters = !!searchText || capacityFilter !== 'all';
  const heroMetrics = [
    {
      label: '可用车辆',
      value: `${vehicles.length}`,
      hint: filteredVehicles.length === vehicles.length ? '当前全部可预约车辆' : `当前筛出 ${filteredVehicles.length} 辆`,
      icon: <Car size={17} />,
    },
    {
      label: '当前步骤',
      value: `${step + 1}/3`,
      hint: steps[step],
      icon: <Clock size={17} />,
    },
    {
      label: '已选车辆',
      value: selectedVehicle ? selectedVehicle.licensePlate : '--',
      hint: selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : '选择车辆后继续填写信息',
      icon: <CheckCircle size={17} />,
    },
    {
      label: '附件数量',
      value: `${attachmentCount}`,
      hint: attachmentCount > 0 ? '已附加行程单或审批文件' : '可按需上传佐证材料',
      icon: <FileText size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Calendar size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="公务车预约申请"
          actions={(
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
              审批通过后方可使用车辆
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <StepIndicator current={step} steps={steps} align="left" />
              </div>
            </Card>

            {/* 步骤1：选择车辆 */}
            {step === 0 && (
              <WorkspaceSectionCard
                title="选择车辆"
                description="先挑选合适的公务车，再继续填写用车信息。"
                headerAside={(
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    {hasVehicleFilters ? `已筛出 ${filteredVehicles.length} / ${vehicles.length} 辆` : `共 ${vehicles.length} 辆可用`}
                  </div>
                )}
                bodyClassName="space-y-4"
              >
                  {/* 搜索和筛选 */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="搜索车牌号、品牌、型号..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="h-11 rounded-2xl pl-9"
                      />
                    </div>
                    <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                      <SelectTrigger className="h-11 w-full rounded-2xl sm:w-32">
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
                    <WorkspaceEmptyPanel
                      icon={<Car size={26} />}
                      title="没有匹配的车辆"
                      description="试试调整搜索关键词或座位筛选范围。"
                    />
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
                      size="lg"
                      onClick={() => setStep(1)}
                      disabled={!canProceedToStep2}
                      className="gap-1"
                    >
                      下一步
                      <ChevronRight size={16} />
                    </Button>
                  </div>
              </WorkspaceSectionCard>
            )}

            {/* 步骤2：填写信息 */}
            {step === 1 && (
              <WorkspaceSectionCard
                title="填写用车信息"
                description="补充时间、目的地、乘车人数和申请说明。"
                bodyClassName="space-y-5"
              >
                  {/* 已选车辆提示 */}
                  {selectedVehicle && (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <Car size={18} className="text-slate-500" />
                      <span className="text-sm">
                        已选车辆：
                        <span className="font-mono font-bold ml-1">{selectedVehicle.licensePlate}</span>
                        <span className="ml-2 text-slate-500">{selectedVehicle.brand} {selectedVehicle.model}</span>
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
                        className="h-11 rounded-2xl"
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
                        className="h-11 rounded-2xl"
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
                        className="h-11 rounded-2xl"
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
                        className="h-11 rounded-2xl"
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
                      <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 transition-colors ${formData.isRoundTrip === 0 ? 'border-slate-300 bg-slate-50 text-slate-900 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <input type="radio" name="roundTrip" className="hidden" checked={formData.isRoundTrip === 0} onChange={() => setFormData({ ...formData, isRoundTrip: 0 })} />
                        <span className="text-sm font-medium">单程</span>
                      </label>
                      <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 transition-colors ${formData.isRoundTrip === 1 ? 'border-slate-300 bg-slate-50 text-slate-900 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
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
                      className="min-h-[96px] resize-none rounded-2xl"
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
                        className="h-11 rounded-2xl"
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
                        className="h-11 rounded-2xl"
                      />
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" size="lg" onClick={() => setStep(0)}>上一步</Button>
                    <Button
                      size="lg"
                      onClick={() => setStep(2)}
                      disabled={!canProceedToStep3 || !!timeError}
                      className="gap-1"
                    >
                      下一步
                      <ChevronRight size={16} />
                    </Button>
                  </div>
              </WorkspaceSectionCard>
            )}

            {/* 步骤3：确认提交 */}
            {step === 2 && (
              <WorkspaceSectionCard
                title="确认申请信息"
                description="提交前最后确认车辆、时间和申请内容。"
                bodyClassName="space-y-5"
              >
                  {/* 信息汇总 */}
                  <div className="divide-y overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                      <div>
                        <span className="text-xs text-slate-400">车辆</span>
                        <p className="font-mono font-bold text-slate-900">{selectedVehicle?.licensePlate}</p>
                        <p className="text-xs text-slate-500">{selectedVehicle?.brand} {selectedVehicle?.model}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400">目的地</span>
                        <p className="font-medium text-slate-900">{formData.destination}</p>
                        {formData.returnLocation && <p className="text-xs text-slate-500">还车: {formData.returnLocation}</p>}
                      </div>
                      <div>
                        <span className="text-xs text-slate-400">行程 / 人数</span>
                        <p className="font-medium text-slate-900">{roundTripLabel} · {formData.passengerCount}人</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                      <div>
                        <span className="text-xs text-slate-400">开始时间</span>
                        <p className="text-sm font-medium text-slate-900">{formData.startTime.replace('T', ' ')}</p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400">结束时间</span>
                        <p className="text-sm font-medium text-slate-900">{formData.endTime.replace('T', ' ')}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <span className="text-xs text-slate-400">用车事由</span>
                      <p className="mt-1 text-sm font-medium text-slate-900">{formData.reason}</p>
                    </div>
                    {formData.passengers && (
                      <div className="p-4">
                        <span className="text-xs text-slate-400">随行人员</span>
                        <p className="mt-1 text-sm font-medium text-slate-900">{formData.passengers}</p>
                      </div>
                    )}
                  </div>

                  {/* 提示 */}
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>提交后将进入审批流程，审批通过后方可使用车辆。如需取消请在审批前操作。</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" size="lg" onClick={() => setStep(1)}>上一步</Button>
                    <Button size="lg" onClick={handleSubmit} disabled={submitting} className="min-w-[120px] gap-2">
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
              </WorkspaceSectionCard>
            )}
          </div>

          {/* 右侧摘要栏 */}
          <div className="space-y-4 lg:sticky lg:top-24 h-fit">
            <WorkspaceSectionCard
              title="申请摘要"
              description="跟随步骤查看当前已填写内容和提醒。"
              eyebrow="Summary"
              bodyClassName="space-y-4"
            >
                <div>
                  <div className="mb-2 text-xs text-slate-400">当前步骤</div>
                  <div className="space-y-2">
                    {steps.map((s, i) => (
                      <div key={s} className={`flex items-center gap-2 text-sm ${i === step ? 'font-medium text-slate-900' : i < step ? 'text-slate-700' : 'text-slate-400'}`}>
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          i < step ? 'bg-slate-900 text-white' : i === step ? 'border border-slate-300 bg-white text-slate-900' : 'border border-slate-200 bg-slate-50 text-slate-400'
                        }`}>
                          {i < step ? <CheckCircle size={12} /> : i + 1}
                        </div>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <div className="mb-2 text-xs text-slate-400">已选车辆</div>
                  {selectedVehicle ? (
                    <div className="text-sm">
                      <div className="font-mono font-semibold text-slate-900">{selectedVehicle.licensePlate}</div>
                      <div className="text-slate-500">{selectedVehicle.brand} {selectedVehicle.model}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-600">
                        <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{selectedVehicle.capacity}座</span>
                        {selectedVehicle.color && (
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{selectedVehicle.color}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">尚未选择车辆</div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <div className="mb-2 text-xs text-slate-400">行程信息</div>
                  {step >= 1 ? (
                    <div className="space-y-1 text-sm">
                      <div className="text-slate-700">{formData.destination || '未填写目的地'}</div>
                      <div className="text-xs text-slate-500">{formData.startTime ? formData.startTime.replace('T', ' ') : '开始时间未填写'}</div>
                      <div className="text-xs text-slate-500">{formData.endTime ? formData.endTime.replace('T', ' ') : '结束时间未填写'}</div>
                      {timeError && <div className="text-xs text-red-500">{timeError}</div>}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">填写信息后显示</div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {stepTips[step]}
                </div>
            </WorkspaceSectionCard>
          </div>
        </div>
      </WorkspacePageContent>
    </div>
  );
};

export default VehicleBooking;
