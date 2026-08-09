import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Eye, LoaderCircle, Plus, RefreshCcw, RotateCcw, Search, Send, Trash2, UserMinus, UserPlus, UsersRound } from 'lucide-react';
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
  Textarea,
} from '@/components/common';
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
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { formatDateTimeValue, normalizeRows } from '../hrShared';

const defaultForm = { planNo: '', planName: '', positionId: '', incumbentEmployeeId: '', riskLevel: 'MID', description: '' };

export const HrTalentSuccessionPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:succession:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:succession:add') ?? true;
  const canRemove = hasPermission?.('hr:talent:succession:remove') ?? true;

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
  const draftCount = rows.filter((row) => row.status === 'DRAFT').length;
  const publishedCount = rows.filter((row) => row.status === 'PUBLISHED').length;

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
                  <p className="admin-source-kicker">SUCCESSION PLANS</p>
                  <h2>继任计划</h2>
                  <span>维护关键岗位继任计划、风险等级和候选继任人</span>
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
                  <div className="admin-source-stat-icon"><UsersRound size={18} /></div>
                  <div><p>计划总数</p><strong>{total}</strong><span>当前筛选结果</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><UserPlus size={18} /></div>
                  <div><p>待发布</p><strong>{draftCount}</strong><span>草稿计划</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><Send size={18} /></div>
                  <div><p>已发布</p><strong>{publishedCount}</strong><span>发布状态</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">继任计划</span>
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
                      placeholder="搜索计划编号/名称"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部状态</SelectItem>
                      {getStatusOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                <table className="unity-data-table admin-source-table min-w-[1040px]">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>名称</th>
                      <th>岗位</th>
                      <th>现任</th>
                      <th>风险</th>
                      <th>状态</th>
                      <th>发布时间</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="admin-settings-empty">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="admin-settings-empty">暂无继任计划</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.planNo}</td>
                          <td><strong>{row.planName}</strong></td>
                          <td>{row.positionId ?? '-'}</td>
                          <td>{row.incumbentEmployeeId ?? '-'}</td>
                          <td><DictLabel dictType="hr_talent_succession_risk" value={String(row.riskLevel ?? '')} fallback="-" /></td>
                          <td><DictLabel dictType="hr_publish_status" value={String(row.status ?? '')} fallback="-" /></td>
                          <td>{formatDateTimeValue(row.publishTime) || '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="详情/提名" aria-label="详情/提名" onClick={() => void openDetail(row)}>
                                <Eye size={15} />
                              </button>
                              {canEdit && row.status === 'DRAFT' ? (
                                <button type="button" data-tooltip="发起发布" aria-label="发起发布" onClick={() => void handlePublish(row)}>
                                  <Send size={15} />
                                </button>
                              ) : null}
                              {canRemove ? (
                                <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => setDeleteId(row.id)}>
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
        title={editingId ? '编辑继任计划' : '新建继任计划'}
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
          <div className="admin-dialog-field"><Label>编号</Label><Input value={form.planNo} onChange={(e) => setForm((p) => ({ ...p, planNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div className="admin-dialog-field"><Label>名称</Label><Input value={form.planName} onChange={(e) => setForm((p) => ({ ...p, planName: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field"><Label>岗位</Label><PositionSelector single allowClear value={form.positionId ? Number(form.positionId) : null} onChange={(id) => setForm((p) => ({ ...p, positionId: id ? String(id) : '' }))} placeholder="选择岗位" /></div>
            <div className="admin-dialog-field"><Label>现任员工</Label><EmployeeSelector single allowClear value={form.incumbentEmployeeId ? Number(form.incumbentEmployeeId) : null} onChange={(id) => setForm((p) => ({ ...p, incumbentEmployeeId: id ? String(id) : '' }))} placeholder="选择员工" /></div>
          </div>
          <div className="admin-dialog-field">
            <Label>风险等级</Label>
            <Select value={form.riskLevel} onValueChange={(v) => setForm((p) => ({ ...p, riskLevel: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {getRiskOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field"><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </>
      </BaseDialog>

      <BaseDialog
        open={!!detailPlan}
        title={`继任计划详情 · ${detailPlan?.planName ?? ''}`}
        onClose={() => setDetailPlan(null)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDetailPlan(null)}>关闭</Button>
          </div>
        }
      >
        <div className="admin-source-content-grid">
          <InnerTableSurface>
            <div className="px-4 py-3 text-sm font-semibold text-cf-title">已提名继任人</div>
            <div className="admin-horizontal-scroll">
              <table className="unity-data-table admin-source-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>员工 ID</th>
                    <th>就绪度</th>
                    <th>排序</th>
                    <th>差距</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailPlan?.successors ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{s.employeeId}</td>
                      <td><DictLabel dictType="hr_talent_readiness" value={String(s.readiness ?? '')} fallback="-" /></td>
                      <td>{s.rankOrder ?? '-'}</td>
                      <td className="max-w-[12rem] truncate">{s.developmentGap || '-'}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button type="button" className="danger" data-tooltip="移除" aria-label="移除" onClick={() => void handleRemoveSuccessor(s)}>
                            <UserMinus size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!detailPlan?.successors || detailPlan.successors.length === 0) && (
                    <tr><td colSpan={5} className="admin-settings-empty">暂未提名</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </InnerTableSurface>
          {detailPlan?.status === 'DRAFT' ? (
            <section className="card admin-source-panel">
              <div className="admin-source-panel-head">
                <div>
                  <h3>提名新继任人</h3>
                  <span>补充候选员工、就绪度和能力差距</span>
                </div>
              </div>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="admin-dialog-field"><Label>员工</Label><EmployeeSelector single value={successorForm.employeeId ? Number(successorForm.employeeId) : null} onChange={(id) => setSuccessorForm((p) => ({ ...p, employeeId: id ? String(id) : '' }))} placeholder="选择员工" /></div>
                  <div className="admin-dialog-field">
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
                  <div className="admin-dialog-field"><Label>排序</Label><Input type="number" value={successorForm.rankOrder} onChange={(e) => setSuccessorForm((p) => ({ ...p, rankOrder: Number(e.target.value) }))} /></div>
                  <div className="admin-dialog-field"><Label>能力差距</Label><Input value={successorForm.developmentGap} onChange={(e) => setSuccessorForm((p) => ({ ...p, developmentGap: e.target.value }))} /></div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void handleAddSuccessor()}>提名</Button>
                </div>
              </div>
            </section>
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
    </>
  );
};

export default HrTalentSuccessionPage;
