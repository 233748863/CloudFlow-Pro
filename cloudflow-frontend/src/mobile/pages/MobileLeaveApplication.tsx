import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight';
import { useHrSelfServiceEligibility } from '@/hooks/useHrSelfServiceEligibility';
import {
  HrLeaveTypeOption,
  leaveApplicationApi,
} from '@/services/api/leaveApplication';
import { DatePicker } from '@/components/common';
import { toBackendDateString } from '@/utils/dateFormat';

interface LeaveApplicationFormState {
  leaveTypeId?: number;
  startValue: string;
  endValue: string;
  reason: string;
}

const buildDateTimeRange = (type: HrLeaveTypeOption | undefined, form: LeaveApplicationFormState) => {
  if (!type) {
    return { startTime: '', endTime: '' };
  }

  if (type.unit === 'HOUR') {
    return {
      startTime: toBackendDateString(form.startValue),
      endTime: toBackendDateString(form.endValue),
    };
  }

  return {
    startTime: `${form.startValue} 09:00:00`,
    endTime: `${form.endValue} 18:00:00`,
  };
};

const calculateDuration = (type: HrLeaveTypeOption | undefined, form: LeaveApplicationFormState) => {
  if (!type || !form.startValue || !form.endValue) {
    return 0;
  }

  if (type.unit === 'HOUR') {
    const start = new Date(form.startValue).getTime();
    const end = new Date(form.endValue).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 0;
    }
    return Math.round(((end - start) / 3600000) * 10) / 10;
  }

  const start = new Date(`${form.startValue}T00:00:00`).getTime();
  const end = new Date(`${form.endValue}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
};

const getLeaveTypeTone = (leaveCode?: string) => {
  switch (leaveCode) {
    case 'ANNUAL':
      return 'bg-pink-50 text-pink-500';
    case 'SICK':
      return 'bg-red-100 text-red-600';
    case 'PERSONAL':
      return 'bg-orange-100 text-orange-600';
    case 'MARRIAGE':
      return 'bg-emerald-100 text-emerald-600';
    case 'MATERNITY':
      return 'bg-pink-100 text-pink-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export const MobileLeaveApplication: React.FC = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveTypeOption[]>([]);
  const [form, setForm] = useState<LeaveApplicationFormState>({
    startValue: '',
    endValue: '',
    reason: '',
  });
  const {
    loading: eligibilityLoading,
    canStartSelfService,
    restrictionMessage,
  } = useHrSelfServiceEligibility();

  useKeyboardAwareScroll();

  useEffect(() => {
    void loadLeaveTypes();
  }, []);

  const loadLeaveTypes = async () => {
    setLoadingTypes(true);
    try {
      const records = await leaveApplicationApi.listLeaveTypes();
      const enabledTypes = records.filter((item) => item.status !== 0);
      setLeaveTypes(enabledTypes);
      if (enabledTypes.length > 0) {
        const firstType = enabledTypes[0];
        const today = new Date().toISOString().slice(0, 10);
        setForm((prev) => ({
          ...prev,
          leaveTypeId: prev.leaveTypeId ?? firstType.id,
          startValue: prev.startValue || today,
          endValue: prev.endValue || today,
        }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取请假类型失败');
    } finally {
      setLoadingTypes(false);
    }
  };

  const selectedType = useMemo(
    () => leaveTypes.find((item) => item.id === form.leaveTypeId),
    [form.leaveTypeId, leaveTypes],
  );
  const duration = useMemo(() => calculateDuration(selectedType, form), [form, selectedType]);

  const ensureCanContinue = () => {
    if (eligibilityLoading) {
      toast.error('正在校验当前员工状态，请稍后再试');
      return false;
    }
    if (!canStartSelfService) {
      toast.error(restrictionMessage || '当前账号暂时不能发起 HR 自助流程');
      return false;
    }
    return true;
  };

  const selfServiceLocked = eligibilityLoading || !canStartSelfService || loadingTypes;

  const validateForm = () => {
    if (!selectedType) {
      return '请选择请假类型';
    }
    if (!form.startValue || !form.endValue) {
      return selectedType.unit === 'HOUR' ? '请选择开始和结束时间' : '请选择开始和结束日期';
    }
    if (duration <= 0) {
      return selectedType.unit === 'HOUR' ? '结束时间必须晚于开始时间' : '结束日期不能早于开始日期';
    }
    if (form.reason.trim().length < 2) {
      return '请输入请假原因（至少 2 个字符）';
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!ensureCanContinue()) {
      return;
    }

    const errorMessage = validateForm();
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    if (!selectedType) {
      return;
    }

    const { startTime, endTime } = buildDateTimeRange(selectedType, form);

    setSubmitting(true);
    try {
      const createRes = await leaveApplicationApi.add({
        leaveTypeId: selectedType.id,
        startTime,
        endTime,
        duration,
        unit: selectedType.unit || 'DAY',
        reason: form.reason.trim(),
      });
      const leaveId = createRes?.id;
      if (!leaveId) {
        throw new Error('创建请假申请失败');
      }
      await leaveApplicationApi.submit(leaveId);
      toast.success('请假申请已提交，等待审批');
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingTypes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 animate-spin text-pink-500" size={32} />
          <p className="text-sm text-slate-500">正在加载请假类型...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="flex-1 text-lg font-semibold text-slate-900">请假申请</h1>
      </div>

      <div className="space-y-4 p-4">
        {restrictionMessage && (
          <div
            data-testid="hr-self-service-restriction"
            className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-white/80 p-2 text-amber-600 ring-1 ring-amber-200">
                <AlertCircle size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold">当前账号暂时不能继续发起 HR 自助流程</div>
                <div className="mt-1 text-xs leading-5 text-amber-800">{restrictionMessage}</div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Leave Type
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {leaveTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setForm((prev) => ({ ...prev, leaveTypeId: type.id }))}
                disabled={selfServiceLocked}
                className={`rounded-2xl border px-3 py-3 text-sm font-medium transition-all ${
                  form.leaveTypeId === type.id
                    ? 'border-pink-500 bg-pink-50 text-pink-500'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                {type.leaveName}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Time Range
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {selectedType?.unit === 'HOUR' ? '开始时间' : '开始日期'}
              </label>
              <DatePicker
                type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                value={form.startValue}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, startValue: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {selectedType?.unit === 'HOUR' ? '结束时间' : '结束日期'}
              </label>
              <DatePicker
                type={selectedType?.unit === 'HOUR' ? 'datetime-local' : 'date'}
                value={form.endValue}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, endValue: event.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Reason
          </div>
          <div className="mt-3">
            <textarea
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="请详细说明请假原因"
              rows={5}
              className="w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-3 text-pink-500 shadow-sm">
              <ClipboardList size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">申请摘要</div>
              <div className="mt-2 text-sm text-slate-600">
                <div>类型：{selectedType?.leaveName || '未选择'}</div>
                <div>
                  时长：
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${getLeaveTypeTone(selectedType?.leaveCode)}`}>
                    {duration > 0 ? `${duration} ${selectedType?.unit === 'HOUR' ? '小时' : '天'}` : '未计算'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  后端将按 HR 请假类型配置的正式单位和额度规则处理，不再拼装兼容字段。
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || selfServiceLocked}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-500 py-3 font-medium text-white shadow-[0_14px_28px_rgba(236,72,153,0.22)] transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              提交中...
            </>
          ) : (
            '提交请假申请'
          )}
        </button>
      </div>
    </div>
  );
};
