import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  createCompensation,
  listCompensations,
  payCompensation,
  updateCompensation,
  type HrWorkInjuryCompensation,
  type HrWorkInjuryCompensationPayload,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, formatMoneyValue, hasWorkflowStatus, normalizeRows } from '../hrShared';

const itemTypeLabel: Record<string, string> = {
  MEDICAL: '医疗费',
  DISABILITY_ALLOWANCE: '伤残津贴',
  LUMP_SUM: '一次性补助',
  FUNERAL: '丧葬费',
  DEPENDENT_SUPPORT: '抚恤金',
};

const statusLabel: Record<string, string> = {
  PLANNED: '待支付',
  PAID: '已支付',
  REJECTED: '已驳回',
};

const emptyForm: Partial<HrWorkInjuryCompensationPayload> = {
  itemType: 'MEDICAL',
  amount: undefined,
  paymentStatus: 'PLANNED',
  bankAccount: '',
  remark: '',
};

export const HrWorkInjuryCompensationPage: React.FC = () => {
  const [injuryId, setInjuryId] = useState('');
  const [rows, setRows] = useState<HrWorkInjuryCompensation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrWorkInjuryCompensation | null>(null);
  const [form, setForm] = useState<Partial<HrWorkInjuryCompensationPayload>>(emptyForm);

  const load = useCallback(async () => {
    if (!injuryId) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await listCompensations(Number(injuryId));
      setRows(normalizeRows<HrWorkInjuryCompensation>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载赔偿记录失败'));
    } finally {
      setLoading(false);
    }
  }, [injuryId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: HrWorkInjuryCompensation) => {
    setEditing(row);
    setForm({
      itemType: row.itemType,
      amount: row.amount,
      paymentStatus: row.paymentStatus,
      bankAccount: row.bankAccount,
      remark: row.remark,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!injuryId) { toast.error('请填写工伤 ID'); return; }
    try {
      if (editing) {
        await updateCompensation(Number(injuryId), editing.id, form);
        toast.success('已更新');
      } else {
        await createCompensation(Number(injuryId), { ...form, injuryId: Number(injuryId) } as HrWorkInjuryCompensationPayload);
        toast.success('已创建');
      }
      setOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handlePay = async (row: HrWorkInjuryCompensation) => {
    try {
      await payCompensation(Number(injuryId), row.id);
      toast.success('已标记支付');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">赔偿登记</div>
          <div className="mt-1 text-xs text-slate-500">国标五项赔偿项 + 银行账号(加密)+ 支付状态机</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">工伤记录 ID</Label>
            <Input value={injuryId} onChange={(e) => setInjuryId(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading || !injuryId}>查询</Button>
          <Button onClick={openCreate} disabled={!injuryId}>新增赔偿项</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>赔偿项</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>支付时间</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-slate-400">{injuryId ? '暂无赔偿记录' : '请输入工伤记录 ID'}</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{enumLabel(itemTypeLabel, row.itemType)}</TableCell>
                  <TableCell>{formatMoneyValue(row.amount)}</TableCell>
                  <TableCell>{enumLabel(statusLabel, row.paymentStatus)}</TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.paidAt)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs">{row.remark ?? '-'}</TableCell>
                  <TableCell className="space-x-2 text-xs">
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                    {hasWorkflowStatus(row.paymentStatus, 'PLANNED') && (
                      <Button size="sm" onClick={() => void handlePay(row)}>标记已支付</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑赔偿项' : '新增赔偿项'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>赔偿项</Label>
              <Select value={String(form.itemType ?? 'MEDICAL')} onValueChange={(v) => setForm({ ...form, itemType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(itemTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>金额</Label>
              <Input type="number" value={String(form.amount ?? '')} onChange={(e) => setForm({ ...form, amount: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div className="col-span-2">
              <Label>银行账号(加密)</Label>
              <Input value={form.bankAccount ?? ''} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>备注</Label>
            <Textarea rows={2} value={form.remark ?? ''} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrWorkInjuryCompensationPage;
