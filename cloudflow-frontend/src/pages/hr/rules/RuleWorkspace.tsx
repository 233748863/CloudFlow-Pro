import React, { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, DeptSelector, EmployeeSelector, PositionSelector, UserSelector, Input, Label, Textarea, type TableRowActionItem } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { normalizeFormNumber } from '@/utils/amountValue';
import type { HrPagedResult, HrRecord } from '@/services/api/hr';
import { ruleGet, rulePost, rulePut, type RuleTaskResult } from '@/services/api/hr/rules';
import { HrCrudPanel, type HrTableColumn } from '../HrDomainWorkspace';
import '../admin-hr.css';

export interface RuleField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'month' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'multiselect' | 'employee' | 'employees' | 'positions' | 'jobLevels' | 'user' | 'dept' | 'depts' | 'checkbox';
  options?: { value: string | number; label: string }[];
  required?: boolean;
  numeric?: boolean;
  hint?: string;
  min?: number;
  max?: number;
}

export const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }));
export const yesNo = [{ value: 1, label: '是' }, { value: 0, label: '否' }];
export const namedOptions = (rows: HrRecord[], idKey: string, nameKey: string) => rows.map(row => ({ value: Number(row[idKey]), label: String(row[nameKey] || row[idKey]) }));
export const showValue = (value: unknown): string => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export const localToday = () => new Date().toLocaleDateString('sv-SE');

export const employeeScopeFields: RuleField[] = [
  { key: 'employeeIds', label: '指定员工', type: 'employees' }, { key: 'deptIds', label: '部门范围', type: 'depts' },
  { key: 'positionIds', label: '岗位范围', type: 'positions' }, { key: 'jobLevelIds', label: '职级范围', type: 'jobLevels' },
];

function RuleJobLevels({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  const [levels, setLevels] = useState<HrRecord[]>([]);
  useEffect(() => { void ruleGet('/organization/levels').then(setLevels).catch(error => toast.error(getErrorMessage(error, '职级加载失败'))); }, []);
  return <div className="flex flex-wrap gap-3">{levels.map(level => <label key={level.id} className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={value.includes(Number(level.id))} onChange={event => onChange(event.target.checked ? [...value, Number(level.id)] : value.filter(id => id !== Number(level.id)))} />{level.levelName}
  </label>)}</div>;
}

export function RulePage({ title, description, children, actions }: { title: string; description: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const { hasPermission } = useAuth();
  return <section className="admin-source-page space-y-4">
    <header className="admin-source-header"><div><p className="admin-source-kicker">HR</p><h2>{title}</h2><span>{description}</span></div><div className="admin-source-controls">{actions}</div></header>
    <nav className="flex flex-wrap gap-3 text-sm" aria-label="人事规则导航">
      {hasPermission('hr:leave:list') && <Link className="underline underline-offset-4" to="/hr/leave-rules">假期政策与台账</Link>}
      {hasPermission('hr:attendance:list') && <Link className="underline underline-offset-4" to="/hr/attendance">考勤规则与月封账</Link>}
      {hasPermission('hr:payroll:list') && <Link className="underline underline-offset-4" to="/hr/payroll">薪资批次</Link>}
      {hasPermission('hr:grievance:manage:list') && <Link className="underline underline-offset-4" to="/hr/grievances">员工申诉</Link>}
      <Link className="underline underline-offset-4" to="/hr/ess">员工自助</Link>
    </nav>
    {children}
  </section>;
}

export function RuleFields({ fields, form, setForm }: { fields: RuleField[]; form: HrRecord; setForm: React.Dispatch<React.SetStateAction<HrRecord>> }) {
  const prefix = useId();
  return <div className="grid gap-4 md:grid-cols-2">{fields.map(field => {
    const fieldId = `${prefix}-${field.key}`;
    const value = form[field.key];
    const setValue = (next: unknown) => setForm(previous => ({ ...previous, [field.key]: next }));
    const label = <Label id={`${fieldId}-label`} htmlFor={fieldId}>{field.label}{field.required ? ' *' : ''}</Label>;
    let control: React.ReactNode;
    if (field.type === 'employee') control = <EmployeeSelector single value={value} onChange={setValue} allowClear={!field.required} />;
    else if (field.type === 'user') control = <UserSelector single value={value == null ? null : String(value)} onChange={next => setValue(next == null ? null : Number(next))} allowClear={!field.required} />;
    else if (field.type === 'employees') control = <EmployeeSelector value={value || []} onChange={setValue} />;
    else if (field.type === 'positions') control = <PositionSelector value={value || []} onChange={setValue} />;
    else if (field.type === 'jobLevels') control = <RuleJobLevels value={value || []} onChange={setValue} />;
    else if (field.type === 'dept') control = <DeptSelector single value={value} onChange={setValue} allowClear={!field.required} />;
    else if (field.type === 'depts') control = <DeptSelector value={value || []} onChange={setValue} />;
    else if (field.type === 'multiselect') control = <div className="flex flex-wrap gap-3">{field.options?.map(option => <label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(value) && value.includes(option.value)} onChange={event => setValue(event.target.checked ? [...(value || []), option.value] : (value || []).filter((entry: string | number) => entry !== option.value))} />{option.label}</label>)}</div>;
    else if (field.type === 'select') control = <select id={fieldId} className="cf-control w-full" required={field.required} value={value ?? ''} onChange={event => setValue(event.target.value === '' ? null : field.numeric ? Number(event.target.value) : event.target.value)}>
      <option value="">请选择</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
    else if (field.type === 'textarea') control = <Textarea id={fieldId} required={field.required} value={value ?? ''} rows={4} onChange={event => setValue(event.target.value)} />;
    else if (field.type === 'checkbox') control = <input id={fieldId} type="checkbox" checked={Boolean(value)} onChange={event => setValue(event.target.checked)} className="h-5 w-5" />;
    else control = <Input id={fieldId} type={field.type || 'text'} required={field.required} min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''}
      onChange={event => setValue(event.target.value === '' ? null : field.type === 'number' ? normalizeFormNumber(event.target.value) : event.target.value)} />;
    return <div key={field.key} className={field.type === 'textarea' ? 'space-y-2 md:col-span-2' : 'space-y-2'} aria-labelledby={`${fieldId}-label`}>{label}{control}{field.hint && <p className="text-xs text-cf-subtle">{field.hint}</p>}</div>;
  })}</div>;
}

