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
  closeDispute,
  getDispute,
  listDisputes,
  listEvidence,
  registerDispute,
  submitDispute,
  updateDispute,
  uploadEvidence,
  type HrDisputeEvidence,
  type HrDisputeEvidencePayload,
  type HrLaborDispute,
  type HrLaborDisputePayload,
} from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, formatMoneyValue, hasWorkflowStatus, normalizeRows } from '../hrShared';

const statusFlow = ['REGISTERED', 'MEDIATING', 'MEDIATED', 'ARBITRATING', 'AWARDED', 'EXECUTED', 'CLOSED'];

const statusLabel: Record<string, string> = {
  REGISTERED: '已登记',
  MEDIATING: '调解中',
  MEDIATED: '调解完成',
  ARBITRATING: '仲裁中',
  AWARDED: '已裁决',
  EXECUTED: '已执行',
  CLOSED: '已关闭',
};

const disputeTypeLabel: Record<string, string> = {
  SALARY: '薪资争议',
  CONTRACT: '合同争议',
  DISMISSAL: '解雇争议',
  SOCIAL_INSURANCE: '社保争议',
  OTHER: '其他',
};

const evidenceTypeLabel: Record<string, string> = {
  CONTRACT: '合同',
  PAYSLIP: '工资单',
  MEDICAL: '医疗记录',
  WITNESS: '证人证言',
  OTHER: '其他',
};

const emptyForm: Partial<HrLaborDisputePayload> = {
  applicantEmployeeId: undefined,
  applicantExternalName: '',
  applicantExternalPhone: '',
  disputeType: 'SALARY',
  claimAmount: undefined,
  claimDescription: '',
  status: 'REGISTERED',
};

