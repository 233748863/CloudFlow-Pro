import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
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
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
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
import { enumLabel, normalizeRows } from '../hrShared';

const poolTypeLabel: Record<string, string> = {
  CORE: '核心',
  HIPO: '高潜',
  SUCCESSOR: '继任',
  CRITICAL_SKILL: '关键技能',
  EXTERNAL_BENCH: '外部储备',
};

const defaultForm = { poolNo: '', poolName: '', poolType: 'HIPO', description: '' };

export const HrTalentPoolPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:pool:edit') ?? true;
  const canAdd = hasPermission?.('hr:talent:pool:add') ?? true;

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

  const filters = (
    <FilterBar
      search={{
        value: query.keyword,
        onChange: (value) => setQuery((q) => ({ ...q, keyword: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索池编号/名称',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="poolType" className="w-full sm:w-40">
          <Select value={query.poolType || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, poolType: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部类型</SelectItem>
              {Object.entries(poolTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, keyword: '', poolType: '' }))}>
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
                <Plus className="mr-1.5 h-4 w-4" />新建人才池
              </Button>,
            ]
          : []),
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>说明</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">暂无人才池</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.poolNo}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.poolName}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(poolTypeLabel, row.poolType)}</td>
                  <td className="px-4 py-3 text-sm">{row.status === 'ACTIVE' ? '启用' : '已归档'}</td>
                  <td className="px-4 py-3 max-w-[24rem] truncate text-sm">{row.description || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', permissionKey: 'hr:talent:pool:edit', onClick: () => { setEditingId(row.id); setForm({ poolNo: row.poolNo, poolName: row.poolName, poolType: row.poolType, description: row.description ?? '' }); setOpen(true); } },
                        { key: 'members', label: '成员', semantic: 'process', onClick: () => void openMembers(row) },
                        { key: 'delete', label: '删除', semantic: 'delete', permissionKey: 'hr:talent:pool:remove', onClick: () => setDeleteId(row.id) },
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
        title={editingId ? '编辑人才池' : '新建人才池'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>编号</Label><Input value={form.poolNo} onChange={(e) => setForm((p) => ({ ...p, poolNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div><Label>名称</Label><Input value={form.poolName} onChange={(e) => setForm((p) => ({ ...p, poolName: e.target.value }))} /></div>
          <div>
            <Label>类型</Label>
            <Select value={form.poolType} onValueChange={(v) => setForm((p) => ({ ...p, poolType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(poolTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>说明</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} /></div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={!!memberPool}
        title={`成员维护 · ${memberPool?.poolName ?? ''}`}
        onClose={() => setMemberPool(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMemberPool(null)}>关闭</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <TableHeader>
                <tr>
                  <TableHead>员工 ID</TableHead>
                  <TableHead>进入时间</TableHead>
                  <TableHead>来源盘点</TableHead>
                  <TableActionHead className="text-right">操作</TableActionHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.length ? members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2 text-sm">{m.employeeId}</td>
                    <td className="px-4 py-2 text-sm">{m.joinedAt ?? '-'}</td>
                    <td className="px-4 py-2 text-sm">{m.joinedReviewId ?? '-'}</td>
                    <td className="px-4 py-2 text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          { key: 'exit', label: '退出', semantic: 'void', onClick: () => void handleExit(m) },
                        ]}
                      />
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-4 text-center text-sm text-slate-400">暂无成员</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="rounded border border-slate-200 p-3 space-y-3 dark:border-slate-800">
            <div className="font-semibold text-slate-800 dark:text-slate-100">手动加入</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>员工 ID</Label><Input value={memberForm.employeeId} onChange={(e) => setMemberForm((p) => ({ ...p, employeeId: e.target.value }))} /></div>
              <div><Label>来源盘点 ID（可选）</Label><Input value={memberForm.sourceReviewId} onChange={(e) => setMemberForm((p) => ({ ...p, sourceReviewId: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void handleJoin()}>加入</Button>
            </div>
          </div>
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
    </div>
  );
};

export default HrTalentPoolPage;
