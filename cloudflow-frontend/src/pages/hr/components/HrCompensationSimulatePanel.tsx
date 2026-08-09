import { useState, type ReactNode } from 'react';
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
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

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

const SimulationPanel = ({
  title,
  description,
  actions,
  bodyClassName = '',
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
}) => (
  <section className="card">
    <div className="admin-source-section-head border-b border-slate-200 p-4 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {actions ? <div className="admin-users-toolbar-actions">{actions}</div> : null}
    </div>
    <div className={`p-4 ${bodyClassName}`.trim()}>{children}</div>
  </section>
);

const SimulationSubhead = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) => (
  <div className="admin-dialog-subhead">
    <div>
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
    {actions ? <div className="admin-users-toolbar-actions">{actions}</div> : null}
  </div>
);

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
      <div className="admin-comp-sim-grid">
        <SimulationPanel
          title="输入条件"
          description="选择基准员工或填写假设薪资参数"
          bodyClassName="admin-dialog-stack"
        >
          <div className="admin-comp-sim-form-grid">
            <div className="admin-comp-sim-form-wide space-y-1">
              <Label className="text-xs">基准员工</Label>
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
          <div className="admin-dialog-divider">
            <SimulationSubhead
              title="单项覆盖"
              description="按项目编码覆盖模拟金额"
              actions={(
              <Button size="sm" variant="outline" onClick={addOverride}>
                <Plus className="mr-1 h-3 w-3" />添加
              </Button>
              )}
            />
            {(form.overrideItems || []).length > 0 ? (
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table min-w-[520px]">
                  <thead>
                    <tr>
                      <th>项目编码</th>
                      <th>金额</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.overrideItems || []).map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <Input
                            value={item.itemCode || ''}
                            onChange={(e) => updateOverride(idx, 'itemCode', e.target.value)}
                            placeholder="项目编码"
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            value={item.amount ?? 0}
                            onChange={(e) => updateOverride(idx, 'amount', e.target.value)}
                            placeholder="金额"
                          />
                        </td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => removeOverride(idx)}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InnerTableSurface>
            ) : (
              <div className="admin-dialog-empty-note">暂无覆盖项</div>
            )}
          </div>
        </SimulationPanel>

        <SimulationPanel
          title="模拟结果"
          description="应发、扣减和实发金额汇总"
          bodyClassName="admin-dialog-stack"
        >
          {result ? (
            <>
              <InnerTableSurface>
                <table className="unity-data-table admin-source-table min-w-[520px]">
                  <tbody>
                    <tr><td>基本工资</td><td className="text-right font-medium tabular-nums">{formatMoney(result.baseSalary)}</td></tr>
                    <tr><td>绩效奖金</td><td className="text-right font-medium tabular-nums">{formatMoney(result.performanceBonus)}</td></tr>
                    <tr><td>津贴合计</td><td className="text-right font-medium tabular-nums">{formatMoney(result.allowanceTotal)}</td></tr>
                    <tr><td>应发合计</td><td className="text-right font-semibold text-cyan-700 tabular-nums dark:text-cyan-300">{formatMoney(result.grossSalary)}</td></tr>
                    <tr><td>社保合计</td><td className="text-right font-medium tabular-nums">{formatMoney(result.socialInsuranceTotal)}</td></tr>
                    <tr><td>公积金</td><td className="text-right font-medium tabular-nums">{formatMoney(result.housingFund)}</td></tr>
                    <tr><td>个税</td><td className="text-right font-medium tabular-nums">{formatMoney(result.individualTax)}</td></tr>
                    <tr><td>实发合计</td><td className="text-right text-base font-bold text-emerald-700 tabular-nums dark:text-emerald-300">{formatMoney(result.netSalary)}</td></tr>
                  </tbody>
                </table>
              </InnerTableSurface>

              {result.items && result.items.length > 0 ? (
                <div className="admin-dialog-divider">
                  <SimulationSubhead title="明细项" description={`${result.items.length} 个薪资项目`} />
                  <InnerTableSurface>
                    <table className="unity-data-table admin-source-table min-w-[520px]">
                      <thead>
                        <tr>
                          <th>项目</th>
                          <th>金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.itemName || item.itemCode}</td>
                            <td className="text-right font-medium tabular-nums">{formatMoney(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </InnerTableSurface>
                </div>
              ) : null}
            </>
          ) : (
            <div className="admin-dialog-empty-note">
              点击"模拟计算"查看结果
            </div>
          )}
        </SimulationPanel>
      </div>
    </BaseDialog>
  );
};

export default HrCompensationSimulatePanel;
