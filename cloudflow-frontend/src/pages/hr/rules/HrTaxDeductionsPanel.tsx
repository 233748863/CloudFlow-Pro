import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { useDict } from '@/hooks/useDict';
import { getErrorMessage } from '@/utils/errorMessage';
import type { HrRecord } from '@/services/api/hr';
import { ruleDownload, ruleGet, rulePost, rulePut, ruleUpload } from '@/services/api/hr/rules';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { RuleFormDialog, localToday, options } from './RuleWorkspace';

export default function HrTaxDeductionsPanel({ mine = false }: { mine?: boolean }) {
  const { hasPermission } = useAuth();
  const dictionary = useDict('hr_tax_deduction_type');
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [dialog, setDialog] = useState<{ mode: 'edit' | 'verify'; id?: number } | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const path = mine ? '/ess/tax-deductions' : '/compensation/tax-deductions';
  const load = useCallback(async () => { try { setRows(await ruleGet(path)); } catch (error) { toast.error(getErrorMessage(error, '专项扣除加载失败')); } }, [path]);
  useEffect(() => { void load(); }, [load]);
  const statusLabels: Record<string, string> = { DECLARED: '已申报待举证', PROOF_SUBMITTED: '已举证待审核', VERIFIED: '审核通过', REJECTED: '已驳回' };
  return <div className="space-y-3"><p className="text-sm text-cf-subtle">扣除按生效月份参与累计；修改金额或证明后须重新审核，历史工资快照保持不变。</p>{mine && <Button onClick={() => { setForm({ startDate: localToday() }); setFileName(''); setDialog({ mode: 'edit' }); }}>新增专项扣除申报</Button>}
    <HrCrudPanel title={mine ? '本人专项扣除' : '专项扣除证明审核'} rows={rows} pageSize={20} onRefresh={() => void load()} columns={[...(!mine ? [{ key: 'employeeId', label: '员工' }] : []), { key: 'deductionType', label: '扣除类型', render: row => dictionary.getLabel(row.deductionType) }, { key: 'amount', label: '每月金额' }, { key: 'startDate', label: '生效日' }, { key: 'endDate', label: '截止日' }, { key: 'declareStatus', label: '举证状态', render: row => statusLabels[row.declareStatus] || row.declareStatus }, { key: 'rejectReason', label: '驳回原因' }]} actions={row => [
      ...(mine ? [{ label: '修改 / 补交证明', semantic: 'edit' as const, onClick: () => { setForm({ ...row }); setFileName(row.proofFileUrl ? '已有证明文件' : ''); setDialog({ mode: 'edit', id: row.id }); } }] : []),
      ...(row.proofFileUrl ? [{ label: '下载证明', semantic: 'export' as const, onClick: () => { void ruleDownload(mine ? `${path}/${row.id}/proof` : `/compensation/payroll/deductions/${row.id}/proof`, `扣除证明-${row.id}`, { bizType: mine ? 'HR_TAX_PROOF_MINE' : 'HR_TAX_PROOF_MANAGE', bizId: String(row.id), fileId: /^hr-file:HR_TAX_PROOF:([1-9][0-9]*)$/.exec(String(row.proofFileUrl))?.[1] }).catch(error => toast.error(getErrorMessage(error, '下载失败'))); } }] : []),
      ...(!mine && hasPermission('hr:payroll:verify') && row.declareStatus === 'PROOF_SUBMITTED' ? [{ label: '审核证明', semantic: 'confirm' as const, onClick: () => { setForm({ approved: 'true' }); setDialog({ mode: 'verify', id: row.id }); } }] : []),
    ]} />
    <RuleFormDialog open={dialog !== null} title={dialog?.mode === 'verify' ? '审核专项扣除证明' : '申报专项扣除'} form={form} setForm={setForm} onClose={() => setDialog(null)} fields={dialog?.mode === 'verify' ? [{ key: 'approved', label: '审核结果', type: 'select', options: options({ true: '通过', false: '驳回' }), required: true }, { key: 'reason', label: '审核说明（驳回必填）', type: 'textarea', required: form.approved === 'false' }] : [
      { key: 'deductionType', label: '类型', type: 'select', options: dictionary.getOptions().map(option => ({ value: option.value, label: String(option.label) })), required: true }, { key: 'amount', label: '每月扣除金额', type: 'number', min: 0, required: true }, { key: 'startDate', label: '生效日期', type: 'date', required: true }, { key: 'endDate', label: '截止日期', type: 'date' }, { key: 'remark', label: '说明', type: 'textarea' },
    ]} onSubmit={async values => {
      if (uploading) throw new Error('请等待证明上传完成');
      if (dialog?.mode === 'verify') await rulePost(`/compensation/tax-deductions/${dialog.id}/verify`, undefined, { approved: values.approved === 'true', reason: values.reason });
      else if (dialog?.id) await rulePut(`${path}/${dialog.id}`, values); else await rulePost(path, values);
      toast.success('已保存'); await load();
    }}>{dialog?.mode === 'edit' && <label className="block space-y-2 text-sm"><span>证明文件（10 MB 以内）</span><input type="file" disabled={uploading} className="block w-full" onChange={event => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); void ruleUpload('/ess/tax-deductions/proof', file).then(uploaded => { setForm(previous => ({ ...previous, proofFileUrl: uploaded.reference })); setFileName(uploaded.fileName); }).catch(error => toast.error(getErrorMessage(error, '证明上传失败'))).finally(() => setUploading(false)); }} /><span className="text-cf-subtle">{uploading ? '上传中…' : fileName || '可先申报，后补证明；是否计入工资由批次设置决定。'}</span></label>}</RuleFormDialog>
  </div>;
}
