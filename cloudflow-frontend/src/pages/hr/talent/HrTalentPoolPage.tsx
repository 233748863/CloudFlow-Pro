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
  Textarea,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
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
import { enumLabel, normalizeRows } from '../hrShared';

const poolTypeLabel: Record<string, string> = {
  CORE: '核心',
  HIPO: '高潜',
  SUCCESSOR: '继任',
  CRITICAL_SKILL: '关键技能',
  EXTERNAL_BENCH: '外部储备',
};

export const HrTalentPoolPage: React.FC = () => {
  const [rows, setRows] = useState<HrTalentPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ poolNo: '', poolName: '', poolType: 'HIPO', description: '' });
  const [memberPool, setMemberPool] = useState<HrTalentPool | null>(null);
  const [members, setMembers] = useState<HrTalentPoolMember[]>([]);
  const [memberForm, setMemberForm] = useState({ employeeId: '', sourceReviewId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTalentPools({ pageSize: 200 });
      setRows(normalizeRows<HrTalentPool>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '人才池加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div className="p-6">
      <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">人才池</div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { setEditingId(null); setForm({ poolNo: '', poolName: '', poolType: 'HIPO', description: '' }); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />新建人才池
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
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>说明</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : rows.length ? rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.poolNo}</TableCell>
                    <TableCell className="font-medium">{row.poolName}</TableCell>
                    <TableCell>{enumLabel(poolTypeLabel, row.poolType)}</TableCell>
                    <TableCell>{row.status === 'ACTIVE' ? '启用' : '已归档'}</TableCell>
                    <TableCell className="max-w-[24rem] truncate">{row.description || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm({ poolNo: row.poolNo, poolName: row.poolName, poolType: row.poolType, description: row.description ?? '' }); setOpen(true); }}>编辑</Button>
                        <Button size="sm" variant="outline" onClick={() => void openMembers(row)}>成员</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { try { await deleteTalentPool(row.id); toast.success('已删除'); await load(); } catch (e) { toast.error(getErrorMessage(e, '删除失败')); } }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无人才池</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={open}
        title={editingId ? '编辑人才池' : '新建人才池'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>员工 ID</TableHead>
                <TableHead>进入时间</TableHead>
                <TableHead>来源盘点</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length ? members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.employeeId}</TableCell>
                  <TableCell>{m.joinedAt ?? '-'}</TableCell>
                  <TableCell>{m.joinedReviewId ?? '-'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => void handleExit(m)}>退出</Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={4} className="py-4 text-center text-sm text-slate-400">暂无成员</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="rounded border border-slate-200 p-3 space-y-3">
            <div className="font-semibold text-slate-800">手动加入</div>
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
    </div>
  );
};

export default HrTalentPoolPage;
