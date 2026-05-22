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
  createMediation,
  listMediations,
  updateMediation,
  type HrDisputeMediation,
  type HrDisputeMediationPayload,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, formatDateValue, normalizeRows } from '../hrShared';

const resultLabel: Record<string, string> = {
  SUCCESS: '调解成功',
  PARTIAL: '部分达成',
  FAILED: '调解失败',
};

const emptyForm: Partial<HrDisputeMediationPayload> = {
  mediatorId: undefined,
  mediationDate: '',
  location: '',
  processSummary: '',
  result: 'SUCCESS',
  agreementUrl: '',
};

export const HrDisputeMediationPage: React.FC = () => {
  const [disputeId, setDisputeId] = useState('');
  const [rows, setRows] = useState<HrDisputeMediation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrDisputeMediation | null>(null);
  const [form, setForm] = useState<Partial<HrDisputeMediationPayload>>(emptyForm);

  const load = useCallback(async () => {
    if (!disputeId) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await listMediations(Number(disputeId));
      setRows(normalizeRows<HrDisputeMediation>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载调解记录失败'));
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: HrDisputeMediation) => {
    setEditing(row);
    setForm({
      mediatorId: row.mediatorId,
      mediationDate: row.mediationDate,
      location: row.location,
      processSummary: row.processSummary,
      result: row.result,
      agreementUrl: row.agreementUrl,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!disputeId) { toast.error('请填写争议 ID'); return; }
    try {
      if (editing) {
        await updateMediation(Number(disputeId), editing.id, form);
        toast.success('已更新');
      } else {
        await createMediation(Number(disputeId), { ...form, disputeId: Number(disputeId) } as HrDisputeMediationPayload);
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
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">调解记录</div>
          <div className="mt-1 text-xs text-slate-500">劳动争议调解过程记录</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Label className="text-xs text-slate-500">争议 ID</Label>
            <Input value={disputeId} onChange={(e) => setDisputeId(e.target.value)} />
          </div>
          <Button onClick={() => void load()} disabled={loading || !disputeId}>查询</Button>
          <Button onClick={openCreate} disabled={!disputeId}>新增调解</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>调解日期</TableHead>
              <TableHead>调解员</TableHead>
              <TableHead>地点</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>协议</TableHead>
              <TableHead>签订时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">{disputeId ? '暂无调解记录' : '请输入争议 ID'}</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{formatDateValue(row.mediationDate)}</TableCell>
                  <TableCell>{row.mediatorId ?? '-'}</TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs">{row.location ?? '-'}</TableCell>
                  <TableCell>{enumLabel(resultLabel, row.result)}</TableCell>
                  <TableCell>
                    {row.agreementUrl ? <a href={row.agreementUrl} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-xs">查看</a> : '-'}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.signedAt)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑调解' : '新增调解'}
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
              <Label>调解员</Label>
              <UserSelector single allowClear value={form.mediatorId == null ? null : String(form.mediatorId)} onChange={(id) => setForm({ ...form, mediatorId: id ? Number(id) : undefined })} placeholder="选择调解员" />
            </div>
            <div>
              <Label>调解日期</Label>
              <Input type="date" value={String(form.mediationDate ?? '').slice(0, 10)} onChange={(e) => setForm({ ...form, mediationDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>地点</Label>
              <Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <Label>调解结果</Label>
              <Select value={String(form.result ?? 'SUCCESS')} onValueChange={(v) => setForm({ ...form, result: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(resultLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>协议 URL</Label>
              <Input value={form.agreementUrl ?? ''} onChange={(e) => setForm({ ...form, agreementUrl: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>过程纪要</Label>
            <Textarea rows={5} value={form.processSummary ?? ''} onChange={(e) => setForm({ ...form, processSummary: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrDisputeMediationPage;
