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
  createRehabilitation,
  listRehabilitation,
  updateRehabilitation,
  type HrWorkInjuryRehabilitation,
  type HrWorkInjuryRehabilitationPayload,
} from '@/services/api/hr';
import { enumLabel, formatDateValue, normalizeRows } from '../hrShared';

const positionAdjustmentLabel: Record<string, string> = {
  SAME: '原岗位',
  RELIGHTED: '减轻工作',
  CHANGED: '调整岗位',
};

const statusLabel: Record<string, string> = {
  IN_REHAB: '康复中',
  RETURNED: '已返岗',
  UNABLE_RETURN: '无法返岗',
};

const emptyForm: Partial<HrWorkInjuryRehabilitationPayload> = {
  returnDate: '',
  positionAdjustment: 'SAME',
  newPositionId: undefined,
  abilityAssessment: '',
  followUpAt: '',
  status: 'IN_REHAB',
};

export const HrWorkInjuryRehabilitationPage: React.FC = () => {
  const [injuryId, setInjuryId] = useState('');
  const [rows, setRows] = useState<HrWorkInjuryRehabilitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrWorkInjuryRehabilitation | null>(null);
  const [form, setForm] = useState<Partial<HrWorkInjuryRehabilitationPayload>>(emptyForm);

  const load = useCallback(async () => {
    if (!injuryId) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await listRehabilitation(Number(injuryId));
      setRows(normalizeRows<HrWorkInjuryRehabilitation>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载康复记录失败'));
    } finally {
      setLoading(false);
    }
  }, [injuryId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: HrWorkInjuryRehabilitation) => {
    setEditing(row);
    setForm({
      returnDate: row.returnDate,
      positionAdjustment: row.positionAdjustment,
      newPositionId: row.newPositionId,
      abilityAssessment: row.abilityAssessment,
      followUpAt: row.followUpAt,
      status: row.status,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!injuryId) { toast.error('请填写工伤 ID'); return; }
    try {
      if (editing) {
        await updateRehabilitation(Number(injuryId), editing.id, form);
        toast.success('已更新');
      } else {
        await createRehabilitation(Number(injuryId), { ...form, injuryId: Number(injuryId) } as HrWorkInjuryRehabilitationPayload);
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
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">康复跟踪</div>
          <div className="mt-1 text-xs text-slate-500">返岗安排 / 岗位调整 / 能力评估</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">工伤记录 ID</Label>
            <Input value={injuryId} onChange={(e) => setInjuryId(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading || !injuryId}>查询</Button>
          <Button onClick={openCreate} disabled={!injuryId}>新增康复</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>状态</TableHead>
              <TableHead>返岗日</TableHead>
              <TableHead>岗位调整</TableHead>
              <TableHead>新岗位 ID</TableHead>
              <TableHead>下次随访</TableHead>
              <TableHead>能力评估</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">{injuryId ? '暂无康复记录' : '请输入工伤记录 ID'}</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                  <TableCell className="text-xs">{formatDateValue(row.returnDate)}</TableCell>
                  <TableCell>{enumLabel(positionAdjustmentLabel, row.positionAdjustment)}</TableCell>
                  <TableCell>{row.newPositionId ?? '-'}</TableCell>
                  <TableCell className="text-xs">{formatDateValue(row.followUpAt)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-xs">{row.abilityAssessment ?? '-'}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑康复记录' : '新增康复记录'}
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
              <Label>状态</Label>
              <Select value={String(form.status ?? 'IN_REHAB')} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>返岗日</Label>
              <Input type="date" value={String(form.returnDate ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
            </div>
            <div>
              <Label>岗位调整</Label>
              <Select value={String(form.positionAdjustment ?? 'SAME')} onValueChange={(v) => setForm({ ...form, positionAdjustment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(positionAdjustmentLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>新岗位 ID</Label>
              <Input type="number" value={String(form.newPositionId ?? '')} onChange={(e) => setForm({ ...form, newPositionId: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div className="col-span-2">
              <Label>下次随访时间</Label>
              <Input type="datetime-local" value={String(form.followUpAt ?? '').slice(0, 16)} onChange={(e) => setForm({ ...form, followUpAt: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>能力评估</Label>
            <Textarea rows={3} value={form.abilityAssessment ?? ''} onChange={(e) => setForm({ ...form, abilityAssessment: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrWorkInjuryRehabilitationPage;
