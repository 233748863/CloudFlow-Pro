import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
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
  HrTrainingPlan,
  HrTrainingPlanPayload,
  listTrainingPlans,
  createTrainingPlan,
  updateTrainingPlan,
  deleteTrainingPlan,
  changeTrainingPlanStatus,
} from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
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
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:training:plan:edit') ?? true;
  const canAdd = hasPermission?.('hr:training:plan:add') ?? true;

  const [rows, setRows] = useState<HrTrainingPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTrainingPlanPayload>(defaultForm);
  const [pendingDelete, setPendingDelete] = useState<HrTrainingPlan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await listTrainingPlans(params);
      setRows(normalizeRows<HrTrainingPlan>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '培训计划加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTrainingPlan(pendingDelete.id);
      toast.success('已删除');
      setPendingDelete(null);
      if (rows.length === 1 && query.pageNum > 1) {
        setQuery((q) => ({ ...q, pageNum: q.pageNum - 1 }));
      } else {
        await load();
      }
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

  const hasFilters = Boolean(query.keyword || query.status);

  const filters = (
    <FilterBar
      search={{
        value: query.keyword,
        onChange: (value) => setQuery((q) => ({ ...q, keyword: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索计划名称',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {Object.entries(planStatusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
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
                <Plus className="mr-1.5 h-4 w-4" />新建计划
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>年度</TableHead>
              <TableHead>预算</TableHead>
              <TableHead>状态</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-sm text-slate-400">暂无计划</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.planNo || `#${row.id}`}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.planName}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(planTypeLabel, row.planType)}</td>
                  <td className="px-4 py-3 text-sm">{row.year ?? '-'}{row.quarter ? ` Q${row.quarter}` : ''}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.budget)}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(planStatusLabel, row.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', permissionKey: 'hr:training:plan:edit', onClick: () => { setEditingId(row.id); setForm(row); setOpen(true); } },
                        { key: 'publish', label: '发布', semantic: 'submit', permissionKey: 'hr:training:plan:edit', onClick: () => void handleAction(row, 'approve'), hidden: row.status !== 'DRAFT' },
                        { key: 'archive', label: '归档', semantic: 'archive', permissionKey: 'hr:training:plan:edit', onClick: () => void handleAction(row, 'archive'), hidden: row.status !== 'PUBLISHED' },
                        { key: 'delete', label: '删除', semantic: 'delete', permissionKey: 'hr:training:plan:remove', onClick: () => setPendingDelete(row) },
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
        title={editingId ? '编辑培训计划' : '新建培训计划'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
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

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除培训计划"
        message={`确认删除培训计划「${pendingDelete?.planName}」？删除后不可恢复。`}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default HrTrainingPlanPage;
