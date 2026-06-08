import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  EmployeeSelector,
  Input,
  Label,
  Pagination,
  PositionSelector,
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
import { useAuth } from '@/context/AuthContext';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { formatDateTimeValue, normalizeRows } from '../hrShared';

const defaultForm = { planNo: '', planName: '', positionId: '', incumbentEmployeeId: '', riskLevel: 'MID', description: '' };

export const HrTalentSuccessionPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:succession:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:succession:add') ?? true;

  const { getOptions: getStatusOptions } = useDict('hr_publish_status');
  const { getOptions: getRiskOptions } = useDict('hr_talent_succession_risk');
  const { getOptions: getReadinessOptions } = useDict('hr_talent_readiness');

  const [rows, setRows] = useState<HrTalentSuccessionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [detailPlan, setDetailPlan] = useState<HrTalentSuccessionPlan | null>(null);
  const [successorForm, setSuccessorForm] = useState({ employeeId: '', readiness: 'IN_1_2_YEARS', rankOrder: 1, developmentGap: '' });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.status) params.status = query.status;
      const res = await listSuccessionPlans(params);
      setRows(normalizeRows<HrTalentSuccessionPlan>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '继任计划加载失败'));
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
      setForm(defaultForm);
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

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteSuccessionPlan(deleteId);
      toast.success('已删除');
      setDeleteId(null);
      if (rows.length === 1 && query.pageNum > 1) {
        setQuery((q) => ({ ...q, pageNum: q.pageNum - 1 }));
      } else {
        await load();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const hasFilters = Boolean(query.keyword || query.status);

  const filters = (
    <FilterBar
      search={{
        value: query.keyword,
        onChange: (value) => setQuery((q) => ({ ...q, keyword: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索计划编号/名称',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {getStatusOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
        <table className="w-full min-w-[1040px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>岗位</TableHead>
              <TableHead>现任</TableHead>
              <TableHead>风险</TableHead>
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
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">暂无继任计划</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.planNo}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.planName}</td>
                  <td className="px-4 py-3 text-sm">{row.positionId ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.incumbentEmployeeId ?? '-'}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_talent_succession_risk" value={String(row.riskLevel ?? '')} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_publish_status" value={String(row.status ?? '')} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.publishTime) || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'detail', label: '详情/提名', semantic: 'view', onClick: () => void openDetail(row) },
                        { key: 'publish', label: '发起发布', semantic: 'submit', permissionKey: 'hr:talent:succession:edit', onClick: () => void handlePublish(row), hidden: row.status !== 'DRAFT' },
                        { key: 'delete', label: '删除', semantic: 'delete', permissionKey: 'hr:talent:succession:remove', onClick: () => setDeleteId(row.id) },
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
        title={editingId ? '编辑继任计划' : '新建继任计划'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
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
                {getRiskOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
          <div className="rounded border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 font-semibold text-slate-800 dark:text-slate-100">已提名继任人</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <TableHeader>
                  <tr>
                    <TableHead>员工 ID</TableHead>
                    <TableHead>就绪度</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>差距</TableHead>
                    <TableActionHead className="text-right">操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(detailPlan?.successors ?? []).map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 text-sm">{s.employeeId}</td>
                      <td className="px-4 py-2 text-sm"><DictLabel dictType="hr_talent_readiness" value={String(s.readiness ?? '')} fallback="-" /></td>
                      <td className="px-4 py-2 text-sm">{s.rankOrder ?? '-'}</td>
                      <td className="px-4 py-2 max-w-[12rem] truncate text-sm">{s.developmentGap || '-'}</td>
                      <td className="px-4 py-2 text-right">
                        <TableRowActions
                          align="end"
                          actions={[
                            { key: 'remove', label: '移除', semantic: 'delete', onClick: () => void handleRemoveSuccessor(s) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {(!detailPlan?.successors || detailPlan.successors.length === 0) && (
                    <tr><td colSpan={5} className="py-4 text-center text-sm text-slate-400">暂未提名</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {detailPlan?.status === 'DRAFT' ? (
            <div className="rounded border border-slate-200 p-3 space-y-3 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-100">提名新继任人</div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>员工</Label><EmployeeSelector single value={successorForm.employeeId ? Number(successorForm.employeeId) : null} onChange={(id) => setSuccessorForm((p) => ({ ...p, employeeId: id ? String(id) : '' }))} placeholder="选择员工" /></div>
                <div>
                  <Label>就绪度</Label>
                  <Select value={successorForm.readiness} onValueChange={(v) => setSuccessorForm((p) => ({ ...p, readiness: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getReadinessOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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

      <ConfirmDialog
        open={deleteId !== null}
        title="删除继任计划"
        message="删除后不可恢复，确认删除该继任计划？"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
};

export default HrTalentSuccessionPage;
