import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  EmployeeSelector,
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
import { BaseDialog } from '@/components/common/BaseDialog';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
import { enumLabel, formatDateTimeValue, hasWorkflowStatus, normalizeRows } from '../hrShared';

const statusFlow = ['REPORTED', 'INVESTIGATING', 'DETERMINING', 'DETERMINED', 'COMPENSATING', 'REHABILITATING', 'CLOSED'];

const statusLabel: Record<string, string> = {
  REPORTED: '已上报',
  INVESTIGATING: '调查中',
  DETERMINING: '认定中',
  DETERMINED: '已认定',
  COMPENSATING: '赔偿中',
  REHABILITATING: '康复中',
  CLOSED: '已关闭',
};

const levelLabel: Record<string, string> = {
  MINOR: '轻伤',
  MODERATE: '中等',
  SEVERE: '重伤',
  DEATH: '死亡',
};

const emptyForm: Partial<HrWorkInjuryPayload> = {
  employeeId: undefined,
  occurredAt: '',
  location: '',
  eventDescription: '',
  injuryPart: '',
  injuryLevel: 'MINOR',
  status: 'REPORTED',
};

const StageTimeline: React.FC<{ current?: string }> = ({ current }) => {
  const currentIdx = statusFlow.indexOf(String(current ?? '').toUpperCase());
  return (
    <div className="flex flex-wrap items-center gap-1 py-1">
      {statusFlow.map((s, idx) => {
        const reached = currentIdx >= idx;
        return (
          <React.Fragment key={s}>
            <div className={`rounded-full px-2 py-0.5 text-[10px] ${reached ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {statusLabel[s]}
            </div>
            {idx < statusFlow.length - 1 && (
              <div className={`h-px w-3 ${currentIdx > idx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const HrWorkInjuryPage: React.FC = () => {
  const [rows, setRows] = useState<HrWorkInjury[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<HrWorkInjury | null>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<HrWorkInjury | null>(null);
  const [form, setForm] = useState<Partial<HrWorkInjuryPayload>>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
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

  const handleClose = async (row: HrWorkInjury) => {
    const reason = window.prompt('关闭理由');
    if (reason === null) return;
    try {
      await closeInjury(row.id, reason || undefined);
      toast.success('已关闭');
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">工伤申报</div>
          <div className="mt-1 text-xs text-slate-500">7 阶段全流程:上报 → 调查 → 认定 → 赔偿 → 康复 → 关闭</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <Label className="text-xs text-slate-500">状态</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {statusFlow.map((s) => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>刷新</Button>
          <Button onClick={openCreate}>上报工伤</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>员工 ID</TableHead>
              <TableHead>发生时间</TableHead>
              <TableHead>地点</TableHead>
              <TableHead>等级</TableHead>
              <TableHead>当前阶段</TableHead>
              <TableHead>伤残等级</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400">暂无记录</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                      {row.injuryNo}
                    </button>
                  </TableCell>
                  <TableCell>{row.employeeId}</TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.occurredAt)}</TableCell>
                  <TableCell className="max-w-[10rem] truncate text-xs">{row.location ?? '-'}</TableCell>
                  <TableCell>{enumLabel(levelLabel, row.injuryLevel)}</TableCell>
                  <TableCell><StageTimeline current={row.status} /></TableCell>
                  <TableCell>{row.determinedGrade ? `${row.determinedGrade} 级` : '-'}</TableCell>
                  <TableCell className="space-x-2 text-xs">
                    {hasWorkflowStatus(row.status, 'REPORTED', 'INVESTIGATING') && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                        <Button size="sm" onClick={() => void handleSubmit(row)}>发起认定</Button>
                      </>
                    )}
                    {!hasWorkflowStatus(row.status, 'CLOSED') && (
                      <Button size="sm" variant="outline" onClick={() => void handleClose(row)}>关闭</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

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
                  {Object.entries(levelLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
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

      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={`工伤详情 · ${detail.injuryNo}`}
          width="wide"
          onClose={() => setDetail(null)}
          footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button></div>}
        >
          <div className="space-y-3 text-sm">
            <StageTimeline current={detail.status} />
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-500">员工 ID:</span> {detail.employeeId}</div>
              <div><span className="text-slate-500">发生时间:</span> {formatDateTimeValue(detail.occurredAt)}</div>
              <div><span className="text-slate-500">地点:</span> {detail.location ?? '-'}</div>
              <div><span className="text-slate-500">部位:</span> {detail.injuryPart ?? '-'}</div>
              <div><span className="text-slate-500">等级:</span> {enumLabel(levelLabel, detail.injuryLevel)}</div>
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
