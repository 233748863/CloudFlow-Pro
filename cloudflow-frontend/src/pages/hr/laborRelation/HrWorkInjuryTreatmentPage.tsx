import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
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
  createTreatment,
  listTreatments,
  updateTreatment,
  type HrWorkInjuryTreatment,
  type HrWorkInjuryTreatmentPayload,
} from '@/services/api/hr';
import { formatDateValue, formatMoneyValue, normalizeRows } from '../hrShared';

const emptyForm: Partial<HrWorkInjuryTreatmentPayload> = {
  hospitalName: '',
  admitDate: '',
  dischargeDate: '',
  totalCost: undefined,
  insuranceCovered: undefined,
  selfPaid: undefined,
  diagnosis: '',
  treatmentSummary: '',
};

export const HrWorkInjuryTreatmentPage: React.FC = () => {
  const [injuryId, setInjuryId] = useState('');
  const [rows, setRows] = useState<HrWorkInjuryTreatment[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrWorkInjuryTreatment | null>(null);
  const [form, setForm] = useState<Partial<HrWorkInjuryTreatmentPayload>>(emptyForm);

  const load = useCallback(async () => {
    if (!injuryId) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await listTreatments(Number(injuryId));
      setRows(normalizeRows<HrWorkInjuryTreatment>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载医疗记录失败'));
    } finally {
      setLoading(false);
    }
  }, [injuryId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: HrWorkInjuryTreatment) => {
    setEditing(row);
    setForm({
      hospitalName: row.hospitalName,
      admitDate: row.admitDate,
      dischargeDate: row.dischargeDate,
      totalCost: row.totalCost,
      insuranceCovered: row.insuranceCovered,
      selfPaid: row.selfPaid,
      diagnosis: row.diagnosis,
      treatmentSummary: row.treatmentSummary,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!injuryId) { toast.error('请填写工伤 ID'); return; }
    try {
      if (editing) {
        await updateTreatment(Number(injuryId), editing.id, form);
        toast.success('已更新');
      } else {
        await createTreatment(Number(injuryId), { ...form, injuryId: Number(injuryId) } as HrWorkInjuryTreatmentPayload);
        toast.success('已创建');
      }
      setOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">医疗记录</div>
          <div className="mt-1 text-xs text-slate-500">住院 / 门诊费用清单与诊断摘要</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">工伤记录 ID</Label>
            <Input value={injuryId} onChange={(e) => setInjuryId(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading || !injuryId}>查询</Button>
          <Button onClick={openCreate} disabled={!injuryId}>新增医疗</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>医院</TableHead>
              <TableHead>入院 / 出院</TableHead>
              <TableHead>总费用</TableHead>
              <TableHead>保险支付</TableHead>
              <TableHead>自费</TableHead>
              <TableHead>诊断</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">{injuryId ? '暂无医疗记录' : '请输入工伤记录 ID'}</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.hospitalName ?? '-'}</TableCell>
                  <TableCell className="text-xs">{formatDateValue(row.admitDate)} ~ {formatDateValue(row.dischargeDate)}</TableCell>
                  <TableCell>{formatMoneyValue(row.totalCost)}</TableCell>
                  <TableCell>{formatMoneyValue(row.insuranceCovered)}</TableCell>
                  <TableCell>{formatMoneyValue(row.selfPaid)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs">{row.diagnosis ?? '-'}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑医疗记录' : '新增医疗记录'}
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
            <div className="col-span-2">
              <Label>医院</Label>
              <Input value={form.hospitalName ?? ''} onChange={(e) => setForm({ ...form, hospitalName: e.target.value })} />
            </div>
            <div>
              <Label>入院日期</Label>
              <Input type="date" value={String(form.admitDate ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, admitDate: e.target.value })} />
            </div>
            <div>
              <Label>出院日期</Label>
              <Input type="date" value={String(form.dischargeDate ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, dischargeDate: e.target.value })} />
            </div>
            <div>
              <Label>总费用</Label>
              <Input type="number" value={String(form.totalCost ?? '')} onChange={(e) => setForm({ ...form, totalCost: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <Label>保险报销</Label>
              <Input type="number" value={String(form.insuranceCovered ?? '')} onChange={(e) => setForm({ ...form, insuranceCovered: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <Label>自费</Label>
              <Input type="number" value={String(form.selfPaid ?? '')} onChange={(e) => setForm({ ...form, selfPaid: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div>
            <Label>诊断(敏感字段加密存储)</Label>
            <Textarea rows={2} value={form.diagnosis ?? ''} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
          </div>
          <div>
            <Label>治疗摘要</Label>
            <Textarea rows={3} value={form.treatmentSummary ?? ''} onChange={(e) => setForm({ ...form, treatmentSummary: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrWorkInjuryTreatmentPage;
