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
import { StageTimeline } from '../components/StageTimeline';

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
  const [closeTarget, setCloseTarget] = useState<HrLaborDispute | null>(null);
  const [closeReason, setCloseReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {};
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

  const handleCloseConfirm = async () => {
    if (!closeTarget) return;
    try {
      await closeDispute(closeTarget.id, closeReason || undefined);
      toast.success('已关闭');
      setCloseTarget(null);
      setCloseReason('');
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

  const filters = (
    <FilterBar
      filters={[
        <div key="status" className="w-full sm:w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {statusFlow.map((s) => <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>)}
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
          <Plus className="mr-1.5 h-4 w-4" />登记争议
        </Button>,
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
              <TableHead>申请人</TableHead>
              <TableHead>争议类型</TableHead>
              <TableHead>诉求金额</TableHead>
              <TableHead>当前阶段</TableHead>
              <TableHead>登记时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无争议</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">
                    <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                      {row.disputeNo}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.applicantEmployeeId ? `员工 #${row.applicantEmployeeId}` : `${row.applicantExternalName ?? '-'} ${row.applicantExternalPhone ?? ''}`}
                  </td>
                  <td className="px-4 py-3 text-sm">{enumLabel(disputeTypeLabel, row.disputeType)}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.claimAmount)}</td>
                  <td className="px-4 py-3"><StageTimeline steps={statusFlow} labels={statusLabel} current={row.status} tone="sky" /></td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.openedAt ?? row.createTime)}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'submit', semantic: 'process', label: '发起处理', onClick: () => void handleSubmit(row), hidden: !hasWorkflowStatus(row.status, 'REGISTERED', 'MEDIATED') },
                        { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => openEdit(row) },
                        { key: 'evidence', semantic: 'bind', label: '上传证据', onClick: () => setEvidenceOpen(row) },
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

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="关闭争议"
        message={closeTarget ? `确认关闭 ${closeTarget.disputeNo}?可填写关闭理由。` : ''}
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
          title={`争议详情 · ${detail.disputeNo}`}
          width="wide"
          onClose={() => { setDetail(null); setEvidence([]); }}
          footer={<div className="flex justify-end"><Button variant="outline" onClick={() => { setDetail(null); setEvidence([]); }}>关闭</Button></div>}
        >
          <div className="space-y-4 text-sm">
            <StageTimeline steps={statusFlow} labels={statusLabel} current={detail.status} tone="sky" />
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
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[480px]">
                  <TableHeader>
                    <tr>
                      <TableHead>类型</TableHead>
                      <TableHead>附件 ID</TableHead>
                      <TableHead>上传时间</TableHead>
                      <TableHead>备注</TableHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {evidence.length === 0 ? (
                      <tr><td colSpan={4} className="py-3 text-center text-xs text-slate-400">暂无证据</td></tr>
                    ) : (
                      evidence.map((ev) => (
                        <tr key={ev.id}>
                          <td className="px-4 py-2 text-sm">{enumLabel(evidenceTypeLabel, ev.evidenceType)}</td>
                          <td className="px-4 py-2 font-mono text-xs">{ev.fileId ?? '-'}</td>
                          <td className="px-4 py-2 text-xs">{formatDateTimeValue(ev.uploadedAt)}</td>
                          <td className="px-4 py-2 max-w-[16rem] truncate text-xs">{ev.remark ?? '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
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
