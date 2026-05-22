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
  HrTalentReview,
  HrTalentReviewPayload,
  createTalentReview,
  listTalentReviews,
  publishTalentReview,
  snapshotPerformance,
  updateTalentReview,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, normalizeRows } from '../hrShared';

const cycleTypeLabel: Record<string, string> = {
  ANNUAL: '年度',
  H1: '上半年',
  H2: '下半年',
  QUARTER: '季度',
};

const scopeTypeLabel: Record<string, string> = {
  GLOBAL: '全员',
  DEPT: '部门',
  POSITION: '岗位',
};

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  CALIBRATING: '校准中',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
  REJECTED: '已驳回',
};

const defaultForm: HrTalentReviewPayload = {
  reviewNo: '',
  reviewName: '',
  reviewYear: new Date().getFullYear(),
  cycleType: 'ANNUAL',
  scopeType: 'GLOBAL',
  status: 'DRAFT',
};

export const HrTalentReviewPage: React.FC = () => {
  const [rows, setRows] = useState<HrTalentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTalentReviewPayload>(defaultForm);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotReview, setSnapshotReview] = useState<HrTalentReview | null>(null);
  const [objectiveId, setObjectiveId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTalentReviews({ pageSize: 200 });
      setRows(normalizeRows<HrTalentReview>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '盘点活动加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.reviewName?.trim()) {
      toast.error('请填写盘点名称');
      return;
    }
    try {
      if (editingId) {
        await updateTalentReview(editingId, form);
      } else {
        await createTalentReview(form);
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

  const handleSnapshot = async () => {
    if (!snapshotReview || !objectiveId.trim()) {
      toast.error('请填写目标计划 ID');
      return;
    }
    try {
      const res = await snapshotPerformance(snapshotReview.id, Number(objectiveId));
      toast.success(`快照完成，新增参与人 ${res} 名`);
      setSnapshotOpen(false);
      setObjectiveId('');
      setSnapshotReview(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '拉取快照失败'));
    }
  };

  const handlePublish = async (row: HrTalentReview) => {
    try {
      await publishTalentReview(row.id);
      toast.success('已发起发布审批');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">盘点活动</div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />新建盘点
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
                  <TableHead>年度</TableHead>
                  <TableHead>周期</TableHead>
                  <TableHead>范围</TableHead>
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
                    <TableCell className="font-mono text-xs">{row.reviewNo}</TableCell>
                    <TableCell className="font-medium">{row.reviewName}</TableCell>
                    <TableCell>{row.reviewYear}</TableCell>
                    <TableCell>{enumLabel(cycleTypeLabel, row.cycleType)}</TableCell>
                    <TableCell>{enumLabel(scopeTypeLabel, row.scopeType)}</TableCell>
                    <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                    <TableCell>{formatDateTimeValue(row.publishTime) || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm({ ...row }); setOpen(true); }}>编辑</Button>
                        {(row.status === 'DRAFT' || row.status === 'IN_PROGRESS') ? (
                          <Button size="sm" variant="outline" onClick={() => { setSnapshotReview(row); setSnapshotOpen(true); }}>拉取业绩</Button>
                        ) : null}
                        {(row.status === 'IN_PROGRESS' || row.status === 'CALIBRATING') ? (
                          <Button size="sm" variant="outline" onClick={() => void handlePublish(row)}>发起发布</Button>
                        ) : null}
                        <Button size="sm" variant="ghost" disabled>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无盘点活动</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={open}
        title={editingId ? '编辑盘点活动' : '新建盘点活动'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>编号</Label><Input value={form.reviewNo ?? ''} onChange={(e) => setForm((p) => ({ ...p, reviewNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div><Label>名称</Label><Input value={form.reviewName} onChange={(e) => setForm((p) => ({ ...p, reviewName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>年度</Label><Input type="number" value={form.reviewYear} onChange={(e) => setForm((p) => ({ ...p, reviewYear: Number(e.target.value) }))} /></div>
            <div>
              <Label>周期</Label>
              <Select value={form.cycleType} onValueChange={(v) => setForm((p) => ({ ...p, cycleType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(cycleTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>范围类型</Label>
              <Select value={form.scopeType} onValueChange={(v) => setForm((p) => ({ ...p, scopeType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(scopeTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>范围值</Label><Input value={form.scopeValue ?? ''} onChange={(e) => setForm((p) => ({ ...p, scopeValue: e.target.value }))} placeholder="部门ID/岗位ID/留空全员" /></div>
          </div>
          <div><Label>截止日期</Label><Input type="date" value={form.deadline ?? ''} onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))} /></div>
          <div><Label>说明</Label><Input value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={snapshotOpen}
        title={`拉取业绩快照 · ${snapshotReview?.reviewName ?? ''}`}
        onClose={() => setSnapshotOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSnapshotOpen(false)}>取消</Button>
            <Button onClick={() => void handleSnapshot()}>拉取</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-slate-500">
            拉取的目标计划必须状态为 PUBLISHED。员工将按业绩分自动落入九宫格（潜力默认为中）。
          </div>
          <div><Label>目标计划 ID</Label><Input value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} placeholder="hr_performance_objective.id" /></div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrTalentReviewPage;
