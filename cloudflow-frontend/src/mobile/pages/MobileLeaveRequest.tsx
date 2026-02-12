import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Calendar, Clock, FileText, Loader2 } from 'lucide-react';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight';
import { toast } from 'sonner';
import { format, differenceInDays, parseISO } from 'date-fns';

type LeaveType = 'annual' | 'sick' | 'personal' | 'maternity' | 'bereavement' | 'other';

interface LeaveForm {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  contact: string;
  handover: string;
}

const leaveTypes: { value: LeaveType; label: string; color: string }[] = [
  { value: 'annual', label: '年假', color: 'bg-blue-100 text-blue-600' },
  { value: 'sick', label: '病假', color: 'bg-red-100 text-red-600' },
  { value: 'personal', label: '事假', color: 'bg-orange-100 text-orange-600' },
  { value: 'maternity', label: '产假', color: 'bg-pink-100 text-pink-600' },
  { value: 'bereavement', label: '丧假', color: 'bg-slate-100 text-slate-600' },
  { value: 'other', label: '其他', color: 'bg-purple-100 text-purple-600' },
];

export const MobileLeaveRequest: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<LeaveForm>({
    type: 'annual',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    contact: '',
    handover: '',
  });

  useKeyboardAwareScroll();

  // 计算请假天数
  const getLeaveDays = () => {
    try {
      const start = parseISO(form.startDate);
      const end = parseISO(form.endDate);
      const days = differenceInDays(end, start) + 1;
      return days > 0 ? days : 0;
    } catch {
      return 0;
    }
  };

  // 验证步骤1
  const validateStep1 = (): string | null => {
    if (!form.type) return '请选择请假类型';
    if (!form.startDate) return '请选择开始日期';
    if (!form.endDate) return '请选择结束日期';
    if (new Date(form.endDate) < new Date(form.startDate)) return '结束日期不能早于开始日期';
    if (getLeaveDays() > 30) return '单次请假不能超过30天';
    return null;
  };

  // 验证步骤2
  const validateStep2 = (): string | null => {
    if (form.reason.trim().length < 2) return '请输入请假原因（至少2个字符）';
    if (!form.contact.trim()) return '请输入紧急联系方式';
    return null;
  };

  // 下一步
  const handleNext = () => {
    if (step === 1) {
      const error = validateStep1();
      if (error) {
        toast.error(error);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const error = validateStep2();
      if (error) {
        toast.error(error);
        return;
      }
      setStep(3);
    }
  };

  // 提交
  const handleSubmit = async () => {
    const error1 = validateStep1();
    if (error1) { toast.error(error1); return; }
    const error2 = validateStep2();
    if (error2) { toast.error(error2); return; }

    setSubmitting(true);
    try {
      // TODO: 调用真实 API 提交请假申请
      await new Promise(resolve => setTimeout(resolve, 1200));
      toast.success('请假申请已提交，等待审批');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const leaveDays = getLeaveDays();
  const selectedType = leaveTypes.find(t => t.value === form.type);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))}
          className="p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900 flex-1">请假申请</h1>
        <span className="text-sm text-slate-400">步骤 {step}/3</span>
      </div>

      {/* Progress Bar */}
      <div className="bg-white px-4 py-2 border-b border-slate-200">
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                s <= step ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span className={step >= 1 ? 'text-indigo-600 font-medium' : ''}>选择类型</span>
          <span className={step >= 2 ? 'text-indigo-600 font-medium' : ''}>填写详情</span>
          <span className={step >= 3 ? 'text-indigo-600 font-medium' : ''}>确认提交</span>
        </div>
      </div>

      {/* Step 1: 选择类型和日期 */}
      {step === 1 && (
        <div className="p-4 space-y-4">
          {/* 请假类型 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              请假类型 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {leaveTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setForm({ ...form, type: type.value })}
                  className={`py-3 px-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    form.type === type.value
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* 日期选择 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              <Calendar size={16} className="inline mr-1" />
              请假日期 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">开始日期</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">结束日期</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })}
                  min={form.startDate}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            {leaveDays > 0 && (
              <div className="mt-3 p-2 bg-indigo-50 rounded-lg text-center">
                <span className="text-sm text-indigo-600 font-medium">
                  共 {leaveDays} 天
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleNext}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium"
          >
            下一步
          </button>
        </div>
      )}

      {/* Step 2: 填写详情 */}
      {step === 2 && (
        <div className="p-4 space-y-4">
          {/* 请假原因 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <FileText size={16} className="inline mr-1" />
              请假原因 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="请详细说明请假原因"
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* 紧急联系方式 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              紧急联系方式 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.contact}
              onChange={e => setForm({ ...form, contact: e.target.value })}
              placeholder="请输入手机号码"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 工作交接 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              工作交接说明
            </label>
            <textarea
              value={form.handover}
              onChange={e => setForm({ ...form, handover: e.target.value })}
              placeholder="请说明工作交接安排（选填）"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <button
            onClick={handleNext}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium"
          >
            下一步
          </button>
        </div>
      )}

      {/* Step 3: 确认提交 */}
      {step === 3 && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-4">确认请假信息</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">请假类型</span>
                <span className={`text-sm px-2 py-0.5 rounded ${selectedType?.color || ''}`}>
                  {selectedType?.label}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">开始日期</span>
                <span className="text-sm text-slate-900">{form.startDate}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">结束日期</span>
                <span className="text-sm text-slate-900">{form.endDate}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">请假天数</span>
                <span className="text-sm font-semibold text-indigo-600">{leaveDays} 天</span>
              </div>
              <div className="py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500 block mb-1">请假原因</span>
                <span className="text-sm text-slate-900">{form.reason}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">紧急联系方式</span>
                <span className="text-sm text-slate-900">{form.contact}</span>
              </div>
              {form.handover && (
                <div className="py-2">
                  <span className="text-sm text-slate-500 block mb-1">工作交接</span>
                  <span className="text-sm text-slate-900">{form.handover}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                提交中...
              </>
            ) : (
              '提交申请'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
