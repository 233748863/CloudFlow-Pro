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
  createArbitration,
  listArbitrations,
  updateArbitration,
  type HrDisputeArbitration,
  type HrDisputeArbitrationPayload,
} from '@/services/api/hr';
import { formatDateValue, formatMoneyValue, normalizeRows } from '../hrShared';

const emptyForm: Partial<HrDisputeArbitrationPayload> = {
  arbitrationCommittee: '',
  caseNo: '',
  acceptedAt: '',
  awardNo: '',
  awardResult: '',
  awardAmount: undefined,
  effectiveDate: '',
  awardDocUrl: '',
};

export const HrDisputeArbitrationPage: React.FC = () => {
  const [disputeId, setDisputeId] = useState('');
  const [rows, setRows] = useState<HrDisputeArbitration[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrDisputeArbitration | null>(null);
  const [form, setForm] = useState<Partial<HrDisputeArbitrationPayload>>(emptyForm);

  const load = useCallback(async () => {
    if (!disputeId) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await listArbitrations(Number(disputeId));
      setRows(normalizeRows<HrDisputeArbitration>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载仲裁记录失败'));
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: HrDisputeArbitration) => {
    setEditing(row);
    setForm({
      arbitrationCommittee: row.arbitrationCommittee,
      caseNo: row.caseNo,
      acceptedAt: row.acceptedAt,
      awardNo: row.awardNo,
      awardResult: row.awardResult,
      awardAmount: row.awardAmount,
      effectiveDate: row.effectiveDate,
      awardDocUrl: row.awardDocUrl,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!disputeId) { toast.error('请填写争议 ID'); return; }
    try {
      if (editing) {
        await updateArbitration(Number(disputeId), editing.id, form);
        toast.success('已更新');
      } else {
        await createArbitration(Number(disputeId), { ...form, disputeId: Number(disputeId) } as HrDisputeArbitrationPayload);
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
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">仲裁记录</div>
          <div className="mt-1 text-xs text-slate-500">仲裁委 / 案号 / 裁决书登记</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">争议 ID</Label>
            <Input value={disputeId} onChange={(e) => setDisputeId(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading || !disputeId}>查询</Button>
          <Button onClick={openCreate} disabled={!disputeId}>新增仲裁</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>仲裁委</TableHead>
              <TableHead>案号</TableHead>
              <TableHead>受理日</TableHead>
              <TableHead>裁决号</TableHead>
              <TableHead>裁决结果</TableHead>
              <TableHead>裁决金额</TableHead>
              <TableHead>生效日</TableHead>
              <TableHead>裁决书</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-6 text-center text-sm text-slate-400">{disputeId ? '暂无仲裁记录' : '请输入争议 ID'}</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.arbitrationCommittee ?? '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.caseNo ?? '-'}</TableCell>
                  <TableCell className="text-xs">{formatDateValue(row.acceptedAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{row.awardNo ?? '-'}</TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs">{row.awardResult ?? '-'}</TableCell>
                  <TableCell>{formatMoneyValue(row.awardAmount)}</TableCell>
                  <TableCell className="text-xs">{formatDateValue(row.effectiveDate)}</TableCell>
                  <TableCell>{row.awardDocUrl ? <a href={row.awardDocUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-xs">查看</a> : '-'}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑仲裁' : '新增仲裁'}
        width="wide"
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
              <Label>仲裁委</Label>
              <Input value={form.arbitrationCommittee ?? ''} onChange={(e) => setForm({ ...form, arbitrationCommittee: e.target.value })} />
            </div>
            <div>
              <Label>案号</Label>
              <Input value={form.caseNo ?? ''} onChange={(e) => setForm({ ...form, caseNo: e.target.value })} />
            </div>
            <div>
              <Label>受理日</Label>
              <Input type="date" value={String(form.acceptedAt ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, acceptedAt: e.target.value })} />
            </div>
            <div>
              <Label>裁决号</Label>
              <Input value={form.awardNo ?? ''} onChange={(e) => setForm({ ...form, awardNo: e.target.value })} />
            </div>
            <div>
              <Label>裁决金额</Label>
              <Input type="number" value={String(form.awardAmount ?? '')} onChange={(e) => setForm({ ...form, awardAmount: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <Label>生效日</Label>
              <Input type="date" value={String(form.effectiveDate ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>裁决书 URL</Label>
              <Input value={form.awardDocUrl ?? ''} onChange={(e) => setForm({ ...form, awardDocUrl: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>裁决结果(支持 / 部分支持 / 驳回)</Label>
            <Textarea rows={4} value={form.awardResult ?? ''} onChange={(e) => setForm({ ...form, awardResult: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrDisputeArbitrationPage;
