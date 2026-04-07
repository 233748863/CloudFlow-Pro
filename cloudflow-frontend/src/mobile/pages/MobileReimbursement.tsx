import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, DollarSign, FileText, Upload, Loader2, X } from 'lucide-react';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { expenseClaimApi } from '@/services/api/expense';
import { DatePicker } from '@/components/ui';

type ExpenseType = 'travel' | 'meal' | 'accommodation' | 'transportation' | 'office' | 'other';

interface ExpenseItem {
  id: string;
  type: ExpenseType;
  amount: number;
  date: string;
  description: string;
}

interface ReimbursementForm {
  items: ExpenseItem[];
  totalAmount: number;
  bankAccount: string;
  remarks: string;
  attachments: File[];
}

const expenseTypes: { value: ExpenseType; label: string; color: string }[] = [
  { value: 'travel', label: '差旅费', color: 'bg-pink-50 text-pink-500' },
  { value: 'meal', label: '餐饮费', color: 'bg-green-100 text-green-600' },
  { value: 'accommodation', label: '住宿费', color: 'bg-purple-100 text-purple-600' },
  { value: 'transportation', label: '交通费', color: 'bg-orange-100 text-orange-600' },
  { value: 'office', label: '办公费', color: 'bg-pink-50 text-pink-500' },
  { value: 'other', label: '其他', color: 'bg-slate-100 text-slate-600' },
];

