import React, { useCallback, useEffect, useState } from 'react';
import { Eye, FileUp, Pencil, Plus, RefreshCcw, Send, XCircle } from 'lucide-react';
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
  Textarea,
} from '@/components/common';
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
import { formatDateTimeValue, formatMoneyValue, hasWorkflowStatus, normalizeRows } from '../hrShared';
import { StageTimeline } from '../components/StageTimeline';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const statusFlow = ['REGISTERED', 'MEDIATING', 'MEDIATED', 'ARBITRATING', 'AWARDED', 'EXECUTED', 'CLOSED'];

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

  const disputeTypeOptions = useDict('hr_labor_dispute_type').getOptions();
  const evidenceTypeOptions = useDict('hr_evidence_type').getOptions();
  const { getLabel: statusLabel } = useDict('hr_labor_dispute_status');

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

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">LABOR DISPUTES</p>
          <h2>劳动争议</h2>
          <span>登记劳动争议、发起处理流程、维护证据材料和关闭记录</span>
        </div>
      </header>
      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><FileUp size={18} /></div>
          <div><p>争议总数</p><strong>{rows.length}</strong><span>当前筛选结果</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><Send size={18} /></div>
          <div><p>可发起处理</p><strong>{rows.filter((row) => hasWorkflowStatus(row.status, 'REGISTERED', 'MEDIATED')).length}</strong><span>登记或调解完成</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><XCircle size={18} /></div>
          <div><p>未关闭</p><strong>{rows.filter((row) => !hasWorkflowStatus(row.status, 'CLOSED')).length}</strong><span>处理中争议</span></div>
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
            <Plus className="mr-1.5 h-4 w-4" />登记争议
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[920px]">
        <thead>
          <tr>
            <th>编号</th>
            <th>申请人</th>
            <th>争议类型</th>
            <th>诉求金额</th>
            <th>当前阶段</th>
            <th>登记时间</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="admin-settings-empty">加载中...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="admin-settings-empty">暂无争议</td></tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">
                  <button type="button" onClick={() => void openDetail(row)} className="text-sky-600 hover:underline">
                    {row.disputeNo}
                  </button>
                </td>
                <td>
                  {row.applicantEmployeeId ? `员工 #${row.applicantEmployeeId}` : `${row.applicantExternalName ?? '-'} ${row.applicantExternalPhone ?? ''}`}
                </td>
                <td><DictLabel dictType="hr_labor_dispute_type" value={row.disputeType} fallback="-" /></td>
                <td>{formatMoneyValue(row.claimAmount)}</td>
                <td><StageTimeline steps={statusFlow} dictType="hr_labor_dispute_status" current={row.status} tone="sky" /></td>
                <td>{formatDateTimeValue(row.openedAt ?? row.createTime)}</td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => void openDetail(row)}><Eye size={15} /></button>
                    {hasWorkflowStatus(row.status, 'REGISTERED', 'MEDIATED') ? (
                      <button type="button" data-tooltip="发起处理" aria-label="发起处理" onClick={() => void handleSubmit(row)}><Send size={15} /></button>
                    ) : null}
                    <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openEdit(row)}><Pencil size={15} /></button>
                    <button type="button" data-tooltip="上传证据" aria-label="上传证据" onClick={() => setEvidenceOpen(row)}><FileUp size={15} /></button>
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
        title={editing ? '编辑争议' : '登记争议'}
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
              <Label>申请人员工 (可选)</Label>
              <EmployeeSelector single allowClear value={form.applicantEmployeeId ?? null} onChange={(id) => setForm({ ...form, applicantEmployeeId: id ?? undefined })} placeholder="选择内部员工，外部申请人留空" />
            </div>
            <div className="admin-dialog-field">
              <Label>外部申请人姓名</Label>
              <Input value={form.applicantExternalName ?? ''} onChange={(e) => setForm({ ...form, applicantExternalName: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>外部联系电话</Label>
              <Input value={form.applicantExternalPhone ?? ''} onChange={(e) => setForm({ ...form, applicantExternalPhone: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>争议类型</Label>
              <Select value={String(form.disputeType ?? 'SALARY')} onValueChange={(v) => setForm({ ...form, disputeType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {disputeTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field col-span-2">
              <Label>诉求金额</Label>
              <Input type="number" value={String(form.claimAmount ?? '')} onChange={(e) => setForm({ ...form, claimAmount: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>诉求描述</Label>
            <Textarea rows={4} value={form.claimDescription ?? ''} onChange={(e) => setForm({ ...form, claimDescription: e.target.value })} />
          </div>
        </>
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
          bodyClassName="admin-dialog-stack"
          footer={<div className="flex justify-end"><Button variant="outline" onClick={() => { setDetail(null); setEvidence([]); }}>关闭</Button></div>}
        >
          <div className="admin-source-content-grid text-sm">
            <StageTimeline steps={statusFlow} dictType="hr_labor_dispute_status" current={detail.status} tone="sky" />
            <div className="grid grid-cols-2 gap-3">
              <div className="admin-dialog-field"><span className="text-cf-subtle">申请人:</span> {detail.applicantEmployeeId ? `员工 #${detail.applicantEmployeeId}` : `${detail.applicantExternalName ?? '-'} ${detail.applicantExternalPhone ?? ''}`}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">类型:</span> <DictLabel dictType="hr_labor_dispute_type" value={detail.disputeType} fallback="-" /></div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">诉求金额:</span> {formatMoneyValue(detail.claimAmount)}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">登记时间:</span> {formatDateTimeValue(detail.openedAt ?? detail.createTime)}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">关闭时间:</span> {formatDateTimeValue(detail.closedAt)}</div>
              <div className="admin-dialog-field"><span className="text-cf-subtle">工作流:</span> {detail.processInstanceId ?? '-'}</div>
            </div>
            {detail.claimDescription && (
              <div className="admin-dialog-field">
                <div className="text-cf-subtle">诉求描述:</div>
                <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-2 text-xs whitespace-pre-wrap dark:border-slate-800 dark:bg-slate-950">{detail.claimDescription}</div>
              </div>
            )}
            <div>
              <div className="mb-2 font-semibold">证据材料 · 共 {evidence.length} 份</div>
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[480px]">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>附件 ID</th>
                      <th>上传时间</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.length === 0 ? (
                      <tr><td colSpan={4} className="admin-settings-empty">暂无证据</td></tr>
                    ) : (
                      evidence.map((ev) => (
                        <tr key={ev.id}>
                          <td><DictLabel dictType="hr_evidence_type" value={ev.evidenceType} fallback="-" /></td>
                          <td className="font-mono text-xs">{ev.fileId ?? '-'}</td>
                          <td>{formatDateTimeValue(ev.uploadedAt)}</td>
                          <td className="max-w-[16rem] truncate text-xs">{ev.remark ?? '-'}</td>
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
          bodyClassName="admin-dialog-stack"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEvidenceOpen(null)}>取消</Button>
              <Button onClick={() => void handleUploadEvidence()}>上传</Button>
            </div>
          }
        >
          <>
            <div className="admin-dialog-field">
              <Label>证据类型</Label>
              <Select value={String(evidenceForm.evidenceType ?? 'CONTRACT')} onValueChange={(v) => setEvidenceForm({ ...evidenceForm, evidenceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {evidenceTypeOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>附件 ID(cloudflow_common_file)</Label>
              <Input type="number" value={String(evidenceForm.fileId ?? '')} onChange={(e) => setEvidenceForm({ ...evidenceForm, fileId: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div className="admin-dialog-field">
              <Label>备注</Label>
              <Textarea rows={2} value={evidenceForm.remark ?? ''} onChange={(e) => setEvidenceForm({ ...evidenceForm, remark: e.target.value })} />
            </div>
          </>
        </BaseDialog>
      )}
    </section>
  );
};

export default HrLaborDisputePage;