const DisputeTimeline: React.FC<{ current?: string }> = ({ current }) => {
  const currentIdx = statusFlow.indexOf(String(current ?? '').toUpperCase());
  return (
    <div className="flex flex-wrap items-center gap-1 py-1">
      {statusFlow.map((s, idx) => {
        const reached = currentIdx >= idx;
        return (
          <React.Fragment key={s}>
            <div className={`rounded-full px-2 py-0.5 text-[10px] ${reached ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {statusLabel[s]}
            </div>
            {idx < statusFlow.length - 1 && (
              <div className={`h-px w-3 ${currentIdx > idx ? 'bg-sky-500' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const HrLaborDisputePage: React.FC = () => {
  const [rows, setRows] = useState<HrLaborDispute[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrLaborDispute | null>(null);
  const [form, setForm] = useState<Partial<HrLaborDisputePayload>>(emptyForm);
  const [detail, setDetail] = useState<HrLaborDispute | null>(null);
  const [evidence, setEvidence] = useState<HrDisputeEvidence[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState<HrLaborDispute | null>(null);
  const [evidenceForm, setEvidenceForm] = useState<Partial<HrDisputeEvidencePayload>>({
    evidenceType: 'CONTRACT',
    fileId: undefined,
    remark: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await listDisputes(params);
      setRows(normalizeRows<HrLaborDispute>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载争议失败'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (row: HrLaborDispute) => {
    setEditing(row);
    setForm({
      applicantEmployeeId: row.applicantEmployeeId,
      applicantExternalName: row.applicantExternalName,
      applicantExternalPhone: row.applicantExternalPhone,
      disputeType: row.disputeType,
      claimAmount: row.claimAmount,
      claimDescription: row.claimDescription,
      status: row.status,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateDispute(editing.id, form);
        toast.success('已更新');
      } else {
        await registerDispute(form as HrLaborDisputePayload);
        toast.success('已登记');
      }
      setOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleSubmit = async (row: HrLaborDispute) => {
    try {
      await submitDispute(row.id);
      toast.success('已发起处理工作流');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const handleClose = async (row: HrLaborDispute) => {
    const reason = window.prompt('关闭理由');
    if (reason === null) return;
    try {
      await closeDispute(row.id, reason || undefined);
      toast.success('已关闭');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '关闭失败'));
    }
  };

  const openDetail = async (row: HrLaborDispute) => {
    try {
      const [full, evRes] = await Promise.all([getDispute(row.id), listEvidence(row.id)]);
      setDetail(full);
      setEvidence(normalizeRows<HrDisputeEvidence>(evRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载详情失败'));
    }
  };

  const handleUploadEvidence = async () => {
    if (!evidenceOpen) return;
    if (!evidenceForm.fileId) { toast.error('请填写附件 ID'); return; }
    try {
      await uploadEvidence(evidenceOpen.id, { ...evidenceForm, disputeId: evidenceOpen.id } as HrDisputeEvidencePayload);
      toast.success('已上传证据');
      setEvidenceOpen(null);
      setEvidenceForm({ evidenceType: 'CONTRACT', fileId: undefined, remark: '' });
    } catch (error) {
      toast.error(getErrorMessage(error, '上传失败'));
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">争议台账</div>
          <div className="mt-1 text-xs text-slate-500">登记 → 调解 → 仲裁 → 执行三段全流程</div>
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
          <Button onClick={openCreate}>登记争议</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>申请人</TableHead>
              <TableHead>争议类型</TableHead>
              <TableHead>诉求金额</TableHead>
              <TableHead>当前阶段</TableHead>
              <TableHead>登记时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-slate-400">暂无争议</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                      {row.disputeNo}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.applicantEmployeeId ? `员工 #${row.applicantEmployeeId}` : `${row.applicantExternalName ?? '-'} ${row.applicantExternalPhone ?? ''}`}
                  </TableCell>
                  <TableCell>{enumLabel(disputeTypeLabel, row.disputeType)}</TableCell>
                  <TableCell>{formatMoneyValue(row.claimAmount)}</TableCell>
                  <TableCell><DisputeTimeline current={row.status} /></TableCell>
                  <TableCell className="text-xs">{formatDateTimeValue(row.openedAt ?? row.createTime)}</TableCell>
                  <TableCell className="space-x-2 text-xs">
                    {hasWorkflowStatus(row.status, 'REGISTERED', 'MEDIATED') && (
                      <Button size="sm" onClick={() => void handleSubmit(row)}>发起处理</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                    <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(row)}>上传证据</Button>
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
        title={editing ? '编辑争议' : '登记争议'}
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
              <Label>申请人员工 (可选)</Label>
              <EmployeeSelector single allowClear value={form.applicantEmployeeId ?? null} onChange={(id) => setForm({ ...form, applicantEmployeeId: id ?? undefined })} placeholder="选择内部员工，外部申请人留空" />
            </div>
            <div>
              <Label>外部申请人姓名</Label>
              <Input value={form.applicantExternalName ?? ''} onChange={(e) => setForm({ ...form, applicantExternalName: e.target.value })} />
            </div>
            <div>
              <Label>外部联系电话</Label>
              <Input value={form.applicantExternalPhone ?? ''} onChange={(e) => setForm({ ...form, applicantExternalPhone: e.target.value })} />
            </div>
            <div>
              <Label>争议类型</Label>
              <Select value={String(form.disputeType ?? 'SALARY')} onValueChange={(v) => setForm({ ...form, disputeType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(disputeTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>诉求金额</Label>
              <Input type="number" value={String(form.claimAmount ?? '')} onChange={(e) => setForm({ ...form, claimAmount: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div>
            <Label>诉求描述</Label>
            <Textarea rows={4} value={form.claimDescription ?? ''} onChange={(e) => setForm({ ...form, claimDescription: e.target.value })} />
          </div>
        </div>
      </BaseDialog>

      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={`争议详情 · ${detail.disputeNo}`}
          width="wide"
          onClose={() => { setDetail(null); setEvidence([]); }}
          footer={<div className="flex justify-end"><Button variant="outline" onClick={() => { setDetail(null); setEvidence([]); }}>关闭</Button></div>}
        >
          <div className="space-y-4 text-sm">
            <DisputeTimeline current={detail.status} />
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-500">申请人:</span> {detail.applicantEmployeeId ? `员工 #${detail.applicantEmployeeId}` : `${detail.applicantExternalName ?? '-'} ${detail.applicantExternalPhone ?? ''}`}</div>
              <div><span className="text-slate-500">类型:</span> {enumLabel(disputeTypeLabel, detail.disputeType)}</div>
              <div><span className="text-slate-500">诉求金额:</span> {formatMoneyValue(detail.claimAmount)}</div>
              <div><span className="text-slate-500">登记时间:</span> {formatDateTimeValue(detail.openedAt ?? detail.createTime)}</div>
              <div><span className="text-slate-500">关闭时间:</span> {formatDateTimeValue(detail.closedAt)}</div>
              <div><span className="text-slate-500">工作流:</span> {detail.processInstanceId ?? '-'}</div>
            </div>
            {detail.claimDescription && (
              <div>
                <div className="text-slate-500">诉求描述:</div>
                <div className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{detail.claimDescription}</div>
              </div>
            )}
            <div>
              <div className="mb-2 font-semibold">证据材料 · 共 {evidence.length} 份</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>附件 ID</TableHead>
                    <TableHead>上传时间</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidence.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-3 text-center text-xs text-slate-400">暂无证据</TableCell></TableRow>
                  ) : (
                    evidence.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell>{enumLabel(evidenceTypeLabel, ev.evidenceType)}</TableCell>
                        <TableCell className="font-mono text-xs">{ev.fileId ?? '-'}</TableCell>
                        <TableCell className="text-xs">{formatDateTimeValue(ev.uploadedAt)}</TableCell>
                        <TableCell className="max-w-[16rem] truncate text-xs">{ev.remark ?? '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </BaseDialog>
      )}

      {evidenceOpen && (
        <BaseDialog
          open={Boolean(evidenceOpen)}
          title={`上传证据 · ${evidenceOpen.disputeNo}`}
          onClose={() => setEvidenceOpen(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEvidenceOpen(null)}>取消</Button>
              <Button onClick={() => void handleUploadEvidence()}>上传</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <Label>证据类型</Label>
              <Select value={String(evidenceForm.evidenceType ?? 'CONTRACT')} onValueChange={(v) => setEvidenceForm({ ...evidenceForm, evidenceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(evidenceTypeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>附件 ID(cloudflow_common_file)</Label>
              <Input type="number" value={String(evidenceForm.fileId ?? '')} onChange={(e) => setEvidenceForm({ ...evidenceForm, fileId: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <Label>备注</Label>
              <Textarea rows={2} value={evidenceForm.remark ?? ''} onChange={(e) => setEvidenceForm({ ...evidenceForm, remark: e.target.value })} />
            </div>
          </div>
        </BaseDialog>
      )}
    </div>
  );
};

export default HrLaborDisputePage;
