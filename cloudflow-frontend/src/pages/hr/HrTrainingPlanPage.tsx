import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Archive, LoaderCircle, Pencil, Plus, RefreshCcw, RotateCcw, Search, Send, Trash2 } from 'lucide-react';
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
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
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
import { normalizeRows, formatMoneyValue } from './hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

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
  const canRemove = hasPermission?.('hr:training:plan:remove') ?? true;

  const [rows, setRows] = useState<HrTrainingPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrTrainingPlanPayload>(defaultForm);
  const [pendingDelete, setPendingDelete] = useState<HrTrainingPlan | null>(null);
  const planTypeOptions = useDict('hr_training_plan_type').getOptions();
  const planStatusOptions = useDict('hr_publish_status').getOptions();

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
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">TRAINING PLANS</p>
                  <h2>培训计划</h2>
                  <span>维护年度、季度培训计划和发布归档状态</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  {canAdd ? (
                    <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                      <Plus className="mr-1.5 h-4 w-4" />新建计划
                    </Button>
                  ) : null}
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><Plus size={18} /></div>
                  <div><p>计划总数</p><strong>{total}</strong><span>当前筛选结果</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><Send size={18} /></div>
                  <div><p>可发布</p><strong>{rows.filter((row) => row.status === 'DRAFT').length}</strong><span>草稿状态</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><Archive size={18} /></div>
                  <div><p>可归档</p><strong>{rows.filter((row) => row.status === 'PUBLISHED').length}</strong><span>已发布状态</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">计划名称</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      className="h-[42px]"
                      type="search"
                      value={query.keyword}
                      onChange={(event) => setQuery((q) => ({ ...q, keyword: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setQuery((q) => ({ ...q, pageNum: 1 }));
                      }}
                      placeholder="搜索计划名称"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {planStatusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', status: '' }))}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
                  </Button>
                ) : null}
                <span className="admin-users-filter-count">共 {total} 条</span>
              </div>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[960px]">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>名称</th>
                      <th>类型</th>
                      <th>年度</th>
                      <th>预算</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="admin-settings-empty">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="admin-settings-empty">暂无计划</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.planNo || `#${row.id}`}</td>
                          <td><strong>{row.planName}</strong></td>
                          <td><DictLabel dictType="hr_training_plan_type" value={row.planType} fallback="-" /></td>
                          <td>{row.year ?? '-'}{row.quarter ? ` Q${row.quarter}` : ''}</td>
                          <td>{formatMoneyValue(row.budget)}</td>
                          <td><DictLabel dictType="hr_publish_status" value={row.status} fallback="-" /></td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canEdit ? (
                                <button type="button" title="编辑" onClick={() => { setEditingId(row.id); setForm(row); setOpen(true); }}>
                                  <Pencil size={15} />
                                </button>
                              ) : null}
                              {canEdit && row.status === 'DRAFT' ? (
                                <button type="button" title="发布" onClick={() => void handleAction(row, 'approve')}>
                                  <Send size={15} />
                                </button>
                              ) : null}
                              {canEdit && row.status === 'PUBLISHED' ? (
                                <button type="button" title="归档" onClick={() => void handleAction(row, 'archive')}>
                                  <Archive size={15} />
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button type="button" className="danger" title="删除" onClick={() => setPendingDelete(row)}>
                                  <Trash2 size={15} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          }
          pagination={pagination}
        />
      </section>

      <BaseDialog
        open={open}
        title={editingId ? '编辑培训计划' : '新建培训计划'}
        onClose={() => setOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <>
          <div className="admin-dialog-field"><Label>计划名称</Label><Input value={form.planName} onChange={(e) => setForm((p) => ({ ...p, planName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>类型</Label>
              <Select value={form.planType} onValueChange={(v) => setForm((p) => ({ ...p, planType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {planTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field"><Label>年度</Label><Input type="number" value={form.year ?? ''} onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>季度</Label><Input type="number" min={1} max={4} value={form.quarter ?? ''} onChange={(e) => setForm((p) => ({ ...p, quarter: e.target.value ? Number(e.target.value) : undefined }))} /></div>
            <div className="admin-dialog-field"><Label>预算</Label><Input type="number" value={form.budget?.toString() ?? ''} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} /></div>
          </div>
          <div className="admin-dialog-field"><Label>说明</Label><Input value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
        </>
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除培训计划"
        message={`确认删除培训计划「${pendingDelete?.planName}」？删除后不可恢复。`}
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default HrTrainingPlanPage;
