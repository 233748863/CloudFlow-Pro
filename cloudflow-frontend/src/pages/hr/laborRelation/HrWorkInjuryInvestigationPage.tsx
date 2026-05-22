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
  UserSelector,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  createInvestigation,
  listInvestigations,
  updateInvestigation,
  type HrWorkInjuryInvestigation,
  type HrWorkInjuryInvestigationPayload,
} from '@/services/api/hr';
import { enumLabel, formatDateValue, normalizeRows } from '../hrShared';

const responsibilityLabel: Record<string, string> = {
  WORK_RELATED: '工作相关',
  COMMUTE: '上下班通勤',
  THIRD_PARTY: '第三方责任',
};

const emptyForm: Partial<HrWorkInjuryInvestigationPayload> = {
  investigatorId: undefined,
  investigationDate: '',
  witnessStatements: '',
  conclusion: '',
  responsibilityType: 'WORK_RELATED',
};

export const HrWorkInjuryInvestigationPage: React.FC = () => {
  const [injuryId, setInjuryId] = useState('');
  const [rows, setRows] = useState<HrWorkInjuryInvestigation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrWorkInjuryInvestigation | null>(null);
  const [form, setForm] = useState<Partial<HrWorkInjuryInvestigationPayload>>(emptyForm);

  const load = useCallback(async () => {
    if (!injuryId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listInvestigations(Number(injuryId));
      setRows(normalizeRows<HrWorkInjuryInvestigation>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载调查记录失败'));
    } finally {
      setLoading(false);
    }
  }, [injuryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: HrWorkInjuryInvestigation) => {
    setEditing(row);
    setForm({
      investigatorId: row.investigatorId,
      investigationDate: row.investigationDate,
      witnessStatements: row.witnessStatements,
      conclusion: row.conclusion,
      responsibilityType: row.responsibilityType,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!injuryId) {
      toast.error('请填写工伤 ID');
      return;
    }
    try {
      if (editing) {
        await updateInvestigation(Number(injuryId), editing.id, form);
        toast.success('已更新');
      } else {
        await createInvestigation(Number(injuryId), { ...form, injuryId: Number(injuryId) } as HrWorkInjuryInvestigationPayload);
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
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">工伤调查</div>
          <div className="mt-1 text-xs text-slate-500">调查记录:现场照片 / 证人证言 / 责任认定结论</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">工伤记录 ID</Label>
            <Input value={injuryId} onChange={(e) => setInjuryId(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading || !injuryId}>查询</Button>
          <Button onClick={openCreate} disabled={!injuryId}>新建调查</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>调查日期</TableHead>
              <TableHead>调查员</TableHead>
              <TableHead>责任类型</TableHead>
              <TableHead>结论</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-slate-400">{injuryId ? '暂无调查记录' : '请输入工伤记录 ID'}</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{formatDateValue(row.investigationDate)}</TableCell>
                  <TableCell>{row.investigatorId ?? '-'}</TableCell>
                  <TableCell>{enumLabel(responsibilityLabel, row.responsibilityType)}</TableCell>
                  <TableCell className="max-w-[20rem] truncate text-xs">{row.conclusion ?? '-'}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑调查' : '新建调查'}
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
              <Label>调查员</Label>
              <UserSelector single allowClear value={form.investigatorId == null ? null : String(form.investigatorId)} onChange={(id) => setForm({ ...form, investigatorId: id ? Number(id) : undefined })} placeholder="选择调查员" />
            </div>
            <div>
              <Label>调查日期</Label>
              <Input type="date" value={String(form.investigationDate ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, investigationDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>责任类型</Label>
              <Select value={String(form.responsibilityType ?? 'WORK_RELATED')} onValueChange={(v) => setForm({ ...form, responsibilityType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(responsibilityLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>证人证言</Label>
            <Textarea rows={3} value={form.witnessStatements ?? ''} onChange={(e) => setForm({ ...form, witnessStatements: e.target.value })} />
          </div>
          <div>
            <Label>调查结论</Label>
            <Textarea rows={3} value={form.conclusion ?? ''} onChange={(e) => setForm({ ...form, conclusion: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrWorkInjuryInvestigationPage;
