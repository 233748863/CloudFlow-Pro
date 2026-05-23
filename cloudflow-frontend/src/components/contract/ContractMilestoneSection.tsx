import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, CircleDashed, CircleX, CreditCard, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  contractMilestoneApi,
  contractPaymentApi,
  type ContractMilestoneStatus,
  type ContractMilestoneType,
  type OaContractMilestone,
  type OaContractPaymentSchedule,
  type PaymentStatus,
} from '@/services/api/contractRisk';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';

interface Props {
  contractId: number;
}

const MILESTONE_TYPE_LABELS: Record<ContractMilestoneType, string> = {
  DELIVERY: '交付',
  PAYMENT: '付款',
  ACCEPTANCE: '验收',
  OTHER: '其他',
};

const MILESTONE_STATUS_LABELS: Record<ContractMilestoneStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  PENDING: {
    label: '待开始',
    cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
    icon: <CircleDashed size={12} className="mr-1" />,
  },
  IN_PROGRESS: {
    label: '进行中',
    cls: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
    icon: <CalendarClock size={12} className="mr-1" />,
  },
  DONE: {
    label: '已完成',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
    icon: <CheckCircle2 size={12} className="mr-1" />,
  },
  OVERDUE: {
    label: '已逾期',
    cls: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
    icon: <CircleX size={12} className="mr-1" />,
  },
  CANCELLED: {
    label: '已取消',
    cls: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
    icon: <CircleX size={12} className="mr-1" />,
  },
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { label: string; cls: string }> = {
  PENDING: { label: '待付款', cls: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300' },
  PAID: { label: '已付款', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200' },
  OVERDUE: { label: '已逾期', cls: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200' },
  CANCELLED: { label: '已取消', cls: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400' },
};

const emptyMilestone = (contractId: number): OaContractMilestone => ({
  contractId,
  milestoneName: '',
  milestoneType: 'DELIVERY',
  plannedDate: new Date().toISOString().slice(0, 10),
  status: 'PENDING',
});

const emptyPayment = (contractId: number): OaContractPaymentSchedule => ({
  contractId,
  paymentName: '',
  planDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  currency: 'CNY',
  status: 'PENDING',
});

export const ContractMilestoneSection: React.FC<Props> = ({ contractId }) => {
  const [milestones, setMilestones] = useState<OaContractMilestone[]>([]);
  const [payments, setPayments] = useState<OaContractPaymentSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [milestoneDialog, setMilestoneDialog] = useState<{ open: boolean; form: OaContractMilestone }>({
    open: false,
    form: emptyMilestone(contractId),
  });
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; form: OaContractPaymentSchedule }>({
    open: false,
    form: emptyPayment(contractId),
  });
  const [deletingMilestone, setDeletingMilestone] = useState<OaContractMilestone | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<OaContractPaymentSchedule | null>(null);

  const fetchAll = useCallback(async () => {
    if (!contractId) return;
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        contractMilestoneApi.listByContract(contractId),
        contractPaymentApi.listByContract(contractId),
      ]);
      setMilestones(m || []);
      setPayments(p || []);
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '加载履约节点失败'));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const overdueCount = useMemo(
    () =>
      milestones.filter((m) => m.status !== 'DONE' && m.status !== 'CANCELLED' && m.plannedDate < new Date().toISOString().slice(0, 10)).length
      + payments.filter((p) => p.status === 'PENDING' && p.planDate < new Date().toISOString().slice(0, 10)).length,
    [milestones, payments],
  );

  const handleSaveMilestone = async () => {
    const form = milestoneDialog.form;
    if (!form.milestoneName.trim()) {
      toast.error('请填写节点名称');
      return;
    }
    if (!form.plannedDate) {
      toast.error('请选择计划日期');
      return;
    }
    try {
      if (form.id) {
        await contractMilestoneApi.edit(form);
        toast.success('节点已更新');
      } else {
        await contractMilestoneApi.add(form);
        toast.success('节点已新增');
      }
      setMilestoneDialog({ open: false, form: emptyMilestone(contractId) });
      await fetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    }
  };

  const handleSavePayment = async () => {
    const form = paymentDialog.form;
    if (!form.paymentName.trim()) {
      toast.error('请填写付款名称');
      return;
    }
    if (!form.amount || form.amount <= 0) {
      toast.error('付款金额必须大于 0');
      return;
    }
    try {
      if (form.id) {
        await contractPaymentApi.edit(form);
        toast.success('付款节点已更新');
      } else {
        await contractPaymentApi.add(form);
        toast.success('付款节点已新增');
      }
      setPaymentDialog({ open: false, form: emptyPayment(contractId) });
      await fetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    }
  };

  const handleComplete = async (m: OaContractMilestone) => {
    if (!m.id) return;
    try {
      await contractMilestoneApi.complete(m.id);
      toast.success('节点已标记完成');
      await fetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败'));
    }
  };

  const handlePay = async (p: OaContractPaymentSchedule) => {
    if (!p.id) return;
    try {
      await contractPaymentApi.pay(p.id, p.amount);
      toast.success('付款节点已标记完成');
      await fetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, '操作失败'));
    }
  };

  const handleDeleteMilestone = async () => {
    if (!deletingMilestone?.id) return;
    try {
      await contractMilestoneApi.remove(deletingMilestone.id);
      toast.success('节点已删除');
      setDeletingMilestone(null);
      await fetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  const handleDeletePayment = async () => {
    if (!deletingPayment?.id) return;
    try {
      await contractPaymentApi.remove(deletingPayment.id);
      toast.success('付款节点已删除');
      setDeletingPayment(null);
      await fetchAll();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          <Wallet className="h-4 w-4 text-sky-500" />
          履约 / 付款节点
          {overdueCount > 0 ? (
            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
              {overdueCount} 项逾期
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void fetchAll()} disabled={loading}>
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMilestoneDialog({ open: true, form: emptyMilestone(contractId) })}
          >
            <Plus size={14} />
            履约节点
          </Button>
          <Button
            size="sm"
            onClick={() => setPaymentDialog({ open: true, form: emptyPayment(contractId) })}
          >
            <CreditCard size={14} />
            付款节点
          </Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">履约里程碑 ({milestones.length})</div>
          {milestones.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
              暂无履约节点
            </div>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m) => {
                const meta = MILESTONE_STATUS_LABELS[m.status];
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {m.milestoneName}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                          {MILESTONE_TYPE_LABELS[m.milestoneType]}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            meta.cls,
                          )}
                        >
                          {meta.icon}
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {m.status !== 'DONE' && m.status !== 'CANCELLED' ? (
                          <Button size="sm" variant="ghost" onClick={() => void handleComplete(m)}>
                            标记完成
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setMilestoneDialog({ open: true, form: { ...m } })
                          }
                        >
                          编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeletingMilestone(m)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>计划: {m.plannedDate}</span>
                      {m.actualDate ? <span>实际: {m.actualDate}</span> : null}
                      {m.amount ? <span>金额: ¥{Number(m.amount).toLocaleString()}</span> : null}
                      {m.ownerName ? <span>负责人: {m.ownerName}</span> : null}
                    </div>
                    {m.completionRemark ? (
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        备注: {m.completionRemark}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">付款计划 ({payments.length})</div>
          {payments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
              暂无付款节点
            </div>
          ) : (
            <ul className="space-y-2">
              {payments.map((p) => {
                const meta = PAYMENT_STATUS_LABELS[p.status];
                return (
                  <li
                    key={p.id}
                    className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {p.paymentName}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            meta.cls,
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.status === 'PENDING' ? (
                          <Button size="sm" variant="ghost" onClick={() => void handlePay(p)}>
                            标记已付
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPaymentDialog({ open: true, form: { ...p } })}
                        >
                          编辑
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeletingPayment(p)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>计划: {p.planDate}</span>
                      {p.actualDate ? <span>实际: {p.actualDate}</span> : null}
                      <span>金额: {p.currency || 'CNY'} {Number(p.amount).toLocaleString()}</span>
                      {p.payeeName ? <span>收款方: {p.payeeName}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <BaseDialog
        open={milestoneDialog.open}
        title={milestoneDialog.form.id ? '编辑履约节点' : '新增履约节点'}
        onClose={() => setMilestoneDialog({ open: false, form: emptyMilestone(contractId) })}
        width="normal"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMilestoneDialog({ open: false, form: emptyMilestone(contractId) })}>
              取消
            </Button>
            <Button onClick={() => void handleSaveMilestone()}>保存</Button>
          </div>
        )}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>节点名称 *</Label>
            <Input
              value={milestoneDialog.form.milestoneName}
              onChange={(e) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, milestoneName: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>类型</Label>
            <Select
              value={milestoneDialog.form.milestoneType}
              onValueChange={(v) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, milestoneType: v as ContractMilestoneType } }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['DELIVERY', 'PAYMENT', 'ACCEPTANCE', 'OTHER'] as ContractMilestoneType[]).map((t) => (
                  <SelectItem key={t} value={t}>{MILESTONE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>状态</Label>
            <Select
              value={milestoneDialog.form.status}
              onValueChange={(v) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, status: v as ContractMilestoneStatus } }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['PENDING', 'IN_PROGRESS', 'DONE', 'OVERDUE', 'CANCELLED'] as ContractMilestoneStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{MILESTONE_STATUS_LABELS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>计划日期 *</Label>
            <DatePicker
              value={milestoneDialog.form.plannedDate}
              onChange={(e) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, plannedDate: e.target.value || '' } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>实际日期</Label>
            <DatePicker
              value={milestoneDialog.form.actualDate || ''}
              onChange={(e) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, actualDate: e.target.value || undefined } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>金额</Label>
            <Input
              type="number"
              value={milestoneDialog.form.amount ?? ''}
              onChange={(e) =>
                setMilestoneDialog((c) => ({
                  ...c,
                  form: { ...c.form, amount: e.target.value === '' ? undefined : Number(e.target.value) },
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>负责人</Label>
            <Input
              value={milestoneDialog.form.ownerName || ''}
              onChange={(e) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, ownerName: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>备注</Label>
            <Textarea
              rows={2}
              value={milestoneDialog.form.completionRemark || ''}
              onChange={(e) =>
                setMilestoneDialog((c) => ({ ...c, form: { ...c.form, completionRemark: e.target.value } }))
              }
            />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={paymentDialog.open}
        title={paymentDialog.form.id ? '编辑付款节点' : '新增付款节点'}
        onClose={() => setPaymentDialog({ open: false, form: emptyPayment(contractId) })}
        width="normal"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentDialog({ open: false, form: emptyPayment(contractId) })}>
              取消
            </Button>
            <Button onClick={() => void handleSavePayment()}>保存</Button>
          </div>
        )}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>付款名称 *</Label>
            <Input
              value={paymentDialog.form.paymentName}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, paymentName: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>金额 *</Label>
            <Input
              type="number"
              value={paymentDialog.form.amount}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, amount: Number(e.target.value) } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>币种</Label>
            <Input
              value={paymentDialog.form.currency || 'CNY'}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, currency: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>计划日期 *</Label>
            <DatePicker
              value={paymentDialog.form.planDate}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, planDate: e.target.value || '' } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>实际日期</Label>
            <DatePicker
              value={paymentDialog.form.actualDate || ''}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, actualDate: e.target.value || undefined } }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>状态</Label>
            <Select
              value={paymentDialog.form.status}
              onValueChange={(v) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, status: v as PaymentStatus } }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as PaymentStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABELS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>收款方</Label>
            <Input
              value={paymentDialog.form.payeeName || ''}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, payeeName: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>备注</Label>
            <Textarea
              rows={2}
              value={paymentDialog.form.remark || ''}
              onChange={(e) =>
                setPaymentDialog((c) => ({ ...c, form: { ...c.form, remark: e.target.value } }))
              }
            />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deletingMilestone)}
        title="删除履约节点"
        message={deletingMilestone ? `确定删除节点「${deletingMilestone.milestoneName}」？` : ''}
        confirmText="删除"
        danger
        onCancel={() => setDeletingMilestone(null)}
        onConfirm={handleDeleteMilestone}
      />

      <ConfirmDialog
        open={Boolean(deletingPayment)}
        title="删除付款节点"
        message={deletingPayment ? `确定删除付款节点「${deletingPayment.paymentName}」？` : ''}
        confirmText="删除"
        danger
        onCancel={() => setDeletingPayment(null)}
        onConfirm={handleDeletePayment}
      />
    </div>
  );
};

export default ContractMilestoneSection;
