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
  HrTrainingPlan,
  HrTrainingPlanPayload,
  listTrainingPlans,
  createTrainingPlan,
  updateTrainingPlan,
  deleteTrainingPlan,
  changeTrainingPlanStatus,
} from '@/services/api/hr';
import { normalizeRows, formatMoneyValue, enumLabel } from './hrShared';

const planTypeLabel: Record<string, string> = {
  ANNUAL: '年度',
  QUARTERLY: '季度',
  DEPT: '部门',
  ADHOC: '临时',
};

const planStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

const defaultForm: HrTrainingPlanPayload = {
  planName: '',
  planType: 'ANNUAL',
  year: new Date().getFullYear(),
  status: 'DRAFT',
  description: '',
};

export const HrTrainingPlanPage: React.FC = () => {
  const [rows, setRows] = useState<HrTrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTrainingPlanPayload>(defaultForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrainingPlans({ pageSize: 200 });
      setRows(normalizeRows<HrTrainingPlan>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '培训计划加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.planName.trim()) {
      toast.error('请填写计划名称');
      return;
    }
    try {
      if (editingId) {
        await updateTrainingPlan(editingId, form);
      } else {
        await createTrainingPlan(form);
      }
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
    try {
      await deleteTrainingPlan(id);
      toast.success('已删除');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const handleAction = async (row: HrTrainingPlan, action: 'submit' | 'approve' | 'archive') => {
    try {
      await changeTrainingPlanStatus(row.id, action);
      toast.success('已更新');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">培训计划</div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />新建计划
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
                  <TableHead>编号</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>年度</TableHead>
                  <TableHead>预算</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : rows.length ? rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.planNo || `#${row.id}`}</TableCell>
                    <TableCell className="font-medium">{row.planName}</TableCell>
                    <TableCell>{enumLabel(planTypeLabel, row.planType)}</TableCell>
                    <TableCell>{row.year ?? '-'}{row.quarter ? ` Q${row.quarter}` : ''}</TableCell>
                    <TableCell>{formatMoneyValue(row.budget)}</TableCell>
                    <TableCell>{enumLabel(planStatusLabel, row.status)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm(row); setOpen(true); }}>编辑</Button>
                        {row.status === 'DRAFT' ? (
                          <Button size="sm" variant="outline" onClick={() => void handleAction(row, 'approve')}>发布</Button>
                        ) : null}
                        {row.status === 'PUBLISHED' ? (
                          <Button size="sm" variant="outline" onClick={() => void handleAction(row, 'archive')}>归档</Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无计划</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={open}
        title={editingId ? '编辑培训计划' : '新建培训计划'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>计划名称</Label><Input value={form.planName} onChange={(e) => setForm((p) => ({ ...p, planName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>类型</Label>
              <Select value={form.planType} onValueChange={(v) => setForm((p) => ({ ...p, planType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(planTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>年度</Label><Input type="number" value={form.year ?? ''} onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>季度</Label><Input type="number" min={1} max={4} value={form.quarter ?? ''} onChange={(e) => setForm((p) => ({ ...p, quarter: e.target.value ? Number(e.target.value) : undefined }))} /></div>
            <div><Label>预算</Label><Input type="number" value={form.budget?.toString() ?? ''} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} /></div>
          </div>
          <div><Label>说明</Label><Input value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTrainingPlanPage;
