import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Car,
  CheckCircle,
  ChevronRight,
  Loader2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/ui';
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { toBackendDateString } from '@/utils/dateFormat';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { getErrorMessage } from '@/utils/errorMessage';

interface InlineStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

interface SummaryFieldProps {
  label: string;
  value: React.ReactNode;
}

const InlineState: React.FC<InlineStateProps> = ({
  title,
  description,
  icon,
  action,
}) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      {icon || <Car size={18} />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
    {action ? <div className="mt-5">{action}</div> : null}
  </div>
);

const VehicleCard: React.FC<{
  vehicle: SysVehicle;
  selected: boolean;
  onSelect: () => void;
}> = ({ vehicle, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className={[
      'w-full rounded-xl border px-4 py-3 text-left transition-colors',
      selected
        ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/20'
        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:border-slate-700',
    ].join(' ')}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
          {vehicle.licensePlate}
        </div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {vehicle.brand} {vehicle.model}
        </div>
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {vehicle.capacity} 座
          {vehicle.location ? ` · ${vehicle.location}` : ''}
          {vehicle.color ? ` · ${vehicle.color}` : ''}
        </div>
      </div>
      {selected ? <CheckCircle size={16} className="shrink-0 text-cyan-600 dark:text-cyan-300" /> : null}
    </div>
  </button>
);

const StepPills: React.FC<{ current: number; steps: string[] }> = ({ current, steps }) => (
  <div className="flex flex-wrap gap-2">
    {steps.map((step, index) => (
      <div
        key={step}
        className={[
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs',
          index === current
            ? 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
            : index < current
              ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
              : 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-500',
        ].join(' ')}
      >
        <span className="font-medium">{index + 1}</span>
        <span>{step}</span>
      </div>
    ))}
  </div>
);

const SummaryField: React.FC<SummaryFieldProps> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
    <div className="text-xs font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

export const VehicleBooking: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<SysVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [step, setStep] = useState(0);
  const steps = ['选择车辆', '填写信息', '确认提交'];
  const [searchText, setSearchText] = useState('');
  const [capacityFilter, setCapacityFilter] = useState('all');
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

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await getAvailableVehicles();
      setVehicles(result || []);
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载车辆失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const matchSearch = !searchText ||
        vehicle.licensePlate.toLowerCase().includes(searchText.toLowerCase()) ||
        vehicle.brand.toLowerCase().includes(searchText.toLowerCase()) ||
        vehicle.model.toLowerCase().includes(searchText.toLowerCase());
      const matchCapacity = capacityFilter === 'all' ||
        (capacityFilter === 'small' && vehicle.capacity <= 5) ||
        (capacityFilter === 'medium' && vehicle.capacity > 5 && vehicle.capacity <= 7) ||
        (capacityFilter === 'large' && vehicle.capacity > 7);
      return matchSearch && matchCapacity;
    });
  }, [vehicles, searchText, capacityFilter]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => String(vehicle.vehicleId) === formData.vehicleId) || null,
    [vehicles, formData.vehicleId],
  );

  const canProceedToStep2 = Boolean(formData.vehicleId);
  const canProceedToStep3 = Boolean(
    formData.startTime && formData.endTime && formData.destination && formData.reason,
  );
  const attachmentCount = formData.attachmentUrl
    ? formData.attachmentUrl.split(',').filter(Boolean).length
    : 0;

  const timeError = useMemo(() => {
    if (formData.startTime && formData.endTime) {
      const start = new Date(formData.startTime);
      const end = new Date(formData.endTime);
      if (end <= start) return '结束时间必须晚于开始时间';
      if (start < new Date()) return '开始时间不能早于当前时间';
    }
    return '';
  }, [formData.endTime, formData.startTime]);

  const handleSubmit = async () => {
    if (!user) {
      return;
    }
    if (timeError) {
      toast.error(timeError);
      return;
    }

    setSubmitting(true);
    try {
      await submitUsage({
        vehicleId: parseInt(formData.vehicleId, 10),
        applicantId: parseInt(user.id, 10),
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

  const currentStepTitle = steps[step];
  const currentStepMeta = loading
    ? '同步当前可预约车辆'
    : loadError
      ? '车辆资源加载失败'
      : vehicles.length === 0
        ? '当前暂无可预约车辆'
        : step === 0
          ? (searchText || capacityFilter !== 'all'
              ? `已筛出 ${filteredVehicles.length} / ${vehicles.length} 辆`
              : `可预约 ${vehicles.length} 辆`)
          : step === 1
            ? `已选 ${selectedVehicle?.licensePlate || '--'} · 附件 ${attachmentCount}`
            : `已选 ${selectedVehicle?.licensePlate || '--'} · 提交后进入审批`;
  const selectedVehicleSummary = selectedVehicle
    ? `${selectedVehicle.brand} ${selectedVehicle.model || ''} · ${selectedVehicle.capacity} 座${selectedVehicle.location ? ` · ${selectedVehicle.location}` : ''}`
    : '--';

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Car className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Vehicle Booking
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          公务车预约申请
        </h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{currentStepTitle}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{currentStepMeta}</div>
          </div>
          {!loading && !loadError && vehicles.length > 0 ? <StepPills current={step} steps={steps} /> : null}
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <InlineState
              title="正在加载可用车辆"
              description="同步当前时段可预约的车辆资源。"
              icon={<Loader2 className="animate-spin text-slate-500" size={18} />}
            />
          ) : loadError ? (
            <InlineState
              title="加载车辆失败"
              description={loadError}
              icon={<AlertCircle className="text-rose-500" size={18} />}
              action={<Button variant="outline" onClick={() => void loadVehicles()}>重试</Button>}
            />
          ) : vehicles.length === 0 ? (
            <InlineState
              title="暂无可用车辆"
              description="所有车辆当前均已被预约或暂不可用。"
              action={<Button variant="outline" onClick={() => navigate('/admin/vehicle')}>查看车辆列表</Button>}
            />
          ) : (
            <>
              {step === 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-1 flex-wrap items-center gap-3">
                      <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="搜索车牌号、品牌、型号"
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          className="h-11 pl-9"
                        />
                      </div>
                      <div className="w-full sm:w-36">
                        <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                          <SelectTrigger className="h-11">
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
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {searchText || capacityFilter !== 'all'
                          ? `已筛出 ${filteredVehicles.length} / ${vehicles.length} 辆`
                          : `可预约 ${vehicles.length} 辆`}
                      </div>
                    </div>
                    {selectedVehicle ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        已选 {selectedVehicle.licensePlate}
                      </div>
                    ) : null}
                  </div>

                  {filteredVehicles.length === 0 ? (
                    <InlineState
                      title="没有匹配的车辆"
                      description="调整搜索条件后重试。"
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredVehicles.map((vehicle) => (
                        <VehicleCard
                          key={vehicle.vehicleId}
                          vehicle={vehicle}
                          selected={String(vehicle.vehicleId) === formData.vehicleId}
                          onSelect={() => setFormData({ ...formData, vehicleId: String(vehicle.vehicleId) })}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={() => setStep(1)} disabled={!canProceedToStep2}>
                      下一步
                      <ChevronRight size={16} className="ml-1.5" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {selectedVehicle?.licensePlate}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {selectedVehicleSummary}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setStep(0)}>
                      更换
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>开始时间</Label>
                      <DatePicker
                        className="h-11"
                        type="datetime-local"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>结束时间</Label>
                      <DatePicker
                        className="h-11"
                        type="datetime-local"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      />
                    </div>
                  </div>

                  {timeError ? (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                      <AlertCircle size={16} />
                      {timeError}
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>目的地</Label>
                      <Input
                        placeholder="请输入目的地"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>还车地点</Label>
                      <Input
                        placeholder="默认原地还车"
                        value={formData.returnLocation}
                        onChange={(e) => setFormData({ ...formData, returnLocation: e.target.value })}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>行程类型</Label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isRoundTrip: 0 })}
                        className={[
                          'rounded-lg border px-4 py-2 text-sm transition-colors',
                          formData.isRoundTrip === 0
                            ? 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-400',
                        ].join(' ')}
                      >
                        单程
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, isRoundTrip: 1 })}
                        className={[
                          'rounded-lg border px-4 py-2 text-sm transition-colors',
                          formData.isRoundTrip === 1
                            ? 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-400',
                        ].join(' ')}
                      >
                        往返
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>用车事由</Label>
                    <Textarea
                      className="min-h-[100px] resize-none"
                      placeholder="请输入用车事由"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>附件</Label>
                    <FileUpload
                      value={formData.attachmentUrl}
                      onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                      maxCount={3}
                      hint=""
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>随行人数</Label>
                      <Input
                        type="number"
                        min={1}
                        max={selectedVehicle?.capacity || 50}
                        value={formData.passengerCount}
                        onChange={(e) => setFormData({ ...formData, passengerCount: parseInt(e.target.value, 10) || 1 })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>随行人员</Label>
                      <Input
                        placeholder="如：张三, 李四"
                        value={formData.passengers}
                        onChange={(e) => setFormData({ ...formData, passengers: e.target.value })}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(0)}>
                      上一步
                    </Button>
                    <Button onClick={() => setStep(2)} disabled={!canProceedToStep3 || Boolean(timeError)}>
                      下一步
                      <ChevronRight size={16} className="ml-1.5" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <SummaryField label="车辆" value={selectedVehicle?.licensePlate || '--'} />
                    <SummaryField label="目的地" value={formData.destination} />
                    <SummaryField label="行程 / 人数" value={`${formData.isRoundTrip ? '往返' : '单程'} · ${formData.passengerCount} 人`} />
                    <SummaryField label="开始时间" value={formData.startTime.replace('T', ' ')} />
                    <SummaryField label="结束时间" value={formData.endTime.replace('T', ' ')} />
                    <SummaryField label="还车地点" value={formData.returnLocation || '原地还车'} />
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="text-xs font-medium text-slate-400 dark:text-slate-500">用车事由</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">
                      {formData.reason}
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      上一步
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-1.5 animate-spin" size={16} />
                          提交中...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="mr-1.5" size={16} />
                          确认提交
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VehicleBooking;
