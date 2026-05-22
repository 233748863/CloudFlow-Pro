import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  EmployeeSelector,
  Input,
  Label,
  PositionSelector,
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
  HrTalentSuccessionPlan,
  HrTalentSuccessor,
  addSuccessor,
  createSuccessionPlan,
  deleteSuccessionPlan,
  getSuccessionPlan,
  listSuccessionPlans,
  publishSuccessionPlan,
  removeSuccessor,
  updateSuccessionPlan,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, normalizeRows } from '../hrShared';

const riskLevelLabel: Record<string, string> = {
  LOW: '低',
  MID: '中',
  HIGH: '高',
  CRITICAL: '关键',
};

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  REJECTED: '已驳回',
};

const readinessLabel: Record<string, string> = {
  READY_NOW: '即可顶岗',
  IN_1_2_YEARS: '1-2 年',
  IN_3_5_YEARS: '3-5 年',
};

export const HrTalentSuccessionPage: React.FC = () => {
  const [rows, setRows] = useState<HrTalentSuccessionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ planNo: '', planName: '', positionId: '', incumbentEmployeeId: '', riskLevel: 'MID', description: '' });
  const [detailPlan, setDetailPlan] = useState<HrTalentSuccessionPlan | null>(null);
  const [successorForm, setSuccessorForm] = useState({ employeeId: '', readiness: 'IN_1_2_YEARS', rankOrder: 1, developmentGap: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSuccessionPlans({ pageSize: 200 });
      setRows(normalizeRows<HrTalentSuccessionPlan>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '继任计划加载失败'));
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
      const payload = {
        planNo: form.planNo,
        planName: form.planName,
        positionId: form.positionId ? Number(form.positionId) : undefined,
        incumbentEmployeeId: form.incumbentEmployeeId ? Number(form.incumbentEmployeeId) : undefined,
        riskLevel: form.riskLevel,
        description: form.description,
        status: 'DRAFT',
        keyRoleFlag: true,
      };
      if (editingId) {
        await updateSuccessionPlan(editingId, payload as never);
      } else {
        await createSuccessionPlan(payload as never);
      }
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const openDetail = async (row: HrTalentSuccessionPlan) => {
    try {
      const plan = await getSuccessionPlan(row.id);
      setDetailPlan(plan);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载详情失败'));
    }
  };

  const handleAddSuccessor = async () => {
    if (!detailPlan || !successorForm.employeeId.trim()) {
      toast.error('请填写员工 ID');
      return;
    }
    try {
      await addSuccessor(detailPlan.id, {
        employeeId: Number(successorForm.employeeId),
        readiness: successorForm.readiness,
        rankOrder: successorForm.rankOrder,
        developmentGap: successorForm.developmentGap,
      });
      toast.success('已提名');
      setSuccessorForm({ employeeId: '', readiness: 'IN_1_2_YEARS', rankOrder: 1, developmentGap: '' });
      await openDetail(detailPlan);
    } catch (error) {
      toast.error(getErrorMessage(error, '提名失败'));
    }
  };

  const handleRemoveSuccessor = async (s: HrTalentSuccessor) => {
    try {
      await removeSuccessor(s.id);
      toast.success('已移除');
      if (detailPlan) await openDetail(detailPlan);
    } catch (error) {
      toast.error(getErrorMessage(error, '移除失败'));
    }
  };

  const handlePublish = async (row: HrTalentSuccessionPlan) => {
    try {
      await publishSuccessionPlan(row.id);
      toast.success('已发起发布审批');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSuccessionPlan(id);
      toast.success('已删除');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">继任计划</div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingId(null); setForm({ planNo: '', planName: '', positionId: '', incumbentEmployeeId: '', riskLevel: 'MID', description: '' }); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />新建计划
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>编号</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>岗位</TableHead>
                  <TableHead>现任</TableHead>
                  <TableHead>风险</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : rows.length ? rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.planNo}</TableCell>
                    <TableCell className="font-medium">{row.planName}</TableCell>
                    <TableCell>{row.positionId ?? '-'}</TableCell>
                    <TableCell>{row.incumbentEmployeeId ?? '-'}</TableCell>
                    <TableCell>{enumLabel(riskLevelLabel, row.riskLevel)}</TableCell>
                    <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                    <TableCell>{formatDateTimeValue(row.publishTime) || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => void openDetail(row)}>详情/提名</Button>
                        {row.status === 'DRAFT' ? (
                          <Button size="sm" variant="outline" onClick={() => void handlePublish(row)}>发起发布</Button>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无继任计划</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={open}
        title={editingId ? '编辑继任计划' : '新建继任计划'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>编号</Label><Input value={form.planNo} onChange={(e) => setForm((p) => ({ ...p, planNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div><Label>名称</Label><Input value={form.planName} onChange={(e) => setForm((p) => ({ ...p, planName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>岗位</Label><PositionSelector single allowClear value={form.positionId ? Number(form.positionId) : null} onChange={(id) => setForm((p) => ({ ...p, positionId: id ? String(id) : '' }))} placeholder="选择岗位" /></div>
            <div><Label>现任员工</Label><EmployeeSelector single allowClear value={form.incumbentEmployeeId ? Number(form.incumbentEmployeeId) : null} onChange={(id) => setForm((p) => ({ ...p, incumbentEmployeeId: id ? String(id) : '' }))} placeholder="选择员工" /></div>
          </div>
          <div>
            <Label>风险等级</Label>
            <Select value={form.riskLevel} onValueChange={(v) => setForm((p) => ({ ...p, riskLevel: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(riskLevelLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={!!detailPlan}
        title={`继任计划详情 · ${detailPlan?.planName ?? ''}`}
        onClose={() => setDetailPlan(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailPlan(null)}>关闭</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded border border-slate-200 p-3">
            <div className="mb-2 font-semibold text-slate-800">已提名继任人</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>员工 ID</TableHead>
                  <TableHead>就绪度</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>差距</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detailPlan?.successors ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.employeeId}</TableCell>
                    <TableCell>{enumLabel(readinessLabel, s.readiness)}</TableCell>
                    <TableCell>{s.rankOrder ?? '-'}</TableCell>
                    <TableCell className="max-w-[12rem] truncate">{s.developmentGap || '-'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => void handleRemoveSuccessor(s)}>移除</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!detailPlan?.successors || detailPlan.successors.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="py-4 text-center text-sm text-slate-400">暂未提名</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {detailPlan?.status === 'DRAFT' ? (
            <div className="rounded border border-slate-200 p-3 space-y-3">
              <div className="font-semibold text-slate-800">提名新继任人</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>员工</Label><EmployeeSelector single value={successorForm.employeeId ? Number(successorForm.employeeId) : null} onChange={(id) => setSuccessorForm((p) => ({ ...p, employeeId: id ? String(id) : '' }))} placeholder="选择员工" /></div>
                <div>
                  <Label>就绪度</Label>
                  <Select value={successorForm.readiness} onValueChange={(v) => setSuccessorForm((p) => ({ ...p, readiness: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(readinessLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>排序</Label><Input type="number" value={successorForm.rankOrder} onChange={(e) => setSuccessorForm((p) => ({ ...p, rankOrder: Number(e.target.value) }))} /></div>
                <div><Label>能力差距</Label><Input value={successorForm.developmentGap} onChange={(e) => setSuccessorForm((p) => ({ ...p, developmentGap: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => void handleAddSuccessor()}>提名</Button>
              </div>
            </div>
          ) : null}
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTalentSuccessionPage;