export function RuleFormDialog({ title, open, onClose, fields, form, setForm, onSubmit, children, submitLabel = '保存' }: {
  title: string; open: boolean; onClose: () => void; fields: RuleField[]; form: HrRecord;
  setForm: React.Dispatch<React.SetStateAction<HrRecord>>; onSubmit: (form: HrRecord) => Promise<unknown>;
  children?: React.ReactNode; submitLabel?: string;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    for (const field of fields.filter(item => item.required)) {
      const value = form[field.key];
      if (value == null || value === '' || Array.isArray(value) && value.length === 0 || field.type === 'checkbox' && value !== true) { toast.error(`请填写${field.label}`); return; }
    }
    setBusy(true);
    try {
      const result = await onSubmit(form);
      if (result !== false) onClose();
    } catch (error) { toast.error(getErrorMessage(error, '操作失败')); }
    finally { setBusy(false); }
  };
  return <BaseDialog open={open} title={title} width="wide" onClose={() => { if (!busy) onClose(); }} footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" form={formId} disabled={busy}>{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{submitLabel}</Button></div>}>
    <form id={formId} onSubmit={event => void submit(event)} className="space-y-4"><RuleFields fields={fields} form={form} setForm={setForm} />{children}</form>
  </BaseDialog>;
}

export function RuleResource({ title, path, primaryKey = 'id', columns, fields, defaults = {}, writePath = path, permission, createPermission, allowCreate = true, actions, refreshKey = 0, description, prepareForm, preparePayload }: {
  title: string; path: string; primaryKey?: string; columns: HrTableColumn[]; fields?: RuleField[]; defaults?: HrRecord; writePath?: string;
  permission?: string; createPermission?: string; allowCreate?: boolean; actions?: (row: HrRecord, refresh: () => void) => TableRowActionItem[]; refreshKey?: number; description?: string;
  prepareForm?: (row: HrRecord) => HrRecord; preparePayload?: (row: HrRecord, original: HrRecord) => HrRecord;
}) {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<HrRecord>({});
  const [dialog, setDialog] = useState<{ id?: number } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await ruleGet(path); setRows(result.map(row => ({ ...row, id: row[primaryKey] }))); }
    catch (error) { toast.error(getErrorMessage(error, `${title}加载失败`)); }
    finally { setLoading(false); }
  }, [path, primaryKey, title]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const writable = Boolean(fields && permission && hasPermission(permission));
  const canCreate = Boolean(allowCreate && fields && (createPermission || permission) && hasPermission(createPermission || permission || ''));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-cf-subtle">{description}</p>{canCreate && <Button onClick={() => { setForm({ ...defaults }); setDialog({}); }}><Plus size={16} className="mr-2" />新增{title}</Button>}</div>
    <HrCrudPanel title={title} rows={rows} columns={columns} loading={loading} onRefresh={() => void load()} pageSize={20} actions={row => [
      ...(writable ? [{ label: '修改', semantic: 'edit' as const, onClick: () => { setForm(prepareForm ? prepareForm(row) : { ...row }); setDialog({ id: Number(row[primaryKey] || row.id) }); } }] : []),
      ...(actions?.(row, () => void load()) || []),
    ]} />
    <RuleFormDialog open={dialog !== null} title={`${dialog?.id ? '修改' : '新增'}${title}`} fields={fields || []} form={form} setForm={setForm} onClose={() => setDialog(null)} onSubmit={async values => {
      const fieldsPayload = Object.fromEntries((fields || []).map(field => [field.key, values[field.key] ?? null]));
      const payload = preparePayload ? preparePayload(fieldsPayload, values) : fieldsPayload;
      if (dialog?.id) await rulePut(`${writePath}/${dialog.id}`, payload); else await rulePost(writePath, { ...defaults, ...payload });
      toast.success('已保存'); await load();
    }} />
  </div>;
}