export const MobileReimbursement: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ReimbursementForm>({
    items: [],
    totalAmount: 0,
    bankAccount: '',
    remarks: '',
    attachments: [],
  });
  const [currentItem, setCurrentItem] = useState<Partial<ExpenseItem>>({
    type: 'travel',
    amount: 0,
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
  });

  useKeyboardAwareScroll();

  // 添加费用项
  const handleAddItem = () => {
    if (!currentItem.type) {
      toast.error('请选择费用类型');
      return;
    }
    if (!currentItem.amount || currentItem.amount <= 0) {
      toast.error('请输入有效的金额');
      return;
    }
    if (!currentItem.description?.trim()) {
      toast.error('请输入费用说明');
      return;
    }

    const newItem: ExpenseItem = {
      id: Date.now().toString(),
      type: currentItem.type,
      amount: currentItem.amount,
      date: currentItem.date || format(new Date(), 'yyyy-MM-dd'),
      description: currentItem.description,
    };

    const newItems = [...form.items, newItem];
    const newTotal = newItems.reduce((sum, item) => sum + item.amount, 0);

    setForm({
      ...form,
      items: newItems,
      totalAmount: newTotal,
    });

    // 重置当前项
    setCurrentItem({
      type: 'travel',
      amount: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
    });

    toast.success('费用项已添加');
  };

  // 删除费用项
  const handleRemoveItem = (id: string) => {
    const newItems = form.items.filter(item => item.id !== id);
    const newTotal = newItems.reduce((sum, item) => sum + item.amount, 0);
    setForm({
      ...form,
      items: newItems,
      totalAmount: newTotal,
    });
    toast.success('费用项已删除');
  };

  // 验证步骤1
  const validateStep1 = (): string | null => {
    if (form.items.length === 0) return '请至少添加一项费用';
    return null;
  };

  // 验证步骤2
  const validateStep2 = (): string | null => {
    if (!form.bankAccount.trim()) return '请输入银行账号';
    if (form.bankAccount.length < 10) return '请输入有效的银行账号';
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
      // 构建报销申请数据，调用真实API
      const claimData = {
        category: form.items[0]?.type || 'other',
        totalAmount: form.totalAmount,
        description: form.remarks || form.items.map(i => i.description).join('；'),
        items: form.items.map(item => ({
          expenseType: item.type,
          amount: item.amount,
          expenseDate: item.date,
          description: item.description,
        })),
      };
      // 1. 先创建报销单（草稿）
      const createRes = await expenseClaimApi.add(claimData as any);

      // 2. 提交审批（启动工作流）
      const claimId = createRes?.id;
      if (claimId) {
        await expenseClaimApi.submit(claimId);
      }

      toast.success('报销申请已提交，等待审批');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeLabel = (type: ExpenseType) => {
    return expenseTypes.find(t => t.value === type)?.label || type;
  };

  const getTypeColor = (type: ExpenseType) => {
    return expenseTypes.find(t => t.value === type)?.color || '';
  };

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
        <h1 className="text-lg font-semibold text-slate-900 flex-1">报销申请</h1>
        <span className="text-sm text-slate-400">步骤 {step}/3</span>
      </div>

      {/* Progress Bar */}
      <div className="bg-white px-4 py-2 border-b border-slate-200">
        <div className="flex gap-2">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                s <= step ? 'bg-pink-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span className={step >= 1 ? 'text-pink-500 font-medium' : ''}>添加费用</span>
          <span className={step >= 2 ? 'text-pink-500 font-medium' : ''}>填写信息</span>
          <span className={step >= 3 ? 'text-pink-500 font-medium' : ''}>确认提交</span>
        </div>
      </div>

      {/* Step 1: 添加费用项 */}
      {step === 1 && (
        <div className="p-4 space-y-4">
          {/* 费用类型 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-3">费用类型</label>
            <div className="grid grid-cols-3 gap-2">
              {expenseTypes.map(type => (
                <button
                  key={type.value}
                  onClick={() => setCurrentItem({ ...currentItem, type: type.value })}
                  className={`py-2 px-2 rounded-lg text-xs font-medium border-2 transition-all ${
                    currentItem.type === type.value
                      ? 'border-pink-500 bg-pink-50 text-pink-500'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* 金额和日期 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <DollarSign size={16} className="inline mr-1" />
                  金额（元）
                </label>
                <input
                  type="number"
                  value={currentItem.amount || ''}
                  onChange={e => setCurrentItem({ ...currentItem, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">日期</label>
                <DatePicker
                  type="date"
                  value={currentItem.date}
                  onChange={e => setCurrentItem({ ...currentItem, date: e.target.value })}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* 费用说明 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <FileText size={16} className="inline mr-1" />
              费用说明
            </label>
            <textarea
              value={currentItem.description}
              onChange={e => setCurrentItem({ ...currentItem, description: e.target.value })}
              placeholder="请输入费用说明"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
            />
          </div>

          <button
            onClick={handleAddItem}
            className="w-full bg-pink-500 text-white py-3 rounded-lg font-medium"
          >
            添加费用项
          </button>

          {/* 已添加的费用项 */}
          {form.items.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-slate-900">费用清单</h3>
                <span className="text-lg font-bold text-pink-500">
                  ¥{form.totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="space-y-2">
                {form.items.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(item.type)}`}>
                          {getTypeLabel(item.type)}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          ¥{item.amount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{item.description}</p>
                      <p className="text-xs text-slate-400 mt-1">{item.date}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {form.items.length > 0 && (
            <button
              onClick={handleNext}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium"
            >
              下一步
            </button>
          )}
        </div>
      )}

      {/* Step 2: 填写信息 */}
      {step === 2 && (
        <div className="p-4 space-y-4">
          {/* 银行账号 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              银行账号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.bankAccount}
              onChange={e => setForm({ ...form, bankAccount: e.target.value })}
              placeholder="请输入银行账号"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>

          {/* 备注 */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <label className="block text-sm font-medium text-slate-700 mb-2">备注说明</label>
            <textarea
              value={form.remarks}
              onChange={e => setForm({ ...form, remarks: e.target.value })}
              placeholder="请输入备注说明（选填）"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
            />
          </div>

          <button
            onClick={handleNext}
            className="w-full bg-pink-500 text-white py-3 rounded-lg font-medium"
          >
            下一步
          </button>
        </div>
      )}

      {/* Step 3: 确认提交 */}
      {step === 3 && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-4">确认报销信息</h3>
            
            {/* 费用清单 */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-slate-700 mb-2">费用清单</h4>
              <div className="space-y-2">
                {form.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-slate-100">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(item.type)}`}>
                        {getTypeLabel(item.type)}
                      </span>
                      <p className="text-xs text-slate-600 mt-1">{item.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      ¥{item.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 总金额 */}
            <div className="flex justify-between items-center py-3 border-t-2 border-slate-200 mb-4">
              <span className="text-base font-semibold text-slate-900">总金额</span>
              <span className="text-xl font-bold text-pink-500">
                ¥{form.totalAmount.toFixed(2)}
              </span>
            </div>

            {/* 其他信息 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">银行账号</span>
                <span className="text-sm text-slate-900">{form.bankAccount}</span>
              </div>
              {form.remarks && (
                <div className="py-2">
                  <span className="text-sm text-slate-500 block mb-1">备注说明</span>
                  <span className="text-sm text-slate-900">{form.remarks}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-pink-500 text-white py-3 rounded-lg font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
