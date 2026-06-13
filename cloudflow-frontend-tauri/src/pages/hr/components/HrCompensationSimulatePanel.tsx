import { useState } from 'react';
import { toast } from 'sonner';
import { Calculator, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  hrCompensationSimulateApi,
  type HrCompensationSimulateRequest,
  type HrCompensationSimulateResult,
} from '@/services/api/hr/batch2';

interface Props {
  open: boolean;
  employees: Array<{ id?: number; name?: string; employeeNo?: string }>;
  positionLevels?: Array<{ id?: number; gradeName?: string; gradeCode?: string }>;
  onClose: () => void;
}

const formatMoney = (value?: number) => {
  if (value === undefined || value === null) return '-';
  return `¥ ${value.toFixed(2)}`;
};

export const HrCompensationSimulatePanel = ({ open, employees, positionLevels, onClose }: Props) => {
  const [form, setForm] = useState<HrCompensationSimulateRequest>({
    employeeId: undefined,
    baseSalary: undefined,
    positionLevel: '',
    performanceBonus: undefined,
    socialBaseAdjustment: undefined,
    overrideItems: [],
  });
  const [result, setResult] = useState<HrCompensationSimulateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setForm({
      employeeId: undefined,
      baseSalary: undefined,
      positionLevel: '',
      performanceBonus: undefined,
      socialBaseAdjustment: undefined,
      overrideItems: [],
    });
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSimulate = async () => {
    if (!form.employeeId && !form.baseSalary) {
      toast.error('请选择员工或填写假设基本工资');
      return;
    }
    setSubmitting(true);
    try {
      const res = await hrCompensationSimulateApi.simulate(form);
      setResult(res);
    } catch (err) {
      toast.error(getErrorMessage(err, '模拟失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const addOverride = () => {
    setForm((f) => ({
      ...f,
      overrideItems: [...(f.overrideItems || []), { itemCode: '', amount: 0 }],
    }));
  };

  const updateOverride = (idx: number, field: 'itemCode' | 'amount', value: string) => {
    setForm((f) => {
      const items = [...(f.overrideItems || [])];
      if (field === 'amount') {
        items[idx] = { ...items[idx], amount: Number(value) || 0 };
      } else {
        items[idx] = { ...items[idx], itemCode: value };
      }
      return { ...f, overrideItems: items };
    });
  };

  const removeOverride = (idx: number) => {
    setForm((f) => ({
      ...f,
      overrideItems: (f.overrideItems || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <BaseDialog
      open={open}
      title="薪酬模拟器"
      onClose={handleClose}
      width="wide"
      footer={(
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={reset}>清空</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>关闭</Button>
            <Button onClick={() => void handleSimulate()} disabled={submitting}>
              {submitting ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : <Calculator className="mr-1 h-4 w-4" />}
              模拟计算
            </Button>
          </div>
        </div>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">输入条件</div>

          <div className="space-y-1">
            <Label className="text-xs">基准员工（可选，留空则用纯假设值）</Label>
            <Select
              value={form.employeeId ? String(form.employeeId) : '__none__'}
              onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v === '__none__' ? undefined : Number(v) }))}
            >
              <SelectTrigger><SelectValue placeholder="选择员工" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不指定</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={String(emp.id)}>
                    {emp.name} ({emp.employeeNo})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">假设基本工资</Label>
              <Input
                type="number"
                value={form.baseSalary ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="留空则取员工实际"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">假设绩效奖金</Label>
              <Input
                type="number"
                value={form.performanceBonus ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, performanceBonus: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">假设薪酬等级</Label>
              {positionLevels && positionLevels.length > 0 ? (
                <Select
                  value={form.positionLevel || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, positionLevel: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="选择等级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不指定</SelectItem>
                    {positionLevels.map((pl) => (
                      <SelectItem key={pl.id} value={pl.gradeCode || String(pl.id)}>
                        {pl.gradeName || pl.gradeCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.positionLevel || ''}
                  onChange={(e) => setForm((f) => ({ ...f, positionLevel: e.target.value }))}
                  placeholder="如 P5/M2 等"
                />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">社保基数调整</Label>
              <Input
                type="number"
                value={form.socialBaseAdjustment ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, socialBaseAdjustment: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="正负数均可"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">单项覆盖（可选）</Label>
              <Button size="sm" variant="outline" onClick={addOverride}>
                <Plus className="mr-1 h-3 w-3" />添加
              </Button>
            </div>
            {(form.overrideItems || []).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={item.itemCode || ''}
                  onChange={(e) => updateOverride(idx, 'itemCode', e.target.value)}
                  placeholder="项目编码"
                />
                <Input
                  type="number"
                  className="w-32"
                  value={item.amount ?? 0}
                  onChange={(e) => updateOverride(idx, 'amount', e.target.value)}
                  placeholder="金额"
                />
                <Button size="sm" variant="outline" onClick={() => removeOverride(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">模拟结果</div>
          {result ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-2 gap-y-2">
                <div className="text-slate-500">基本工资</div><div className="text-right font-medium">{formatMoney(result.baseSalary)}</div>
                <div className="text-slate-500">绩效奖金</div><div className="text-right font-medium">{formatMoney(result.performanceBonus)}</div>
                <div className="text-slate-500">津贴合计</div><div className="text-right font-medium">{formatMoney(result.allowanceTotal)}</div>
                <div className="border-t border-slate-200 pt-2 text-slate-500 dark:border-slate-700">应发合计</div>
                <div className="border-t border-slate-200 pt-2 text-right font-semibold text-cyan-700 dark:border-slate-700 dark:text-cyan-300">{formatMoney(result.grossSalary)}</div>
                <div className="text-slate-500">社保合计</div><div className="text-right font-medium">{formatMoney(result.socialInsuranceTotal)}</div>
                <div className="text-slate-500">公积金</div><div className="text-right font-medium">{formatMoney(result.housingFund)}</div>
                <div className="text-slate-500">个税</div><div className="text-right font-medium">{formatMoney(result.individualTax)}</div>
                <div className="border-t border-slate-200 pt-2 text-slate-500 dark:border-slate-700">实发合计</div>
                <div className="border-t border-slate-200 pt-2 text-right text-base font-bold text-emerald-700 dark:border-slate-700 dark:text-emerald-300">{formatMoney(result.netSalary)}</div>
              </div>

              {result.items && result.items.length > 0 ? (
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="text-xs text-slate-500">明细项</div>
                  {result.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span>{item.itemName || item.itemCode}</span>
                      <span className="font-medium">{formatMoney(item.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              点击"模拟计算"查看结果
            </div>
          )}
        </div>
      </div>
    </BaseDialog>
  );
};

export default HrCompensationSimulatePanel;
