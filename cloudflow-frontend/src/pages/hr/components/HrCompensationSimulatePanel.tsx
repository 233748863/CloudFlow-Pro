import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Calculator, LoaderCircle } from 'lucide-react';
import { BaseDialog, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { decimalAmount } from '@/utils/amountValue';
import { hrCompensationSimulateApi, type HrCompensationSimulateRequest, type HrCompensationSimulateResult } from '@/services/api/hr/batch2';
import type { EmployeeSalary, SalaryGrade, SalaryItem, SalaryStructure } from '@/services/api/hr';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

interface Props {
  open: boolean;
  employees: Array<{ id?: number; name?: string; employeeNo?: string }>;
  structures: SalaryStructure[];
  components: SalaryItem[];
  grades: SalaryGrade[];
  compensations: EmployeeSalary[];
  onClose: () => void;
}

const formatMoney = (value: string | number | null | undefined) => {
  const amount = decimalAmount(value);
  return amount ? '¥ ' + amount.toFixed(2) : '—';
};
const componentTypes: Record<string, string> = { FIXED: '固定薪酬', VARIABLE: '浮动薪酬', EARNING: '收入', DEDUCTION: '扣减', COMPANY: '公司成本' };
const resultAmounts = [
  ['gross', '工资合计（已扣项目扣减）'], ['socialPersonal', '个人社保及公积金'], ['personalTax', '估算个税'], ['netSalary', '估算实发'],
  ['taxableGross', '计税工资'], ['socialBase', '个人缴费基数'], ['specialDeductions', '专项附加扣除'], ['threshold', '月度起征额'], ['taxableIncome', '应纳税所得额'],
] as const;

export const HrCompensationSimulatePanel = ({ open, employees, structures, components, grades, compensations, onClose }: Props) => {
  const [form, setForm] = useState<HrCompensationSimulateRequest>({});
  const [result, setResult] = useState<HrCompensationSimulateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const baseline = compensations.filter(row => String(row.employeeId) === String(form.employeeId) && row.status === 'ACTIVE' && row.effectiveDate && row.effectiveDate <= today)
    .sort((left, right) => String(right.effectiveDate).localeCompare(String(left.effectiveDate)) || Number(right.id) - Number(left.id))[0];
  const structureId = form.structureId ?? baseline?.structureId;
  const structure = structures.find(row => String(row.id) === String(structureId));
  const members = components.filter(row => (structure?.itemIds || []).map(String).includes(String(row.id)));
  const change = (values: Partial<HrCompensationSimulateRequest>) => {
    if (busy.current) return;
    setForm(previous => ({ ...previous, ...values })); setResult(null);
  };
  const reset = () => { if (!busy.current) { setForm({}); setResult(null); } };
  const close = () => { if (!busy.current) { reset(); onClose(); } };
  const simulate = async () => {
    if (busy.current) return;
    if (!form.employeeId && !structureId) { toast.error('请选择基准员工或薪资结构'); return; }
    const entries = Object.entries(form.componentOverrides || {}).filter(([, value]) => value !== '');
    for (const value of [...entries.map(([, amount]) => amount), form.socialBase, form.specialDeductions].filter(value => value !== undefined && value !== '')) {
      const amount = decimalAmount(value);
      if (!amount || amount.isNegative() || amount.gt('9999999999999999.99') || amount.decimalPlaces() > 2) {
        toast.error('金额须在0至9999999999999999.99元之间，最多两位小数'); return;
      }
    }
    if (form.socialPersonalRate !== undefined && form.socialPersonalRate !== '') {
      const rate = decimalAmount(form.socialPersonalRate);
      if (!rate || rate.isNegative() || rate.gt(1)) { toast.error('个人缴费比例须在0至1之间'); return; }
    }
    busy.current = true; setSubmitting(true); setResult(null);
    try {
      const response = await hrCompensationSimulateApi.simulate({ ...form, componentOverrides: Object.fromEntries(entries),
        socialBase: form.socialBase || undefined, socialPersonalRate: form.socialPersonalRate || undefined, specialDeductions: form.specialDeductions || undefined,
      });
      setResult(response);
    } catch (error) { toast.error(getErrorMessage(error, '模拟失败')); }
    finally { busy.current = false; setSubmitting(false); }
  };
  return <BaseDialog open={open} title="薪酬模拟器" onClose={close} width="wide" footer={
    <div className="flex justify-between gap-2"><Button variant="outline" disabled={submitting} onClick={reset}>清空</Button><div className="flex gap-2">
      <Button variant="outline" disabled={submitting} onClick={close}>关闭</Button><Button disabled={submitting} onClick={() => void simulate()}>
        {submitting ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : <Calculator className="mr-1 h-4 w-4" />}模拟计算
      </Button></div></div>
  }>
    <p className="mb-4 text-sm text-cf-subtle">月度估算，仅供比较；正式工资以薪资批次及财务核定税表为准。模拟不会修改员工薪资或生成工资单。</p>
    <div className="admin-comp-sim-grid">
      <section className="card p-4 admin-dialog-stack" aria-label="输入条件">
        <h3 className="font-semibold">输入条件</h3>
        <div className="admin-comp-sim-form-grid">
          <div className="admin-comp-sim-form-wide space-y-1"><Label htmlFor="salary-simulation-employee">基准员工</Label>
            <Select disabled={submitting} value={form.employeeId ? String(form.employeeId) : '__none__'} onValueChange={value => change({ employeeId: value === '__none__' ? undefined : Number(value), structureId: undefined, componentOverrides: {} })}>
              <SelectTrigger id="salary-simulation-employee"><SelectValue placeholder="选择员工" /></SelectTrigger><SelectContent><SelectItem value="__none__">不指定</SelectItem>{employees.map(employee => <SelectItem key={employee.id} value={String(employee.id)}>{employee.name} ({employee.employeeNo})</SelectItem>)}</SelectContent>
            </Select><p className="text-xs text-cf-subtle">使用当天已生效的薪资分配，单项填写金额后覆盖该项。</p>
          </div>
          <div className="space-y-1"><Label htmlFor="salary-simulation-structure">薪资结构</Label>
            <Select disabled={submitting} value={structureId ? String(structureId) : '__none__'} onValueChange={value => change({ structureId: value === '__none__' ? undefined : Number(value), componentOverrides: {} })}>
              <SelectTrigger id="salary-simulation-structure"><SelectValue placeholder="选择结构" /></SelectTrigger><SelectContent><SelectItem value="__none__">沿用员工结构</SelectItem>{structures.filter(row => Number(row.status) === 1).map(row => <SelectItem key={row.id} value={String(row.id)}>{row.structureName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="salary-simulation-grade">缺少基本工资时使用的薪级</Label>
            <Select disabled={submitting} value={form.gradeId ? String(form.gradeId) : '__none__'} onValueChange={value => change({ gradeId: value === '__none__' ? undefined : Number(value) })}>
              <SelectTrigger id="salary-simulation-grade"><SelectValue placeholder="选择薪级" /></SelectTrigger><SelectContent><SelectItem value="__none__">不指定</SelectItem>{grades.filter(row => Number(row.status) === 1).map(row => <SelectItem key={row.id} value={String(row.id)}>{row.gradeName || row.gradeCode}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {([{ key: 'socialBase', label: '个人社保及公积金缴费基数', placeholder: '留空按工资合计估算' }, { key: 'socialPersonalRate', label: '个人合计缴费比例（0至1）', placeholder: '留空使用模拟参数' }, { key: 'specialDeductions', label: '专项附加扣除', placeholder: '留空按0元' }] as const).map(field => <div className="space-y-1" key={field.key}>
            <Label htmlFor={'salary-simulation-' + field.key}>{field.label}</Label><Input id={'salary-simulation-' + field.key} type="number" step="any" min="0" disabled={submitting} value={form[field.key] ?? ''} placeholder={field.placeholder} onChange={event => change({ [field.key]: event.target.value })} />
          </div>)}
        </div>
        <div className="admin-dialog-divider"><h4 className="font-medium">单项覆盖</h4><p className="mb-3 text-xs text-cf-subtle">留空沿用员工金额；缺少基本工资时取所选薪级中位值，其他项目按0元。填写0元会覆盖原金额。</p>
          {members.length ? <div className="space-y-3">{members.map(component => <div className="space-y-1" key={component.id}>
            <Label htmlFor={'salary-simulation-component-' + component.id}>{component.componentName || component.itemName} · {componentTypes[component.componentType || component.itemType || ''] || '薪资项目'}</Label>
            <Input id={'salary-simulation-component-' + component.id} type="number" step="0.01" min="0" disabled={submitting} value={form.componentOverrides?.[component.componentCode || component.itemCode || ''] ?? ''} placeholder="沿用基准金额" onChange={event => change({ componentOverrides: { ...form.componentOverrides, [component.componentCode || component.itemCode || '']: event.target.value } })} />
          </div>)}</div> : <p className="text-sm text-cf-subtle">请选择已配置薪资项目的结构。</p>}
        </div>
      </section>
      <section className="card p-4 admin-dialog-stack" aria-label="模拟结果" aria-live="polite">
        <h3 className="font-semibold">模拟结果</h3>
        {result ? <>
          <dl className="space-y-3">{resultAmounts.map(([key, label]) => <div key={key} className="flex flex-wrap justify-between gap-2 text-sm"><dt>{label}</dt><dd className="font-medium tabular-nums">{formatMoney(result[key])}</dd></div>)}
            <div className="flex flex-wrap justify-between gap-2 text-sm"><dt>本次个人缴费比例</dt><dd>{decimalAmount(result.socialPersonalRate)?.times(100).toFixed()}%</dd></div>
          </dl>
          <div className="admin-dialog-divider"><h4 className="mb-3 font-medium">明细项目</h4><InnerTableSurface><table className="unity-data-table admin-source-table min-w-[320px]"><thead><tr><th>项目</th><th>类型</th><th>金额</th></tr></thead><tbody>{result.breakdown.map(item => <tr key={item.componentId}><td>{item.componentName}</td><td>{componentTypes[item.componentType] || item.componentType}</td><td className="text-right tabular-nums">{formatMoney(item.amount)}</td></tr>)}</tbody></table></InnerTableSurface></div>
        </> : <p className="text-sm text-cf-subtle">{submitting ? '正在计算…' : '填写条件后点击“模拟计算”查看结果。'}</p>}
      </section>
    </div>
  </BaseDialog>;
};

export default HrCompensationSimulatePanel;
