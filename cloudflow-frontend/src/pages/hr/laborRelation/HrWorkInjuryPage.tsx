import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  EmployeeSelector,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableHead,
  TableHeader,
  TableRowActions,
  Textarea,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  closeInjury,
  createInjury,
  getInjury,
  listInjuries,
  submitInjuryDetermination,
  updateInjury,
  type HrWorkInjury,
  type HrWorkInjuryPayload,
} from '@/services/api/hr';
import { formatDateTimeValue, hasWorkflowStatus, normalizeRows } from '../hrShared';
import { StageTimeline } from '../components/StageTimeline';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const statusFlow = ['REPORTED', 'INVESTIGATING', 'DETERMINING', 'DETERMINED', 'COMPENSATING', 'REHABILITATING', 'CLOSED'];

const emptyForm: Partial<HrWorkInjuryPayload> = {
  employeeId: undefined,
  occurredAt: '',
  location: '',
  eventDescription: '',
  injuryPart: '',
  injuryLevel: 'MINOR',
  status: 'REPORTED',
};

export const HrWorkInjuryPage: React.FC = () => {
  const [rows, setRows] = useState<HrWorkInjury[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<HrWorkInjury | null>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<HrWorkInjury | null>(null);
  const [form, setForm] = useState<Partial<HrWorkInjuryPayload>>(emptyForm);
  const [closeTarget, setCloseTarget] = useState<HrWorkInjury | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const { getLabel: statusLabel } = useDict('hr_work_injury_status');
  const levelOptions = useDict('hr_work_injury_level').getOptions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await listInjuries(params);
      setRows(normalizeRows<HrWorkInjury>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载工伤记录失败'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: HrWorkInjury) => {
    setEditing(row);
    setForm({
      employeeId: row.employeeId,
      occurredAt: row.occurredAt,
      location: row.location,
      eventDescription: row.eventDescription,
      injuryPart: row.injuryPart,
      injuryLevel: row.injuryLevel,
      status: row.status,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.employeeId) {
      toast.error('请填写员工 ID');
      return;
    }
    try {
      if (editing) {
        await updateInjury(editing.id, form);
        toast.success('已更新');
      } else {
        await createInjury(form as HrWorkInjuryPayload);
        toast.success('已上报');
      }
      setOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleSubmit = async (row: HrWorkInjury) => {
    try {
      await submitInjuryDetermination(row.id);
      toast.success('已发起认定审批');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const handleCloseConfirm = async () => {
    if (!closeTarget) return;
    try {
      await closeInjury(closeTarget.id, closeReason || undefined);
      toast.success('已关闭');
      setCloseTarget(null);
      setCloseReason('');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '关闭失败'));
    }
  };

  const openDetail = async (row: HrWorkInjury) => {
    try {
      const full = await getInjury(row.id);
      setDetail(full);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载详情失败'));
    }
  };

  const filters = (
    <FilterBar
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {statusFlow.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${rows.length} 条` }]}
      actions={[
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="add" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />上报工伤
        </Button>,
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
              <TableHead>员工 ID</TableHead>
              <TableHead>发生时间</TableHead>
              <TableHead>地点</TableHead>
              <TableHead>等级</TableHead>
              <TableHead>当前阶段</TableHead>
              <TableHead>伤残等级</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-400">暂无记录</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">
                    <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                      {row.injuryNo}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">{row.employeeId}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.occurredAt)}</td>
                  <td className="px-4 py-3 max-w-[10rem] truncate text-xs">{row.location ?? '-'}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_work_injury_level" value={row.injuryLevel} fallback="-" /></td>
                  <td className="px-4 py-3"><StageTimeline steps={statusFlow} dictType="hr_work_injury_status" current={row.status} tone="emerald" /></td>
                  <td className="px-4 py-3 text-sm">{row.determinedGrade ? `${row.determinedGrade} 级` : '-'}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => openEdit(row), hidden: !hasWorkflowStatus(row.status, 'REPORTED', 'INVESTIGATING') },
                        { key: 'submit', semantic: 'submit', label: '发起认定', onClick: () => void handleSubmit(row), hidden: !hasWorkflowStatus(row.status, 'REPORTED', 'INVESTIGATING') },
                        { key: 'close', semantic: 'void', label: '关闭', onClick: () => { setCloseTarget(row); setCloseReason(''); }, hidden: hasWorkflowStatus(row.status, 'CLOSED') },
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

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />

      <BaseDialog
        open={open}
        title={editing ? '编辑工伤记录' : '上报工伤'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>员工</Label>
              <EmployeeSelector single value={form.employeeId ?? null} onChange={(id) => setForm({ ...form, employeeId: id ?? 0 })} placeholder="选择员工" />
            </div>
            <div>
              <Label>发生时间</Label>
              <Input type="datetime-local" value={String(form.occurredAt ?? '').slice(0, 16)} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
            </div>
            <div>
              <Label>地点</Label>
              <Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <Label>受伤部位</Label>
              <Input value={form.injuryPart ?? ''} onChange={(e) => setForm({ ...form, injuryPart: e.target.value })} />
            </div>
            <div>
              <Label>等级</Label>
              <Select value={String(form.injuryLevel ?? 'MINOR')} onValueChange={(v) => setForm({ ...form, injuryLevel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {levelOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>事件描述</Label>
            <Textarea rows={3} value={form.eventDescription ?? ''} onChange={(e) => setForm({ ...form, eventDescription: e.target.value })} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="关闭工伤记录"
        message={closeTarget ? `确认关闭 ${closeTarget.injuryNo}?可填写关闭理由。` : ''}
        danger
        confirmText="确认关闭"
        onCancel={() => { setCloseTarget(null); setCloseReason(''); }}
        onConfirm={() => void handleCloseConfirm()}
      >
        <div>
          <Label>关闭理由(可选)</Label>
          <Textarea rows={3} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="填写关闭理由" />
        </div>
      </ConfirmDialog>

      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={`工伤详情 · ${detail.injuryNo}`}
          width="wide"
          onClose={() => setDetail(null)}
          footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button></div>}
        >
          <div className="space-y-3 text-sm">
            <StageTimeline steps={statusFlow} dictType="hr_work_injury_status" current={detail.status} tone="emerald" />
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-500">员工 ID:</span> {detail.employeeId}</div>
              <div><span className="text-slate-500">发生时间:</span> {formatDateTimeValue(detail.occurredAt)}</div>
              <div><span className="text-slate-500">地点:</span> {detail.location ?? '-'}</div>
              <div><span className="text-slate-500">部位:</span> {detail.injuryPart ?? '-'}</div>
              <div><span className="text-slate-500">等级:</span> <DictLabel dictType="hr_work_injury_level" value={detail.injuryLevel} fallback="-" /></div>
              <div><span className="text-slate-500">伤残等级:</span> {detail.determinedGrade ? `${detail.determinedGrade} 级` : '-'}</div>
              <div><span className="text-slate-500">认定时间:</span> {formatDateTimeValue(detail.determinedAt)}</div>
              <div><span className="text-slate-500">工作流:</span> {detail.processInstanceId ?? '-'}</div>
            </div>
            {detail.eventDescription && (
              <div>
                <div className="text-slate-500">事件描述:</div>
                <div className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{detail.eventDescription}</div>
              </div>
            )}
          </div>
        </BaseDialog>
      )}
    </div>
  );
};

export default HrWorkInjuryPage;
