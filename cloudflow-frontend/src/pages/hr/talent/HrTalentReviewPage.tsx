import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
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
import { useAuth } from '@/context/AuthContext';
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
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:review:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:review:add') ?? true;

  const [rows, setRows] = useState<HrTalentReview[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTalentReviewPayload>(defaultForm);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotReview, setSnapshotReview] = useState<HrTalentReview | null>(null);
  const [objectiveId, setObjectiveId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await listTalentReviews(params);
      setRows(normalizeRows<HrTalentReview>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '盘点活动加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  const hasFilters = Boolean(query.keyword || query.status);

  const filters = (
    <FilterBar
      search={{
        value: query.keyword,
        onChange: (value) => setQuery((q) => ({ ...q, keyword: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索盘点编号/名称',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', status: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        ...(canAdd
          ? [
              <Button key="add" size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" />新建盘点
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>年度</TableHead>
              <TableHead>周期</TableHead>
              <TableHead>范围</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>发布时间</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">暂无盘点活动</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.reviewNo}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.reviewName}</td>
                  <td className="px-4 py-3 text-sm">{row.reviewYear}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(cycleTypeLabel, row.cycleType)}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(scopeTypeLabel, row.scopeType)}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(statusLabel, row.status)}</td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.publishTime) || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', permissionKey: 'hr:talent:review:edit', onClick: () => { setEditingId(row.id); setForm({ ...row }); setOpen(true); } },
                        { key: 'snapshot', label: '拉取业绩', semantic: 'process', permissionKey: 'hr:talent:review:edit', onClick: () => { setSnapshotReview(row); setSnapshotOpen(true); }, hidden: !(row.status === 'DRAFT' || row.status === 'IN_PROGRESS') },
                        { key: 'publish', label: '发起发布', semantic: 'submit', permissionKey: 'hr:talent:review:edit', onClick: () => void handlePublish(row), hidden: !(row.status === 'IN_PROGRESS' || row.status === 'CALIBRATING') },
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

  const pagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={open}
        title={editingId ? '编辑盘点活动' : '新建盘点活动'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
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
