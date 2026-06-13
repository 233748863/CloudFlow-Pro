import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
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
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentCalibrationSession,
  HrTalentReview,
  createCalibrationSession,
  listCalibrationSessions,
  listTalentReviews,
  updateCalibrationSession,
} from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeValue, normalizeRows } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const defaultForm = { sessionNo: '', scheduledAt: '', location: '', agenda: '', minutes: '', status: 'PLANNED' };

export const HrTalentCalibrationPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:calibration:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:calibration:add') ?? true;

  const [reviews, setReviews] = useState<HrTalentReview[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<HrTalentCalibrationSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrTalentCalibrationSession | null>(null);
  const [form, setForm] = useState(defaultForm);
  const statusOptions = useDict('hr_talent_calibration_status').getOptions();

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
    setForm(defaultForm);
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

  const filters = (
    <FilterBar
      filters={[
        <div key="review" className="w-full sm:w-64">
          <Select value={reviewId ? String(reviewId) : ''} onValueChange={(v) => setReviewId(Number(v))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="选择盘点活动" /></SelectTrigger>
            <SelectContent>
              {reviews.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.reviewName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${sessions.length} 条` }]}
      actions={[
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading || !reviewId}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        ...(canAdd
          ? [
              <Button key="add" size="sm" onClick={openCreate} disabled={!reviewId}>
                <Plus className="mr-1.5 h-4 w-4" />新建会议
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard fill>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>会议编号</TableHead>
              <TableHead>时间</TableHead>
              <TableHead>地点</TableHead>
              <TableHead>议程</TableHead>
              <TableHead>状态</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {!reviewId ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">请选择盘点活动</td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">暂无校准会议</td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{s.sessionNo}</td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeValue(s.scheduledAt) || '-'}</td>
                  <td className="px-4 py-3 text-sm">{s.location || '-'}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-sm">{s.agenda || '-'}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_talent_calibration_status" value={s.status} fallback="-" /></td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑/纪要', semantic: 'edit', permissionKey: 'hr:talent:calibration:edit', onClick: () => openEdit(s) },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />

      <BaseDialog
        open={open}
        title={editing ? '编辑会议 / 录入纪要' : '新建校准会议'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
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
                {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
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