export function RulePagedResource({ title, path, columns, query, refreshKey = 0, actions }: {
  title: string; path: string; columns: HrTableColumn[]; query: HrRecord; refreshKey?: number;
  actions?: (row: HrRecord) => TableRowActionItem[];
}) {
  const filterKey = JSON.stringify(query);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, filterKey });
  const page = pagination.filterKey === filterKey ? pagination.page : 1;
  const pageSize = pagination.pageSize;
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void ruleGet<HrPagedResult<HrRecord>>(path, { ...query, pageNum: page, pageSize }).then(result => {
      if (!active) return;
      const resultPageSize = result.pageSize ?? pageSize;
      const lastPage = Math.max(1, Math.ceil(result.total / resultPageSize));
      if (page > lastPage || resultPageSize !== pageSize) {
        setPagination({ page: Math.min(page, lastPage), pageSize: resultPageSize, filterKey });
      }
      setRows(result.rows ?? result.records ?? []);
      setTotal(result.total);
    }).catch(failure => {
      if (!active) return;
      const message = getErrorMessage(failure, `${title}加载失败，请刷新重试`);
      setRows([]);
      setTotal(0);
      setError(message);
      toast.error(message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, title, query, filterKey, page, pageSize, refreshKey, revision]);
  return <HrCrudPanel title={title} rows={rows} columns={columns} loading={loading} actions={actions}
    emptyTitle={error || '暂无数据'} onRefresh={() => setRevision(previous => previous + 1)}
    pagination={{ total, page, pageSize,
      onPageChange: nextPage => setPagination({ page: nextPage, pageSize, filterKey }),
      onPageSizeChange: nextSize => setPagination({ page: 1, pageSize: nextSize, filterKey }),
    }} />;
}

export function RuleTask({ executeNo, path, onComplete }: { executeNo: string; path: string; onComplete?: () => void }) {
  const [result, setResult] = useState<RuleTaskResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await ruleGet<RuleTaskResult>(`${path}/tasks/${executeNo}`);
        if (!active) return;
        setResult(next);
        if (next.executeStatus === 'RUNNING') timer = setTimeout(() => void poll(), 2000);
        else onComplete?.();
      } catch (failure) { if (active) setError(getErrorMessage(failure, '进度查询失败')); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [executeNo, path, onComplete]);
  const states = { RUNNING: '执行中', SUCCESS: '已完成', FAILED: '失败', SKIPPED: '未执行', TIMEOUT: '超时' };
  return <div role="status" className="card flex flex-wrap items-center gap-3 p-4 text-sm">{!result || result.executeStatus === 'RUNNING' ? <RefreshCw size={16} className="animate-spin" /> : null}<span>{error || (result ? `${states[result.executeStatus]} · ${result.resultMsg || ''}${result.affectedRows == null ? '' : ` · 已处理 ${result.affectedRows} 条`}` : '正在读取任务进度')}</span><span className="text-xs text-cf-subtle">执行编号：{executeNo}</span></div>;
}
