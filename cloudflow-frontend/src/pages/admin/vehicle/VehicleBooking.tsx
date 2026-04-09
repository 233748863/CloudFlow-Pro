import React, { useState, useMemo } from 'react';
import {
  Car, Loader2, MapPin, Users, Calendar, FileText, Clock,
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
import { WorkspaceBackdrop, WorkspaceEmptyPanel } from '@/components/workspace/WorkspacePrimitives';
import { WorkspaceHeroCard } from '@/components/workspace/WorkspacePanels';

/** 车辆卡片组件 */
const VehicleCard: React.FC<{
  vehicle: SysVehicle;
  selected: boolean;
  onSelect: () => void;
}> = ({ vehicle, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={`group relative cursor-pointer overflow-hidden rounded-[22px] border p-4 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 ${
      selected
        ? 'border-pink-200 bg-[linear-gradient(135deg,rgba(253,242,248,0.94),rgba(255,255,255,0.84),rgba(255,241,242,0.82))] shadow-[0_16px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]'
        : 'border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))] shadow-[0_14px_30px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] hover:border-slate-200/80'
    }`}
  >
    <div className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-br ${selected ? 'from-pink-100/90 via-rose-50/45 to-transparent' : 'from-slate-100/95 via-slate-50/40 to-transparent'}`} />
    <div className="pointer-events-none absolute inset-[1px] rounded-[21px] bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.12)_38%,transparent_100%)] opacity-80" />
    <div className="relative">
    {/* 选中标记 */}
    {selected && (
      <div className="absolute top-2 right-2">
        <CheckCircle size={20} className="text-pink-400" />
      </div>
    )}
    {/* 车辆图标 */}
    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-[14px] ${
      selected ? 'bg-white/88 text-pink-500 ring-1 ring-pink-100 shadow-[0_10px_22px_rgba(236,72,153,0.08)]' : 'bg-white/88 text-slate-500 ring-1 ring-slate-200/85 shadow-[0_10px_22px_rgba(15,23,42,0.06)]'
    }`}>
      <Car size={20} />
    </div>
    {/* 车牌号 */}
    <p className="font-mono text-base font-bold text-slate-900">{vehicle.licensePlate}</p>
    {/* 品牌型号 */}
    <p className="mt-0.5 text-sm text-slate-500">{vehicle.brand} {vehicle.model}</p>
    {/* 信息标签 */}
    <div className="flex flex-wrap gap-1.5 mt-3">
      <span className="inline-flex items-center gap-1 rounded-md bg-white/82 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-white/80">
        <Users size={10} />
        {vehicle.capacity}座
      </span>
      {vehicle.color && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/82 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-white/80">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: vehicle.color.toLowerCase() }} />
          {vehicle.color}
        </span>
      )}
      {vehicle.location && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/82 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-white/80">
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
            i < current ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_10px_20px_rgba(236,72,153,0.22)]' :
            i === current ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white ring-4 ring-pink-50/80 shadow-[0_10px_20px_rgba(236,72,153,0.22)]' :
            'bg-white/82 text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]'
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
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const attachmentCount = formData.attachmentUrl
    ? formData.attachmentUrl.split(',').filter(Boolean).length
    : 0;
  const heroMetrics = [
    {
      label: '可用车辆',
      value: `${vehicles.length}`,
      hint: filteredVehicles.length === vehicles.length ? '当前全部可预约车辆' : `当前筛出 ${filteredVehicles.length} 辆`,
      panelClassName: 'border-slate-200/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(248,250,252,0.78))] shadow-[0_16px_32px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.72)]',
      iconWrapClassName: 'bg-white/82 text-slate-700 ring-1 ring-slate-200/85 shadow-[0_10px_22px_rgba(15,23,42,0.06)]',
      glowClassName: 'from-slate-100/95 via-slate-50/40 to-transparent',
      icon: <Car size={17} />,
    },
    {
      label: '当前步骤',
      value: `${step + 1}/3`,
      hint: steps[step],
      panelClassName: 'border-amber-100/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.95),rgba(255,255,255,0.82),rgba(255,247,237,0.82))] shadow-[0_16px_32px_rgba(245,158,11,0.08),inset_0_1px_0_rgba(255,255,255,0.75)]',
      iconWrapClassName: 'bg-white/88 text-amber-700 ring-1 ring-amber-100 shadow-[0_10px_22px_rgba(245,158,11,0.08)]',
      glowClassName: 'from-amber-100/90 via-orange-50/45 to-transparent',
      icon: <Clock size={17} />,
    },
    {
      label: '已选车辆',
      value: selectedVehicle ? selectedVehicle.licensePlate : '--',
      hint: selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : '选择车辆后继续填写信息',
      panelClassName: 'border-pink-100/80 bg-[linear-gradient(135deg,rgba(253,242,248,0.95),rgba(255,255,255,0.82),rgba(255,241,242,0.8))] shadow-[0_16px_32px_rgba(236,72,153,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-pink-600 ring-1 ring-pink-100 shadow-[0_10px_22px_rgba(236,72,153,0.08)]',
      glowClassName: 'from-pink-100/90 via-rose-50/45 to-transparent',
      icon: <CheckCircle size={17} />,
    },
    {
      label: '附件数量',
      value: `${attachmentCount}`,
      hint: attachmentCount > 0 ? '已附加行程单或审批文件' : '可按需上传佐证材料',
      panelClassName: 'border-emerald-100/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.82),rgba(236,254,255,0.78))] shadow-[0_16px_32px_rgba(16,185,129,0.08),inset_0_1px_0_rgba(255,255,255,0.76)]',
      iconWrapClassName: 'bg-white/88 text-emerald-600 ring-1 ring-emerald-100 shadow-[0_10px_22px_rgba(16,185,129,0.08)]',
      glowClassName: 'from-emerald-100/90 via-cyan-50/45 to-transparent',
      icon: <FileText size={17} />,
    },
  ];

  const glassCardClass = 'rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.76))] shadow-[0_18px_44px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-xl';

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-3 px-4 py-4 md:px-6">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Calendar size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="公务车预约申请"
          actions={(
            <div className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
              审批通过后方可使用车辆
            </div>
          )}
          contentClassName="p-4 sm:p-5"
          glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_55%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_46%)]"
        >
          <>
            <div className="rounded-[20px] border border-white/72 bg-white/66 px-3.5 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] backdrop-blur-md">
              <StepIndicator current={step} steps={steps} align="left" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {heroMetrics.map((item) => (
                <div
                  key={item.label}
                  className={`group relative overflow-hidden rounded-[22px] border px-3.5 py-3 backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 ${item.panelClassName}`}
                >
                  <div className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-br ${item.glowClassName}`} />
                  <div className="pointer-events-none absolute inset-[1px] rounded-[21px] bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.12)_38%,transparent_100%)] opacity-80" />
                  <div className="relative flex min-h-[82px] flex-col justify-between gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400/90">{item.label}</div>
                        <div className="mt-1 text-[1.32rem] font-bold tracking-tight text-slate-950">{item.value}</div>
                      </div>
                      <div className={`rounded-[14px] p-2 backdrop-blur-md ${item.iconWrapClassName}`}>
                        {item.icon}
                      </div>
                    </div>
                    <div className="max-w-full truncate text-[10px] leading-4 text-slate-600">{item.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        </WorkspaceHeroCard>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {/* 步骤1：选择车辆 */}
            {step === 0 && (
              <Card className={glassCardClass}>
                <CardHeader className="border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                    <Car size={20} />
                    选择车辆
                    <span className="ml-2 text-sm font-normal text-slate-400">
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
                        className="h-11 rounded-2xl border-white/85 bg-white/78 pl-9 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
                      />
                    </div>
                    <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                      <SelectTrigger className="h-11 w-full rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md sm:w-32">
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
                      variant="glass"
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
                      onClick={() => setStep(1)}
                      disabled={!canProceedToStep2}
                      className="gap-1 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
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
              <Card className={glassCardClass}>
                <CardHeader className="border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                    <FileText size={20} />
                    填写用车信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* 已选车辆提示 */}
                  {selectedVehicle && (
                    <div className="flex items-center gap-3 rounded-[18px] border border-pink-100 bg-[linear-gradient(135deg,rgba(253,242,248,0.92),rgba(255,255,255,0.82))] p-3 shadow-[0_10px_24px_rgba(236,72,153,0.06)]">
                      <Car size={18} className="text-pink-500" />
                      <span className="text-sm">
                        已选车辆：
                        <span className="font-mono font-bold ml-1">{selectedVehicle.licensePlate}</span>
                        <span className="ml-2 text-slate-500">{selectedVehicle.brand} {selectedVehicle.model}</span>
                      </span>
                      <Button variant="ghost" size="sm" className="ml-auto rounded-xl text-xs text-pink-600 hover:bg-white/80" onClick={() => setStep(0)}>
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
                        variant="glass"
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
                        variant="glass"
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
                        className="h-11 rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
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
                        className="h-11 rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
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
                      <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 transition-colors ${formData.isRoundTrip === 0 ? 'border-pink-200 bg-[linear-gradient(135deg,rgba(253,242,248,0.92),rgba(255,255,255,0.82))] text-pink-600 shadow-[0_10px_24px_rgba(236,72,153,0.06)]' : 'border-white/80 bg-white/78 text-slate-600 shadow-[0_10px_22px_rgba(15,23,42,0.04)] hover:border-slate-200/80'}`}>
                        <input type="radio" name="roundTrip" className="hidden" checked={formData.isRoundTrip === 0} onChange={() => setFormData({ ...formData, isRoundTrip: 0 })} />
                        <span className="text-sm font-medium">单程</span>
                      </label>
                      <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 transition-colors ${formData.isRoundTrip === 1 ? 'border-pink-200 bg-[linear-gradient(135deg,rgba(253,242,248,0.92),rgba(255,255,255,0.82))] text-pink-600 shadow-[0_10px_24px_rgba(236,72,153,0.06)]' : 'border-white/80 bg-white/78 text-slate-600 shadow-[0_10px_22px_rgba(15,23,42,0.04)] hover:border-slate-200/80'}`}>
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
                      className="min-h-[96px] resize-none rounded-[22px] border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
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
                      variant="glass"
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
                        className="h-11 rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
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
                        className="h-11 rounded-2xl border-white/85 bg-white/78 shadow-[0_10px_22px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md"
                      />
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep(0)} className="rounded-2xl border-white/85 bg-white/76 shadow-[0_10px_20px_rgba(15,23,42,0.04)] hover:bg-white">上一步</Button>
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!canProceedToStep3 || !!timeError}
                      className="gap-1 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600"
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
              <Card className={glassCardClass}>
                <CardHeader className="border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                    <CheckCircle size={20} />
                    确认申请信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* 信息汇总 */}
                  <div className="divide-y overflow-hidden rounded-[22px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
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
                  <div className="flex items-start gap-2 rounded-[18px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.95),rgba(255,247,237,0.88))] p-3 text-sm text-amber-700 shadow-[0_10px_24px_rgba(245,158,11,0.06)]">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>提交后将进入审批流程，审批通过后方可使用车辆。如需取消请在审批前操作。</span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-between pt-2">
                    <Button variant="outline" onClick={() => setStep(1)} className="rounded-2xl border-white/85 bg-white/76 shadow-[0_10px_20px_rgba(15,23,42,0.04)] hover:bg-white">上一步</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="min-w-[120px] gap-2 rounded-2xl bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_12px_22px_rgba(236,72,153,0.22)] hover:bg-pink-600">
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
            <Card className={glassCardClass}>
              <CardHeader className="border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] pb-3">
                <CardTitle className="text-base text-slate-900">申请摘要</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 text-xs text-slate-400">当前步骤</div>
                  <div className="space-y-2">
                    {steps.map((s, i) => (
                      <div key={s} className={`flex items-center gap-2 text-sm ${i === step ? 'font-medium text-pink-600' : i < step ? 'text-slate-700' : 'text-slate-400'}`}>
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          i < step ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white' : i === step ? 'border border-pink-200 bg-pink-50 text-pink-600' : 'bg-white/82 text-slate-400 ring-1 ring-white/80'
                        }`}>
                          {i < step ? <CheckCircle size={12} /> : i + 1}
                        </div>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/70 pt-3">
                  <div className="mb-2 text-xs text-slate-400">已选车辆</div>
                  {selectedVehicle ? (
                    <div className="text-sm">
                      <div className="font-mono font-semibold text-slate-900">{selectedVehicle.licensePlate}</div>
                      <div className="text-slate-500">{selectedVehicle.brand} {selectedVehicle.model}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-600">
                        <span className="rounded-md bg-white/82 px-2 py-0.5 ring-1 ring-white/80">{selectedVehicle.capacity}座</span>
                        {selectedVehicle.color && (
                          <span className="rounded-md bg-white/82 px-2 py-0.5 ring-1 ring-white/80">{selectedVehicle.color}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">尚未选择车辆</div>
                  )}
                </div>

                <div className="border-t border-white/70 pt-3">
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

                <div className="rounded-[18px] border border-white/80 bg-white/72 p-3 text-xs text-slate-600 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
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
