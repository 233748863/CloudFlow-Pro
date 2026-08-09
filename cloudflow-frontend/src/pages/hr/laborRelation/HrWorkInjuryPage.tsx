import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Pencil, Plus, RefreshCcw, Send, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DatePicker,
  EmployeeSelector,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
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
import { toLocalDatetimeString } from '@/utils/dateFormat';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
      occurredAt: toLocalDatetimeString(row.occurredAt),
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

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORK INJURY</p>
          <h2>工伤管理</h2>
          <span>维护工伤上报、认定审批和关闭处理</span>
        </div>
      </header>
      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><ShieldAlert size={18} /></div>
          <div><p>记录总数</p><strong>{rows.length}</strong><span>当前筛选结果</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><Send size={18} /></div>
          <div><p>待认定</p><strong>{rows.filter((row) => hasWorkflowStatus(row.status, 'REPORTED', 'INVESTIGATING')).length}</strong><span>可发起认定</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><XCircle size={18} /></div>
          <div><p>未关闭</p><strong>{rows.filter((row) => !hasWorkflowStatus(row.status, 'CLOSED')).length}</strong><span>处理中记录</span></div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-toolbar-filter-grid [--admin-toolbar-filter-count:1]">
        <label className="min-w-0">
          <span className="input-label">状态</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {statusFlow.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions justify-end">
          <span className="admin-users-filter-count">{`共 ${rows.length} 条`}</span>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />上报工伤
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[960px]">
        <thead>
          <tr>
            <th>编号</th>
            <th>员工 ID</th>
            <th>发生时间</th>
            <th>地点</th>
            <th>等级</th>
            <th>当前阶段</th>
            <th>伤残等级</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="admin-settings-empty">加载中...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} className="admin-settings-empty">暂无记录</td></tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">
                  <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                    {row.injuryNo}
                  </button>
                </td>
                <td>{row.employeeId}</td>
                <td>{formatDateTimeValue(row.occurredAt)}</td>
                <td className="max-w-[10rem] truncate">{row.location ?? '-'}</td>
                <td><DictLabel dictType="hr_work_injury_level" value={row.injuryLevel} fallback="-" /></td>
                <td><StageTimeline steps={statusFlow} dictType="hr_work_injury_status" current={row.status} tone="emerald" /></td>
                <td>{row.determinedGrade ? `${row.determinedGrade} 级` : '-'}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void openDetail(row)}><Eye size={15} /></button>
                    {hasWorkflowStatus(row.status, 'REPORTED', 'INVESTIGATING') ? (
                      <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openEdit(row)}><Pencil size={15} /></button>
                    ) : null}
                    {hasWorkflowStatus(row.status, 'REPORTED', 'INVESTIGATING') ? (
                      <button type="button" data-tooltip="发起认定" aria-label="发起认定" onClick={() => void handleSubmit(row)}><Send size={15} /></button>
                    ) : null}
                    {!hasWorkflowStatus(row.status, 'CLOSED') ? (
                      <button type="button" className="danger" data-tooltip="关闭" aria-label="关闭" onClick={() => { setCloseTarget(row); setCloseReason(''); }}><XCircle size={15} /></button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout actions={pageActions} filters={pageFilters} table={pageTable} />

      <BaseDialog
        open={open}
        title={editing ? '编辑工伤记录' : '上报工伤'}
        onClose={() => setOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>员工</Label>
              <EmployeeSelector single value={form.employeeId ?? null} onChange={(id) => setForm({ ...form, employeeId: id ?? 0 })} placeholder="选择员工" />
            </div>
            <div className="admin-dialog-field">
              <Label>发生时间</Label>
              <DatePicker type="datetime-local" value={String(form.occurredAt ?? '')} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>地点</Label>
              <Input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>受伤部位</Label>
              <Input value={form.injuryPart ?? ''} onChange={(e) => setForm({ ...form, injuryPart: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>等级</Label>
              <Select value={String(form.injuryLevel ?? 'MINOR')} onValueChange={(v) => setForm({ ...form, injuryLevel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {levelOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>事件描述</Label>
            <Textarea rows={3} value={form.eventDescription ?? ''} onChange={(e) => setForm({ ...form, eventDescription: e.target.value })} />
          </div>
        </>
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
          bodyClassName="admin-dialog-stack"
          footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button></div>}
        >
          <div className="admin-dialog-stack text-sm">
            <StageTimeline steps={statusFlow} dictType="hr_work_injury_status" current={detail.status} tone="emerald" />
            <div className="grid grid-cols-2 gap-3">
              <div className="admin-dialog-field"><span className="text-cf-subtle">员工 ID:</span> {detail.employeeId}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">发生时间:</span> {formatDateTimeValue(detail.occurredAt)}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">地点:</span> {detail.location ?? '-'}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">部位:</span> {detail.injuryPart ?? '-'}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">等级:</span> <DictLabel dictType="hr_work_injury_level" value={detail.injuryLevel} fallback="-" /></div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">伤残等级:</span> {detail.determinedGrade ? `${detail.determinedGrade} 级` : '-'}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">认定时间:</span> {formatDateTimeValue(detail.determinedAt)}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">工作流:</span> {detail.processInstanceId ?? '-'}</div>
            </div>
            {detail.eventDescription && (
              <div className="admin-dialog-field">
                <div className="text-cf-subtle">事件描述:</div>
                <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-2 text-xs whitespace-pre-wrap dark:border-slate-800 dark:bg-slate-950">{detail.eventDescription}</div>
              </div>
            )}
          </div>
        </BaseDialog>
      )}
    </section>
  );
};

export default HrWorkInjuryPage;
