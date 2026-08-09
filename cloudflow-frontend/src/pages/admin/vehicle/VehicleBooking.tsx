import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Car,
  CheckCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { getAvailableVehicles, submitUsage, SysVehicle } from '@/services/api/vehicle';
import { toBackendDateString } from '@/utils/dateFormat';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { getErrorMessage } from '@/utils/errorMessage';
import type { UserBrief } from '@/types/workflow';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import './admin-vehicle.css';

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
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
    <div className="admin-source-stat-icon mb-4">
      {icon || <Car size={18} />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 max-w-md text-sm leading-6 text-cf-subtle">{description}</div>
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
      'w-full cursor-pointer rounded-md border px-4 py-3 text-left transition',
      selected
        ? 'border-[#0d95b5] bg-[#effbfe] dark:border-[#0d95b5]/70 dark:bg-[#0d95b5]/15'
        : 'border-slate-200 bg-[var(--cf-surface-strong)] hover:border-[#0d95b5]/50 hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-950 dark:hover:border-[#0d95b5]/45 dark:hover:bg-slate-900',
    ].join(' ')}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-cf-title">
          {vehicle.licensePlate}
        </div>
        <div className="mt-1 text-sm text-cf-subtle">
          {vehicle.brand} {vehicle.model}
        </div>
        <div className="mt-2 text-xs text-cf-subtle">
          {vehicle.capacity} 座
          {vehicle.location ? ` · ${vehicle.location}` : ''}
          {vehicle.color ? ` · ${vehicle.color}` : ''}
        </div>
      </div>
      {selected ? <CheckCircle size={16} className="shrink-0 text-cf-muted" /> : null}
    </div>
  </button>
);

const StepStrip: React.FC<{ current: number; steps: string[] }> = ({ current, steps }) => (
  <div className="flex flex-wrap items-center gap-3">
    {steps.map((step, index) => (
      <div key={step} className="flex items-center gap-3">
        <div
          className={[
            'inline-flex items-center gap-2 text-sm',
            index === current
              ? 'text-cf-title'
              : 'text-cf-faint',
          ].join(' ')}
        >
          <span
            className={[
              'inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-medium',
              index === current
                ? 'border-slate-300 bg-[var(--cf-surface-muted)] dark:border-slate-700 dark:bg-slate-900'
                : 'border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950/88',
            ].join(' ')}
          >
            {index + 1}
          </span>
          <span className="font-medium">{step}</span>
        </div>
        {index < steps.length - 1 ? (
          <span className="hidden h-px w-6 bg-slate-200 dark:bg-slate-800 sm:block" />
        ) : null}
      </div>
    ))}
  </div>
);

const SummaryField: React.FC<SummaryFieldProps> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800">
    <div className="text-xs font-medium text-cf-faint">{label}</div>
    <div className="max-w-[65%] text-right text-sm font-medium text-cf-title">{value}</div>
  </div>
);

const VehicleBookingSurface: React.FC<{
  title: string;
  description?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, description, bodyClassName = '', children }) => (
  <section className="admin-vehicle-booking-surface">
    <div className="admin-vehicle-booking-surface-head">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
    <div className={`admin-vehicle-booking-surface-body ${bodyClassName}`}>{children}</div>
  </section>
);

