import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { BaseDialog, Button, Pagination } from '@/components/common';
import { Chart } from '@/components/charts/Chart';
import { useAuth } from '@/context/AuthContext';
import { useDict } from '@/hooks/useDict';
import { getErrorMessage } from '@/utils/errorMessage';
import type { HrRecord } from '@/services/api/hr';
import { ruleDownload, ruleGet, rulePost, ruleUpload } from '@/services/api/hr/rules';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { RuleFields, RuleFormDialog, RulePage, options, showValue, type RuleField } from './RuleWorkspace';

const states = { SUBMITTED: '待受理', ACCEPTED: '已受理', INVESTIGATING: '调查中', RESOLVED: '待确认结论', CLOSED: '已关闭', ESCALATED: '已升级争议', WITHDRAWN: '已撤回' };
const stateLabel = (status: string) => states[status as keyof typeof states] || status;
const labels: Record<string, string> = { accept: '受理', investigate: '开始调查', resolve: '给出结论', assign: '分派处理人', escalate: '升级劳动争议', withdraw: '撤回', confirm: '确认处理结论', comment: '补充说明' };
const fileIds = (value: unknown): number[] => { try { return Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch { return []; } };

export default function HrGrievancePage({ mine = false }: { mine?: boolean }) {
  const { hasPermission } = useAuth();
  const grievanceTypes = useDict('hr_grievance_type');
  const typeOptions = grievanceTypes.getOptions();
  const typeLabel = (value: string) => grievanceTypes.getLabel(value) || value;
  const [search] = useSearchParams();
  const path = mine ? '/ess/grievances' : '/grievances';
  const [query, setQuery] = useState<HrRecord>({ status: '', grievanceType: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ grievance: HrRecord; records: HrRecord[]; canAssign: boolean } | null>(null);
  const [dialog, setDialog] = useState<{ action: string; id?: number } | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const [handlers, setHandlers] = useState<{ value: number; label: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, { name: string; value: number }[]> | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await ruleGet<{ rows: HrRecord[]; total: number }>(path, { ...query, pageNum: page, pageSize }); setRows(result.rows.map(row => ({ ...row, id: row.grievanceId }))); setTotal(result.total); }
    catch (error) { toast.error(getErrorMessage(error, '申诉列表加载失败')); }
    finally { setLoading(false); }
  }, [path, query, page, pageSize]);
  useEffect(() => { void load(); }, [load]);
  const openDetail = useCallback(async (id: number) => {
    try { setDetail(await ruleGet(`${path}/${id}`)); }
    catch (error) { toast.error(getErrorMessage(error, '无法查看该申诉')); }
  }, [path]);
  useEffect(() => { const id = Number(search.get('id')); if (id > 0) void openDetail(id); }, [search, openDetail]);
  const startAction = async (action: string, grievance?: HrRecord) => {
    setForm(action === 'submit' ? { grievanceType: 'OTHER', priority: 'NORMAL', againstType: 'NONE', fileIds: [] } : { visibleToEmployee: mine, satisfied: true, fileIds: [] });
    setUploadedNames([]);
    if (action === 'assign' && grievance) {
      try { const result = await ruleGet<{ userId: number; userName: string }[]>(`${path}/${grievance.grievanceId}/handlers`); setHandlers(result.map(handler => ({ value: handler.userId, label: handler.userName }))); }
      catch (error) { toast.error(getErrorMessage(error, '处理人加载失败')); return; }
    }
    setDialog({ action, id: grievance?.grievanceId }); setDetail(null);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if ((form.fileIds?.length || 0) + files.length > 10) { toast.error('每次最多上传 10 个附件'); return; }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await ruleUpload(`${path}/files`, file);
        setForm(previous => ({ ...previous, fileIds: [...(previous.fileIds || []), uploaded.fileId] }));
        setUploadedNames(previous => [...previous, uploaded.fileName]);
      }
    } catch (error) { toast.error(getErrorMessage(error, '附件上传失败')); }
    finally { setUploading(false); }
  };
  const submitFields: RuleField[] = [
    { key: 'grievanceType', label: '申诉类型', type: 'select', options: typeOptions, required: true },
    { key: 'priority', label: '优先级', type: 'select', options: options({ LOW: '低', NORMAL: '普通', HIGH: '高', URGENT: '紧急' }), required: true },
    { key: 'subject', label: '标题', required: true }, { key: 'againstType', label: '指向对象', type: 'select', options: options({ NONE: '无明确指向', USER: '用户', DEPT: '部门', POLICY: '制度' }) },
    ...(form.againstType === 'USER' ? [{ key: 'againstId', label: '被指向用户', type: 'user' as const, required: true }] : []),
    ...(form.againstType === 'DEPT' ? [{ key: 'againstId', label: '被指向部门', type: 'dept' as const, required: true }] : []),
    ...(form.againstType === 'POLICY' ? [{ key: 'againstName', label: '制度名称', required: true }] : []),
    { key: 'description', label: '详细描述', type: 'textarea', required: true }, { key: 'cause', label: '起因', type: 'textarea' }, { key: 'expectation', label: '期望结果', type: 'textarea' },
    { key: 'relatedBizType', label: '关联业务', type: 'select', options: options({ SALARY_SLIP: '工资单', PERFORMANCE_RESULT: '绩效结果', ATTENDANCE: '考勤记录' }) }, { key: 'relatedBizId', label: '关联单据编号', type: 'number', min: 1 },
  ];
  const actionFields: RuleField[] = dialog?.action === 'assign' ? [{ key: 'handlerId', label: '处理人', type: 'select', options: handlers, numeric: true, required: true }] : [
    ...(dialog?.action === 'confirm' ? [{ key: 'satisfied', label: '认可结论并关闭申诉', type: 'checkbox' as const, hint: '取消勾选表示退回调查；每份申诉只允许退回一次。' }] : []),
    { key: 'content', label: dialog?.action === 'resolve' ? '处理结论' : '说明', type: 'textarea', required: ['resolve', 'comment', 'escalate'].includes(dialog?.action || '') || dialog?.action === 'confirm' && !form.satisfied },
    ...(!mine && dialog?.action === 'comment' ? [{ key: 'visibleToEmployee', label: '允许申诉人查看本条说明与附件', type: 'checkbox' as const }] : []),
  ];
  const downloadable = (attachments: unknown) => fileIds(attachments).map(fileId => <Button key={fileId} size="sm" variant="outline" onClick={() => { if (detail) void ruleDownload(`${path}/${detail.grievance.grievanceId}/files/${fileId}`, `附件-${fileId}`).catch(error => toast.error(getErrorMessage(error, '下载失败'))); }}>附件 #{fileId}</Button>);
  const canHandle = hasPermission(mine ? 'hr:grievance:mine:update' : 'hr:grievance:manage:handle');
  const isHr = Boolean(detail?.canAssign);
  const availableActions = (grievance: HrRecord) => {
    if (mine) return ['SUBMITTED', 'ACCEPTED', 'INVESTIGATING', 'RESOLVED'].includes(grievance.status)
      ? ['comment', ...(grievance.status === 'SUBMITTED' ? ['withdraw'] : []), ...(grievance.status === 'RESOLVED' ? ['confirm'] : [])] : [];
    return [
      ...(grievance.status === 'SUBMITTED' ? ['accept'] : []), ...(grievance.status === 'ACCEPTED' ? ['investigate'] : []),
      ...(grievance.status === 'INVESTIGATING' ? ['resolve'] : []),
      ...(['SUBMITTED', 'ACCEPTED', 'INVESTIGATING', 'RESOLVED'].includes(grievance.status) ? ['comment'] : []),
      ...(isHr && ['SUBMITTED', 'ACCEPTED', 'INVESTIGATING'].includes(grievance.status) ? ['assign'] : []),
      ...(isHr && ['ACCEPTED', 'INVESTIGATING'].includes(grievance.status) ? ['escalate'] : []),
    ];
  };
  return <RulePage title={mine ? '我的申诉' : '员工申诉处理'} description="薪资、绩效和管理类诉求留痕；考勤问题请使用考勤申诉。" actions={<>
    <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className="mr-2" />刷新</Button>
    {mine && hasPermission('hr:grievance:mine:create') && <Button onClick={() => void startAction('submit')}><Plus size={16} className="mr-2" />提交申诉</Button>}
    {!mine && <Button variant="outline" onClick={() => { void ruleGet<Record<string, { name: string; value: number }[]>>(`${path}/statistics`, query).then(setStats).catch(error => toast.error(getErrorMessage(error, '统计加载失败'))); }}>查看统计</Button>}
  </>}>
    <div className="card flex items-start gap-3 p-4 text-sm text-cf-subtle"><ShieldCheck size={20} className="shrink-0" /><p>申诉内容仅本人、人力资源和指定处理人可见；被指向用户无权访问。{mine ? '内部处理记录不会展示给您。' : '查看他人申诉会记录审计日志。'}</p></div>
    <div className="card p-4"><RuleFields fields={[{ key: 'status', label: '状态', type: 'select', options: options(states) }, { key: 'grievanceType', label: '类型', type: 'select', options: typeOptions }, ...(!mine && hasPermission('system:dept:list') ? [{ key: 'deptId', label: '部门', type: 'dept' as const }] : []), ...(!mine ? [{ key: 'handlerId', label: '处理人', type: 'user' as const }] : [])]} form={query} setForm={updater => { setQuery(updater); setPage(1); }} /></div>
    <HrCrudPanel title="申诉列表" rows={rows} loading={loading} columns={[{ key: 'grievanceNo', label: '编号' }, { key: 'subject', label: '标题' }, ...(!mine ? [{ key: 'employeeName', label: '申诉人' }] : []), { key: 'grievanceType', label: '类型', render: row => typeLabel(row.grievanceType) }, { key: 'status', label: '进度', render: row => stateLabel(row.status) }, { key: 'handlerName', label: '处理人' }, { key: 'createTime', label: '提交时间' }]} actions={row => [{ label: '查看详情', semantic: 'view', onClick: () => void openDetail(row.grievanceId) }]} />
    <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
    <RuleFormDialog open={dialog !== null} title={dialog?.action === 'submit' ? '提交本人申诉' : labels[dialog?.action || ''] || '处理申诉'} fields={dialog?.action === 'submit' ? submitFields : actionFields} form={form} setForm={setForm} onClose={() => setDialog(null)} submitLabel="确认提交" onSubmit={async values => {
      if (uploading) throw new Error('附件仍在上传，请稍候');
      if (dialog?.action === 'submit') await rulePost(path, values); else await rulePost(`${path}/${dialog?.id}/${dialog?.action}`, values);
      toast.success('已提交'); await load(); if (dialog?.id) await openDetail(dialog.id);
    }}>
      {dialog?.action !== 'assign' && <div className="space-y-2"><label className="block text-sm">附件（最多 10 个，每个 10 MB）<input type="file" multiple disabled={uploading} className="mt-2 block w-full text-sm" onChange={event => void upload(event.target.files)} /></label><p className="text-xs text-cf-subtle">{uploading ? '上传中…' : uploadedNames.join('、')}</p></div>}
    </RuleFormDialog>
    <BaseDialog open={detail !== null} title={detail?.grievance.subject || '申诉详情'} width="wide" onClose={() => setDetail(null)} footer={<div className="flex flex-wrap gap-2">{detail && canHandle && availableActions(detail.grievance).map(action => <Button key={action} variant={['withdraw', 'escalate'].includes(action) ? 'outline' : 'default'} onClick={() => void startAction(action, detail.grievance)}>{labels[action]}</Button>)}</div>}>
      {detail && <div className="space-y-5"><div className="grid gap-3 text-sm md:grid-cols-2"><p>编号：{detail.grievance.grievanceNo}</p><p>状态：{stateLabel(detail.grievance.status)}</p><p>指向：{showValue(detail.grievance.againstName)}</p><p>处理人：{showValue(detail.grievance.handlerName)}</p></div>
        {(['description', 'cause', 'expectation', 'resolutionDetail'] as const).map(key => <section key={key}><h3 className="mb-2 font-medium">{{ description: '描述', cause: '起因', expectation: '期望结果', resolutionDetail: '处理结论' }[key]}</h3><p className="whitespace-pre-wrap break-words text-sm">{showValue(detail.grievance[key])}</p></section>)}
        {detail.grievance.relatedBizId && (detail.grievance.relatedBizType === 'PERFORMANCE_RESULT' && !hasPermission('hr:performance:list')
          ? <p className="text-sm text-cf-subtle">关联绩效结果 #{detail.grievance.relatedBizId}（暂无查看权限）</p>
          : <Link className="text-sm underline" to={`${detail.grievance.relatedBizType === 'SALARY_SLIP' ? mine ? '/hr/ess/slips' : '/hr/payroll' : detail.grievance.relatedBizType === 'ATTENDANCE' ? mine ? '/hr/ess/attendance' : '/hr/attendance' : '/hr/performance'}?id=${detail.grievance.relatedBizId}`}>查看关联单据 #{detail.grievance.relatedBizId}</Link>)}
        <div className="flex flex-wrap gap-2">{downloadable(detail.grievance.attachmentUrl)}</div>
        {!mine && detail.grievance.escalatedDisputeId && <Link className="block text-sm underline" to={`/hr/labor-dispute-list?id=${detail.grievance.escalatedDisputeId}`}>查看升级后的劳动争议 #{detail.grievance.escalatedDisputeId}</Link>}
        <section className="space-y-3"><h3 className="font-medium">处理记录</h3>{detail.records.map(record => <article key={record.recordId} className="rounded-lg border border-[var(--cf-border)] p-3 text-sm"><p className="mb-2 text-xs text-cf-subtle">{record.operatorName} · {record.createTime}{Number(record.visibleToEmployeeFlag) === 0 ? ' · 内部记录' : ''}</p><p className="whitespace-pre-wrap break-words">{record.content}</p><div className="mt-2 flex flex-wrap gap-2">{downloadable(record.attachmentUrl)}</div></article>)}</section>
      </div>}
    </BaseDialog>
    <BaseDialog open={stats !== null} title="申诉分布（仅包含有权查看的记录）" width="wide" onClose={() => setStats(null)}><div className="space-y-5">{stats && [['byType', '按类型'], ['byDept', '按部门'], ['byDuration', '已给结论的处理时长']].map(([key, title]) => <section key={key}><h3 className="font-medium">{title}</h3><Chart seriesCount={1} dataTable={{ columns: [title, '数量'], rows: (stats[key] || []).map(item => [key === 'byType' ? typeLabel(item.name) : item.name, item.value]) }} ariaLabel={title} style={{ height: 240 }} option={{ tooltip: { trigger: 'axis' }, grid: { bottom: 50, containLabel: true }, xAxis: { type: 'category', data: (stats[key] || []).map(item => key === 'byType' ? typeLabel(item.name) : item.name) }, yAxis: { type: 'value', minInterval: 1 }, series: [{ type: 'bar', data: (stats[key] || []).map(item => item.value) }] }} /></section>)}</div></BaseDialog>
  </RulePage>;
}
