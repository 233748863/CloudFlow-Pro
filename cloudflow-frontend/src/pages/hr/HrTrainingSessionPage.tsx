import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
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
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTrainingSession,
  HrTrainingSessionPayload,
  HrTrainingCourse,
  listTrainingSessions,
  createTrainingSession,
  updateTrainingSession,
  deleteTrainingSession,
  changeTrainingSessionStatus,
  listTrainingCourses,
} from '@/services/api/hr';
import { normalizeRows, formatDateTimeValue, enumLabel } from './hrShared';

const sessionStatusLabel: Record<string, string> = {
  PLANNED: '计划中',
  REGISTERING: '报名中',
  ONGOING: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const defaultForm: HrTrainingSessionPayload = {
  courseId: 0,
  startTime: '',
  endTime: '',
  capacity: 30,
  status: 'PLANNED',
};

export const HrTrainingSessionPage: React.FC = () => {
  const [rows, setRows] = useState<HrTrainingSession[]>([]);
  const [courses, setCourses] = useState<HrTrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTrainingSessionPayload>(defaultForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, courseRes] = await Promise.all([listTrainingSessions({ pageSize: 200 }), listTrainingCourses({ pageSize: 500 })]);
      setRows(normalizeRows<HrTrainingSession>(sessRes));
      setCourses(normalizeRows<HrTrainingCourse>(courseRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '班次加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.courseId || !form.startTime || !form.endTime) {
      toast.error('请选择课程并填写开始/结束时间');
      return;
    }
    try {
      if (editingId) await updateTrainingSession(editingId, form);
      else await createTrainingSession(form);
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try { await deleteTrainingSession(id); await load(); } catch (error) { toast.error(getErrorMessage(error, '删除失败')); }
  };

  const handleAction = async (row: HrTrainingSession, action: 'register' | 'start' | 'complete' | 'cancel') => {
    try {
      await changeTrainingSessionStatus(row.id, action);
      toast.success('已更新');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">培训班次</div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />新建班次
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />刷新
            </Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>班次号</TableHead>
                  <TableHead>课程</TableHead>
                  <TableHead>地点</TableHead>
                  <TableHead>开始</TableHead>
                  <TableHead>结束</TableHead>
                  <TableHead>容量</TableHead>
                  <TableHead>已报名</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : rows.length ? rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.sessionNo || `#${row.id}`}</TableCell>
                    <TableCell>{courses.find((c) => c.id === row.courseId)?.courseName || `课程#${row.courseId}`}</TableCell>
                    <TableCell>{row.location || '-'}</TableCell>
                    <TableCell>{formatDateTimeValue(row.startTime)}</TableCell>
                    <TableCell>{formatDateTimeValue(row.endTime)}</TableCell>
                    <TableCell>{row.capacity}</TableCell>
                    <TableCell>{row.enrolledCount ?? 0}</TableCell>
                    <TableCell>{enumLabel(sessionStatusLabel, row.status)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm(row); setOpen(true); }}>编辑</Button>
                        {row.status === 'PLANNED' ? <Button size="sm" variant="outline" onClick={() => void handleAction(row, 'register')}>开放报名</Button> : null}
                        {row.status === 'REGISTERING' ? <Button size="sm" variant="outline" onClick={() => void handleAction(row, 'start')}>开始</Button> : null}
                        {row.status === 'ONGOING' ? <Button size="sm" variant="outline" onClick={() => void handleAction(row, 'complete')}>完成</Button> : null}
                        {row.status !== 'COMPLETED' && row.status !== 'CANCELLED' ? <Button size="sm" variant="ghost" onClick={() => void handleAction(row, 'cancel')}>取消</Button> : null}
                        <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">暂无班次</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={open}
        title={editingId ? '编辑班次' : '新建班次'}
        onClose={() => setOpen(false)}
        width="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>课程</Label>
            <Select value={form.courseId ? String(form.courseId) : ''} onValueChange={(v) => setForm((p) => ({ ...p, courseId: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="选择课程" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.courseName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>开始时间</Label><Input type="datetime-local" value={form.startTime?.slice(0, 16) ?? ''} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} /></div>
            <div><Label>结束时间</Label><Input type="datetime-local" value={form.endTime?.slice(0, 16) ?? ''} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>地点</Label><Input value={form.location ?? ''} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></div>
            <div><Label>容量</Label><Input type="number" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: Number(e.target.value) || 0 }))} /></div>
          </div>
          <div><Label>备注</Label><Input value={form.remark ?? ''} onChange={(e) => setForm((p) => ({ ...p, remark: e.target.value }))} /></div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTrainingSessionPage;