const SummarySection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <VehicleBookingSurface title={title} bodyClassName="admin-vehicle-booking-summary-body">
    {children}
  </VehicleBookingSurface>
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
    passengerIds: [] as string[],
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
    ? formData.attachmentUrl.split(',').map((item) => item.trim()).filter(Boolean).length
    : 0;
  const updatePassengers = useCallback((selectedUsers: UserBrief[]) => {
    setFormData((current) => ({
      ...current,
      passengers: selectedUsers.map((item) => item.name).join('、'),
    }));
  }, []);

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
    ? '同步可预约车辆'
    : loadError
      ? '车辆资源加载失败'
      : vehicles.length === 0
        ? '当前暂无可预约车辆'
        : step === 0
          ? (searchText || capacityFilter !== 'all'
              ? `已筛出 ${filteredVehicles.length} / ${vehicles.length} 辆`
              : `可预约 ${vehicles.length} 辆`)
          : step === 1
            ? `已选 ${selectedVehicle?.licensePlate || '--'}`
            : `已选 ${selectedVehicle?.licensePlate || '--'}`;
  const selectedVehicleSummary = selectedVehicle
    ? `${selectedVehicle.brand} ${selectedVehicle.model || ''} · ${selectedVehicle.capacity} 座${selectedVehicle.location ? ` · ${selectedVehicle.location}` : ''}`
    : '--';
  const metrics = [
    { label: '可预约车辆', value: String(vehicles.length), meta: loading ? '同步中' : '车辆池', icon: <Car size={18} />, tone: 'blue' },
    { label: '筛选结果', value: String(filteredVehicles.length), meta: searchText || capacityFilter !== 'all' ? '已应用筛选' : '全部车辆', icon: <Search size={18} />, tone: 'green' },
    { label: '当前步骤', value: currentStepTitle, meta: `第 ${step + 1} 步 / 共 ${steps.length} 步`, icon: <ChevronRight size={18} />, tone: 'amber' },
    { label: '已选车辆', value: selectedVehicle?.licensePlate || '--', meta: selectedVehicle ? selectedVehicleSummary : '待选择', icon: <CheckCircle size={18} />, tone: 'violet' },
  ];

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">VEHICLE BOOKING</p>
          <h2>车辆预约</h2>
          <span>选择可用车辆、填写用车信息并提交审批</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadVehicles()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-cf-title">{currentStepTitle}</div>
            {currentStepMeta ? (
              <div className="mt-1 text-xs text-cf-subtle">{currentStepMeta}</div>
            ) : null}
          </div>
          {!loading && !loadError && vehicles.length > 0 ? <StepStrip current={step} steps={steps} /> : null}
        </div>
      </section>
  );

  const pageTable = (
      <InnerTableSurface
        className="admin-vehicle-booking-panel flex min-h-0 flex-1 flex-col"
        wrapperClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {loading ? (
            <InlineState
              title="正在加载可用车辆"
              icon={<Loader2 className="animate-spin text-cf-subtle" size={18} />}
            />
          ) : loadError ? (
            <InlineState
              title="加载车辆失败"
              description={loadError}
              icon={<AlertCircle className="text-cf-subtle" size={18} />}
              action={<Button variant="outline" onClick={() => void loadVehicles()}>重试</Button>}
            />
          ) : vehicles.length === 0 ? (
            <InlineState
              title="暂无可用车辆"
              action={<Button variant="outline" onClick={() => navigate('/admin/vehicle')}>查看车辆列表</Button>}
            />
          ) : (
            <>
              {step === 0 ? (
                <div className="flex flex-col gap-4">
                  <div className="admin-vehicle-booking-filter-grid">
                    <label className="admin-source-search">
                      <span className="input-label">车辆搜索</span>
                      <div className="admin-source-search-field">
                        <Search size={16} />
                        <Input
                          placeholder="搜索车牌号、品牌、型号"
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                        />
                      </div>
                    </label>
                    <label>
                      <span className="input-label">座位数</span>
                      <Select value={capacityFilter} onValueChange={setCapacityFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="座位数" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部</SelectItem>
                          <SelectItem value="small">5座及以下</SelectItem>
                          <SelectItem value="medium">6-7座</SelectItem>
                          <SelectItem value="large">7座以上</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <div className="admin-users-toolbar-actions">
                      <span className="admin-users-filter-count">
                        {searchText || capacityFilter !== 'all'
                          ? `已筛出 ${filteredVehicles.length} / ${vehicles.length} 辆`
                          : `可预约 ${vehicles.length} 辆`}
                      </span>
                      {selectedVehicle ? <span className="admin-users-filter-count">已选 {selectedVehicle.licensePlate}</span> : null}
                    </div>
                  </div>

                  {filteredVehicles.length === 0 ? (
                    <InlineState
                      title="没有匹配的车辆"
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
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4">
                    <div className="admin-vehicle-booking-selected">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-semibold text-cf-title">
                          {selectedVehicle?.licensePlate}
                        </div>
                        <div className="mt-1 truncate text-xs text-cf-subtle">
                          {selectedVehicleSummary}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                        更换
                      </Button>
                    </div>

                    <VehicleBookingSurface title="时间和地点" description="用车时段、目的地和还车位置" bodyClassName="grid gap-4 lg:grid-cols-2">
                        <div className="admin-dialog-field">
                          <Label>开始时间</Label>
                          <DatePicker
                            className="h-11"
                            type="datetime-local"
                            value={formData.startTime}
                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                          />
                        </div>
                        <div className="admin-dialog-field">
                          <Label>结束时间</Label>
                          <DatePicker
                            className="h-11"
                            type="datetime-local"
                            value={formData.endTime}
                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                          />
                        </div>
                        <div className="admin-dialog-field">
                          <Label>目的地</Label>
                          <Input
                            value={formData.destination}
                            onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                            className="h-11"
                          />
                        </div>
                        <div className="admin-dialog-field">
                          <Label>还车地点</Label>
                          <Input
                            value={formData.returnLocation}
                            onChange={(e) => setFormData({ ...formData, returnLocation: e.target.value })}
                            className="h-11"
                          />
                        </div>
                    </VehicleBookingSurface>

                    {timeError ? (
                      <div className="admin-vehicle-booking-warning">
                        <AlertCircle size={16} />
                        {timeError}
                      </div>
                    ) : null}

                    <VehicleBookingSurface title="行程和材料" description="选择行程类型、填写事由并上传附件" bodyClassName="grid gap-4 lg:grid-cols-2">
                        <div className="admin-dialog-field">
                          <Label>行程类型</Label>
                          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, isRoundTrip: 0 })}
                              className={[
                                'inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition',
                                formData.isRoundTrip === 0
                                  ? 'border-[#0d95b5] bg-[#effbfe] text-[#0b7894] dark:border-[#0d95b5]/70 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]'
                                  : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted hover:border-[#0d95b5]/50 dark:border-slate-800 dark:bg-slate-950',
                              ].join(' ')}
                            >
                              单程
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, isRoundTrip: 1 })}
                              className={[
                                'inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium transition',
                                formData.isRoundTrip === 1
                                  ? 'border-[#0d95b5] bg-[#effbfe] text-[#0b7894] dark:border-[#0d95b5]/70 dark:bg-[#0d95b5]/15 dark:text-[#d8f3fa]'
                                  : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted hover:border-[#0d95b5]/50 dark:border-slate-800 dark:bg-slate-950',
                              ].join(' ')}
                            >
                              往返
                            </button>
                          </div>
                        </div>
                        <div className="admin-dialog-field">
                          <Label>附件</Label>
                          <FileUpload
                            value={formData.attachmentUrl}
                            onChange={(urls) => setFormData({ ...formData, attachmentUrl: urls })}
                            maxCount={3}
                            hint=""
                          />
                        </div>

                      <div className="admin-dialog-field lg:col-span-2">
                        <Label>用车事由</Label>
                      <Textarea
                          className="min-h-[88px] resize-none"
                          value={formData.reason}
                          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        />
                      </div>
                    </VehicleBookingSurface>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <VehicleBookingSurface title="乘员信息" description="人数和名单单独维护" bodyClassName="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                        <div className="admin-dialog-field">
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
                        <div className="admin-dialog-field">
                          <Label>随行人员</Label>
                          <UserSelector
                            value={formData.passengerIds}
                            onChange={(passengerIds) => setFormData({ ...formData, passengerIds })}
                            onUsersChange={updatePassengers}
                            placeholder="搜索姓名、邮箱或部门选择人员"
                            dropdownPlacement="top"
                          />
                        </div>
                    </VehicleBookingSurface>

                    <VehicleBookingSurface title="申请摘要" bodyClassName="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-cf-subtle">车辆</span>
                          <span className="font-mono font-medium text-cf-title">{selectedVehicle?.licensePlate || '--'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-cf-subtle">行程</span>
                          <span className="font-medium text-cf-title">{formData.isRoundTrip ? '往返' : '单程'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-cf-subtle">人数</span>
                          <span className="font-medium text-cf-title">{formData.passengerCount || 1} 人</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-cf-subtle">附件</span>
                          <span className="font-medium text-cf-title">{attachmentCount} 个</span>
                        </div>
                    </VehicleBookingSurface>
                  </div>

                  <div className="flex justify-between gap-3">
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
                <div className="flex flex-col gap-5">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <SummarySection title="申请信息">
                      <SummaryField label="车辆" value={selectedVehicle?.licensePlate || '--'} />
                      <SummaryField label="开始时间" value={formData.startTime.replace('T', ' ')} />
                      <SummaryField label="结束时间" value={formData.endTime.replace('T', ' ')} />
                      <SummaryField label="目的地" value={formData.destination} />
                      <SummaryField label="还车地点" value={formData.returnLocation || '原地还车'} />
                      <SummaryField label="行程 / 人数" value={`${formData.isRoundTrip ? '往返' : '单程'} · ${formData.passengerCount} 人`} />
                      <SummaryField label="随行人员" value={formData.passengers || '-'} />
                      <SummaryField label="附件" value={`${attachmentCount} 个`} />
                    </SummarySection>

                    <SummarySection title="用车事由">
                      <div className="px-4 py-3 whitespace-pre-wrap text-sm leading-6 text-cf-title">
                        {formData.reason}
                      </div>
                    </SummarySection>
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
      </InnerTableSurface>
  );

  return (
    <section className="admin-source-page admin-vehicle-booking-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
      />
    </section>
  );
};

export default VehicleBooking;
