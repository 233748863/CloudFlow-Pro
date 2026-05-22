import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentCalibrationSession,
  HrTalentReview,
  createCalibrationSession,
  listCalibrationSessions,
  listTalentReviews,
  updateCalibrationSession,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, normalizeRows } from '../hrShared';

const statusLabel: Record<string, string> = {
  PLANNED: '已计划',
  ONGOING: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

export const HrTalentCalibrationPage: React.FC = () => {
  const [reviews, setReviews] = useState<HrTalentReview[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<HrTalentCalibrationSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrTalentCalibrationSession | null>(null);
  const [form, setForm] = useState({ sessionNo: '', scheduledAt: '', location: '', agenda: '', minutes: '', status: 'PLANNED' });

  useEffect(() => {
    void (async () => {
      try {
        const res = await listTalentReviews({ pageSize: 200 });
        const list = normalizeRows<HrTalentReview>(res);
        setReviews(list);
        if (list.length) setReviewId(list[0].id);
      } catch (error) {
        toast.error(getErrorMessage(error, '盘点列表加载失败'));
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!reviewId) return;
    setLoading(true);
    try {
      const res = await listCalibrationSessions(reviewId);
      setSessions(normalizeRows<HrTalentCalibrationSession>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '校准会议加载失败'));
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ sessionNo: '', scheduledAt: '', location: '', agenda: '', minutes: '', status: 'PLANNED' });
    setOpen(true);
  };

  const openEdit = (s: HrTalentCalibrationSession) => {
    setEditing(s);
    setForm({
      sessionNo: s.sessionNo ?? '',
      scheduledAt: s.scheduledAt ?? '',
      location: s.location ?? '',
      agenda: s.agenda ?? '',
      minutes: s.minutes ?? '',
      status: s.status ?? 'PLANNED',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!reviewId) {
      toast.error('请先选择盘点活动');
      return;
    }
    try {
      if (editing) {
        await updateCalibrationSession(editing.id, form);
      } else {
        await createCalibrationSession(reviewId, form as never);
      }
      toast.success('已保存');
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">校准会议</div>
        <div className="w-64">
          <Select value={reviewId ? String(reviewId) : ''} onValueChange={(v) => setReviewId(Number(v))}>
            <SelectTrigger><SelectValue placeholder="选择盘点活动" /></SelectTrigger>
            <SelectContent>
              {reviews.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.reviewName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={openCreate} disabled={!reviewId}><Plus className="mr-2 h-4 w-4" />新建会议</Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading || !reviewId}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会议编号</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>地点</TableHead>
                  <TableHead>议程</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!reviewId ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">请选择盘点活动</TableCell></TableRow>
                ) : loading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : sessions.length ? sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.sessionNo}</TableCell>
                    <TableCell>{formatDateTimeValue(s.scheduledAt) || '-'}</TableCell>
                    <TableCell>{s.location || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{s.agenda || '-'}</TableCell>
                    <TableCell>{enumLabel(statusLabel, s.status)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>编辑/纪要</Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无校准会议</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />
      <BaseDialog
        open={open}
        title={editing ? '编辑会议 / 录入纪要' : '新建校准会议'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>会议编号</Label><Input value={form.sessionNo} onChange={(e) => setForm((p) => ({ ...p, sessionNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>时间</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} /></div>
            <div><Label>地点</Label><Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></div>
          </div>
          <div>
            <Label>状态</Label>
            <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>议程</Label><Textarea value={form.agenda} onChange={(e) => setForm((p) => ({ ...p, agenda: e.target.value }))} rows={3} /></div>
          <div><Label>会议纪要</Label><Textarea value={form.minutes} onChange={(e) => setForm((p) => ({ ...p, minutes: e.target.value }))} rows={6} /></div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTalentCalibrationPage;
