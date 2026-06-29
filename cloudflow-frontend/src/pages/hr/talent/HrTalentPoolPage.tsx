import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, Pencil, Plus, RefreshCcw, RotateCcw, Search, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
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
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  HrTalentPool,
  HrTalentPoolMember,
  createTalentPool,
  deleteTalentPool,
  exitTalentPool,
  joinTalentPool,
  listPoolMembers,
  listTalentPools,
  updateTalentPool,
} from '@/services/api/hr';
import { useAuth } from '@/context/AuthContext';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { normalizeRows } from '../hrShared';

const defaultForm = { poolNo: '', poolName: '', poolType: 'HIPO', description: '' };

export const HrTalentPoolPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:pool:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:pool:add') ?? true;
  const canRemove = hasPermission?.('hr:talent:pool:remove') ?? true;
  const poolTypeOptions = useDict('hr_talent_pool_type').getOptions();

  const [rows, setRows] = useState<HrTalentPool[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ keyword: '', poolType: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [memberPool, setMemberPool] = useState<HrTalentPool | null>(null);
  const [members, setMembers] = useState<HrTalentPoolMember[]>([]);
  const [memberForm, setMemberForm] = useState({ employeeId: '', sourceReviewId: '' });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.keyword) params.keyword = query.keyword;
      if (query.poolType) params.poolType = query.poolType;
      const res = await listTalentPools(params);
      setRows(normalizeRows<HrTalentPool>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '人才池加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.poolName.trim()) {
      toast.error('请填写池名称');
      return;
    }
    try {
      const payload = { poolNo: form.poolNo, poolName: form.poolName, poolType: form.poolType, description: form.description, status: 'ACTIVE' };
      if (editingId) {
        await updateTalentPool(editingId, payload as never);
      } else {
        await createTalentPool(payload as never);
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

  const openMembers = async (pool: HrTalentPool) => {
    setMemberPool(pool);
    try {
      const res = await listPoolMembers(pool.id);
      setMembers(Array.isArray(res) ? res : []);
    } catch (error) {
      toast.error(getErrorMessage(error, '成员加载失败'));
    }
  };

  const handleJoin = async () => {
    if (!memberPool || !memberForm.employeeId.trim()) {
      toast.error('请填写员工 ID');
      return;
    }
    try {
      await joinTalentPool(
        memberPool.id,
        Number(memberForm.employeeId),
        memberForm.sourceReviewId ? Number(memberForm.sourceReviewId) : undefined,
      );
      toast.success('已加入');
      setMemberForm({ employeeId: '', sourceReviewId: '' });
      await openMembers(memberPool);
    } catch (error) {
      toast.error(getErrorMessage(error, '加入失败'));
    }
  };

  const handleExit = async (m: HrTalentPoolMember) => {
    if (!memberPool) return;
    try {
      await exitTalentPool(memberPool.id, m.employeeId, 'MANUAL');
      toast.success('已退出');
      await openMembers(memberPool);
    } catch (error) {
      toast.error(getErrorMessage(error, '退出失败'));
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    try {
      await deleteTalentPool(deleteId);
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

  const hasFilters = Boolean(query.keyword || query.poolType);
  const activeCount = rows.filter((row) => row.status === 'ACTIVE').length;
  const archivedCount = rows.filter((row) => row.status !== 'ACTIVE').length;

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
                  <p className="admin-source-kicker">TALENT POOLS</p>
                  <h2>人才池</h2>
                  <span>维护高潜、关键岗位和继任人才池成员</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  {canAdd ? (
                    <Button size="sm" onClick={() => { setEditingId(null); setForm(defaultForm); setOpen(true); }}>
                      <Plus className="mr-1.5 h-4 w-4" />新建人才池
                    </Button>
                  ) : null}
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><Users size={18} /></div>
                  <div><p>人才池总数</p><strong>{total}</strong><span>当前筛选结果</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><UserPlus size={18} /></div>
                  <div><p>启用中</p><strong>{activeCount}</strong><span>可维护成员</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><UserMinus size={18} /></div>
                  <div><p>已归档</p><strong>{archivedCount}</strong><span>非启用状态</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">人才池</span>
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
                      placeholder="搜索池编号/名称"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">类型</span>
                  <Select value={query.poolType || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, poolType: v === '__all' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="全部类型" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">全部类型</SelectItem>
                      {poolTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', poolType: '' }))}>
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
                <table className="unity-data-table admin-source-table min-w-[920px]">
                  <thead>
                    <tr>
                      <th>编号</th>
                      <th>名称</th>
                      <th>类型</th>
                      <th>状态</th>
                      <th>说明</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="admin-settings-empty">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="admin-settings-empty">暂无人才池</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="font-mono text-xs">{row.poolNo}</td>
                          <td><strong>{row.poolName}</strong></td>
                          <td><DictLabel dictType="hr_talent_pool_type" value={row.poolType} fallback="-" /></td>
                          <td>{row.status === 'ACTIVE' ? '启用' : '已归档'}</td>
                          <td className="max-w-[24rem] truncate">{row.description || '-'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canEdit ? (
                                <button type="button" title="编辑" onClick={() => { setEditingId(row.id); setForm({ poolNo: row.poolNo, poolName: row.poolName, poolType: row.poolType, description: row.description ?? '' }); setOpen(true); }}>
                                  <Pencil size={15} />
                                </button>
                              ) : null}
                              <button type="button" title="成员" onClick={() => void openMembers(row)}>
                                <Users size={15} />
                              </button>
                              {canRemove ? (
                                <button type="button" className="danger" title="删除" onClick={() => setDeleteId(row.id)}>
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
        title={editingId ? '编辑人才池' : '新建人才池'}
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
          <div className="admin-dialog-field"><Label>编号</Label><Input value={form.poolNo} onChange={(e) => setForm((p) => ({ ...p, poolNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div className="admin-dialog-field"><Label>名称</Label><Input value={form.poolName} onChange={(e) => setForm((p) => ({ ...p, poolName: e.target.value }))} /></div>
          <div className="admin-dialog-field">
            <Label>类型</Label>
            <Select value={form.poolType} onValueChange={(v) => setForm((p) => ({ ...p, poolType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {poolTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field"><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </>
      </BaseDialog>

      <BaseDialog
        open={!!memberPool}
        title={`成员维护 · ${memberPool?.poolName ?? ''}`}
        onClose={() => setMemberPool(null)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMemberPool(null)}>关闭</Button>
          </div>
        }
      >
        <div className="admin-source-content-grid">
          <InnerTableSurface>
            <div className="admin-horizontal-scroll">
              <table className="unity-data-table admin-source-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>员工 ID</th>
                    <th>进入时间</th>
                    <th>来源盘点</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.length ? members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.employeeId}</td>
                      <td>{m.joinedAt ?? '-'}</td>
                      <td>{m.joinedReviewId ?? '-'}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button type="button" title="退出" onClick={() => void handleExit(m)}>
                            <UserMinus size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="admin-settings-empty">暂无成员</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </InnerTableSurface>
          <section className="card admin-source-panel">
            <div className="admin-source-panel-head">
              <div>
                <h3>手动加入</h3>
                <span>录入员工和来源盘点后加入当前人才池</span>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="admin-dialog-field"><Label>员工 ID</Label><Input value={memberForm.employeeId} onChange={(e) => setMemberForm((p) => ({ ...p, employeeId: e.target.value }))} /></div>
                <div className="admin-dialog-field"><Label>来源盘点 ID（可选）</Label><Input value={memberForm.sourceReviewId} onChange={(e) => setMemberForm((p) => ({ ...p, sourceReviewId: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => void handleJoin()}>加入</Button>
              </div>
            </div>
          </section>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={deleteId !== null}
        title="删除人才池"
        message="删除后不可恢复，确认删除该人才池？"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default HrTalentPoolPage;
