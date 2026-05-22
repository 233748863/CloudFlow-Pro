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
  Textarea,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentDevelopmentAction,
  completeDevelopmentAction,
  createDevelopmentAction,
  deleteDevelopmentAction,
  listDevelopmentActions,
  updateDevelopmentAction,
} from '@/services/api/hr';
import { enumLabel, formatDateValue, normalizeRows } from '../hrShared';

const actionTypeLabel: Record<string, string> = {
  TRAINING: '培训',
  MENTOR: '导师制',
  JOB_ROTATION: '岗位轮换',
  STRETCH_PROJECT: '挑战项目',
  EXTERNAL_COURSE: '外部课程',
};

const statusLabel: Record<string, string> = {
  PLANNED: '已计划',
  ONGOING: '进行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

export const HrTalentDevelopmentPage: React.FC = () => {
  const [rows, setRows] = useState<HrTalentDevelopmentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ employeeId: '', actionType: 'TRAINING', actionName: '', mentorId: '', trainingSessionId: '', startDate: '', endDate: '', description: '' });
  const [completeAction, setCompleteAction] = useState<HrTalentDevelopmentAction | null>(null);
  const [completeForm, setCompleteForm] = useState({ evaluationScore: '', evaluationNotes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDevelopmentActions({ pageSize: 200 });
      setRows(normalizeRows<HrTalentDevelopmentAction>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '培养行动加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.employeeId.trim() || !form.actionName.trim()) {
      toast.error('请填写员工 ID 与行动名称');
      return;
    }
    try {
      const payload = {
        employeeId: Number(form.employeeId),
        actionType: form.actionType,
        actionName: form.actionName,
        mentorId: form.mentorId ? Number(form.mentorId) : undefined,
        trainingSessionId: form.trainingSessionId ? Number(form.trainingSessionId) : undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description,
        status: 'PLANNED',
      };
      if (editingId) {
        await updateDevelopmentAction(editingId, payload as never);
      } else {
        await createDevelopmentAction(payload as never);
      }
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleComplete = async () => {
    if (!completeAction) return;
    try {
      await completeDevelopmentAction(completeAction.id, {
        evaluationScore: completeForm.evaluationScore || undefined,
        evaluationNotes: completeForm.evaluationNotes,
      });
      toast.success('已完成回填');
      setCompleteAction(null);
      setCompleteForm({ evaluationScore: '', evaluationNotes: '' });
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '回填失败'));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">培养行动</div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingId(null); setForm({ employeeId: '', actionType: 'TRAINING', actionName: '', mentorId: '', trainingSessionId: '', startDate: '', endDate: '', description: '' }); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />新建培养行动
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>员工</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>导师</TableHead>
                  <TableHead>培训班次</TableHead>
                  <TableHead>起止</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>评分</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : rows.length ? rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.employeeId}</TableCell>
                    <TableCell>{enumLabel(actionTypeLabel, row.actionType)}</TableCell>
                    <TableCell className="font-medium">{row.actionName}</TableCell>
                    <TableCell>{row.mentorId ?? '-'}</TableCell>
                    <TableCell>{row.trainingSessionId ?? '-'}</TableCell>
                    <TableCell>{formatDateValue(row.startDate)} / {formatDateValue(row.endDate)}</TableCell>
                    <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                    <TableCell>{row.evaluationScore ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingId(row.id);
                          setForm({
                            employeeId: String(row.employeeId),
                            actionType: row.actionType,
                            actionName: row.actionName,
                            mentorId: row.mentorId ? String(row.mentorId) : '',
                            trainingSessionId: row.trainingSessionId ? String(row.trainingSessionId) : '',
                            startDate: row.startDate ?? '',
                            endDate: row.endDate ?? '',
                            description: row.description ?? '',
                          });
                          setOpen(true);
                        }}>编辑</Button>
                        {(row.status === 'PLANNED' || row.status === 'ONGOING') ? (
                          <Button size="sm" variant="outline" onClick={() => { setCompleteAction(row); setCompleteForm({ evaluationScore: '', evaluationNotes: '' }); }}>完成回填</Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={async () => { try { await deleteDevelopmentAction(row.id); toast.success('已删除'); await load(); } catch (e) { toast.error(getErrorMessage(e, '删除失败')); } }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-400">暂无培养行动</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={open}
        title={editingId ? '编辑培养行动' : '新建培养行动'}
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
            <div><Label>员工 ID</Label><Input value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))} /></div>
            <div>
              <Label>类型</Label>
              <Select value={form.actionType} onValueChange={(v) => setForm((p) => ({ ...p, actionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(actionTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>名称</Label><Input value={form.actionName} onChange={(e) => setForm((p) => ({ ...p, actionName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>导师 ID</Label><Input value={form.mentorId} onChange={(e) => setForm((p) => ({ ...p, mentorId: e.target.value }))} /></div>
            <div><Label>培训班次 ID</Label><Input value={form.trainingSessionId} onChange={(e) => setForm((p) => ({ ...p, trainingSessionId: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>开始日期</Label><Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} /></div>
            <div><Label>结束日期</Label><Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} /></div>
          </div>
          <div><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={!!completeAction}
        title={`完成回填 · ${completeAction?.actionName ?? ''}`}
        onClose={() => setCompleteAction(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCompleteAction(null)}>取消</Button>
            <Button onClick={() => void handleComplete()}>完成</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>评估分</Label><Input type="number" step="0.1" value={completeForm.evaluationScore} onChange={(e) => setCompleteForm((p) => ({ ...p, evaluationScore: e.target.value }))} /></div>
          <div><Label>评估说明</Label><Textarea value={completeForm.evaluationNotes} onChange={(e) => setCompleteForm((p) => ({ ...p, evaluationNotes: e.target.value }))} rows={4} /></div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTalentDevelopmentPage;
