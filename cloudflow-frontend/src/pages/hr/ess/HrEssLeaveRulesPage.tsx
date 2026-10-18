import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import type { HrRecord } from '@/services/api/hr';
import { ruleGet, rulePost, ruleUpload } from '@/services/api/hr/rules';
import { getErrorMessage } from '@/utils/errorMessage';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { HrLeaveProofs } from '../rules/HrLeaveProofs';
import { RuleFormDialog, RulePage, namedOptions } from '../rules/RuleWorkspace';

export default function HrEssLeaveRulesPage() {
  const [quotas, setQuotas] = useState<HrRecord[]>([]);
  const [requests, setRequests] = useState<HrRecord[]>([]);
  const [types, setTypes] = useState<HrRecord[]>([]);
  const [dialog, setDialog] = useState<{ cancelId?: number } | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const [calculated, setCalculated] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const load = useCallback(async () => { try { const [balances, applications, leaveTypes] = await Promise.all([ruleGet('/ess/leave/quotas'), ruleGet('/ess/leave/mine'), ruleGet('/ess/leave/types')]); setQuotas(balances); setRequests(applications); setTypes(leaveTypes); } catch (error) { toast.error(getErrorMessage(error, '假期数据加载失败')); } }, []);
  useEffect(() => { void load(); }, [load]);
  const unitName = (leaveTypeId: number) => types.find(type => type.id === leaveTypeId)?.unit === 'HOUR' ? '小时' : '天';
  const calculate = async () => {
    if (!form.leaveTypeId || !form.startTime || !form.endTime) throw new Error('请选择假期类型及起止时间');
    const quantity = await ruleGet<number>('/ess/leave/calculate', { leaveTypeId: form.leaveTypeId, startTime: form.startTime, endTime: form.endTime });
    setCalculated(`${Number(quantity).toFixed(2)} ${unitName(form.leaveTypeId)}（按工作日历计算）`);
  };
  const stateNames: Record<string, string> = { PENDING: '审批中', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已撤回' };
  return <RulePage title="我的假期与请假" description="服务端按日历和班次计算数量；提交时冻结额度，通过后扣减，驳回或撤回后释放。" actions={<Button onClick={() => { setForm({ requestType: 'LEAVE', attachmentFileIds: [] }); setCalculated(''); setFileNames([]); setDialog({}); }}>申请请假</Button>}>
    <Tabs defaultValue="quotas"><TabsList><TabsTrigger value="quotas">假期余额</TabsTrigger><TabsTrigger value="requests">请假申请</TabsTrigger></TabsList><TabsContent value="quotas"><HrCrudPanel title="本人分周期额度" rows={quotas} pageSize={20} onRefresh={() => void load()} columns={[{ key: 'leaveTypeId', label: '假期', render: row => types.find(type => type.id === row.leaveTypeId)?.leaveName || `假期 #${row.leaveTypeId}` }, { key: 'periodId', label: '周期编号' }, { key: 'totalQuota', label: '总额度' }, { key: 'usedQuota', label: '已使用' }, { key: 'frozenQuota', label: '审批中冻结' }, { key: 'availableQuota', label: '可用余额' }, { key: 'unit', label: '单位', render: row => unitName(row.leaveTypeId) }]} /></TabsContent><TabsContent value="requests"><HrCrudPanel title="本人请假申请" rows={requests} pageSize={20} onRefresh={() => void load()} columns={[{ key: 'requestNo', label: '编号' }, { key: 'leaveTypeId', label: '假期', render: row => types.find(type => type.id === row.leaveTypeId)?.leaveName || row.leaveTypeId }, { key: 'startTime', label: '开始' }, { key: 'endTime', label: '结束' }, { key: 'duration', label: '数量', render: row => `${Number(row.duration || 0).toFixed(2)} ${row.unit === 'HOUR' ? '小时' : '天'}` }, { key: 'status', label: '状态', render: row => stateNames[row.status] || row.status }, { key: 'reason', label: '事由' }, { key: 'proof', label: '证明', render: row => <HrLeaveProofs requestId={row.id} mine /> }]} actions={row => row.status === 'PENDING' ? [{ label: '撤回申请', semantic: 'void', onClick: () => { setForm({ confirmed: false }); setDialog({ cancelId: row.id }); } }] : []} /></TabsContent></Tabs>
    <RuleFormDialog open={dialog !== null} title={dialog?.cancelId ? '撤回本人请假申请' : '提交请假申请'} form={form} setForm={updater => { setForm(updater); setCalculated(''); }} onClose={() => setDialog(null)} fields={dialog?.cancelId ? [{ key: 'confirmed', label: '确认撤回，释放审批中冻结额度', type: 'checkbox', required: true }] : [{ key: 'leaveTypeId', label: '假期类型', type: 'select', numeric: true, options: namedOptions(types.filter(type => Number(type.status) === 1), 'id', 'leaveName'), required: true }, { key: 'startTime', label: '开始时间', type: 'datetime-local', required: true }, { key: 'endTime', label: '结束时间', type: 'datetime-local', required: true }, { key: 'reason', label: '请假事由', type: 'textarea', required: true }]} onSubmit={async values => {
      if (dialog?.cancelId) { if (!values.confirmed) throw new Error('请确认撤回'); await rulePost(`/ess/leave/${dialog.cancelId}/cancel`); }
      else { if (uploading) throw new Error('请等待附件上传完成'); await rulePost('/ess/leave', values); }
      toast.success(dialog?.cancelId ? '已撤回' : '请假已提交审批'); await load();
    }}>
      {!dialog?.cancelId && <div className="space-y-3"><div className="flex items-center gap-3"><Button type="button" variant="outline" onClick={() => void calculate().catch(error => toast.error(getErrorMessage(error, '时长试算失败')))}>试算请假数量</Button><span role="status" className="text-sm">{calculated}</span></div><label className="block space-y-2 text-sm"><span>证明附件（每个不超过 10 MB）</span><input type="file" disabled={uploading} multiple className="block w-full" onChange={event => { const files = Array.from(event.target.files || []); if (!files.length) return; if ((form.attachmentFileIds?.length || 0) + files.length > 10) { toast.error('最多上传 10 个附件'); return; } setUploading(true); void (async () => { for (const file of files) { const uploaded = await ruleUpload('/ess/leave/files', file); setForm(previous => ({ ...previous, attachmentFileIds: [...(previous.attachmentFileIds || []), uploaded.fileId] })); setFileNames(previous => [...previous, uploaded.fileName]); } })().catch(error => toast.error(getErrorMessage(error, '附件上传失败'))).finally(() => setUploading(false)); }} /><span className="text-cf-subtle">{uploading ? '上传中…' : fileNames.join('、')}</span></label></div>}
    </RuleFormDialog>
  </RulePage>;
}
