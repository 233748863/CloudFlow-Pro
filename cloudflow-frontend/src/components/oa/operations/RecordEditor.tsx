import React, { useEffect, useId, useState } from 'react';
import { Button, Input, Textarea } from '@/components/common';
import { UserSelector } from '@/components/common/UserSelector';
import { DeptSelector } from '@/components/common/DeptSelector';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Field, useMutation } from './OperationsKit';

export interface FieldSpec<T> {
  key: keyof T; label: string; type?: 'text' | 'textarea' | 'number' | 'date' | 'datetime-local' | 'time' | 'checkbox' | 'select' | 'user' | 'department';
  options?: Record<string, string>; required?: boolean; min?: number; max?: number; step?: number; maxLength?: number; wide?: boolean; numeric?: boolean;
  disabled?: boolean; when?: (record: T) => boolean;
}
export function FormFields<T extends object>({ value, onChange, fields, disabled = false }: { value: T; onChange: (value: NoInfer<T>) => void; fields: FieldSpec<NoInfer<T>>[]; disabled?: boolean }) {
  const prefix = useId();
  const change = (key: keyof T, next: unknown) => onChange({ ...value, [key]: next });
  return <div className="oa-ops-grid">{fields.filter(field => !field.when || field.when(value)).map(field => {
    const content = value[field.key]; const text = content == null ? '' : String(content); const locked = disabled || field.disabled; const id = prefix + String(field.key);
    if (field.type === 'checkbox') return <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Number(content) === 1 || content === true} disabled={locked} onChange={event => change(field.key, event.target.checked ? 1 : 0)} />{field.label}</label>;
    return <Field key={id} label={field.label + (field.required ? ' *' : '')} wide={field.wide}>
      {field.type === 'user' ? <UserSelector single value={text || null} disabled={locked} allowClear={!field.required} onChange={userId => change(field.key, userId ? Number(userId) : null)} />
      : field.type === 'department' ? <DeptSelector single value={text || null} disabled={locked} allowClear={!field.required} onChange={deptId => change(field.key, deptId)} />
      : field.type === 'select' ? <select id={id} aria-label={field.label} required={field.required} disabled={locked} className="cf-control h-10 rounded-md px-3" value={text} onChange={event => change(field.key, event.target.value === '' ? null : field.numeric ? Number(event.target.value) : event.target.value)}><option value="">请选择</option>{Object.entries(field.options || {}).map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>
      : field.type === 'textarea' ? <Textarea id={id} aria-label={field.label} value={text} required={field.required} maxLength={field.maxLength || 10000} disabled={locked} onChange={event => change(field.key, event.target.value)} />
      : <Input id={id} aria-label={field.label} type={field.type || 'text'} required={field.required} value={field.type === 'datetime-local' ? text.replace(' ', 'T').slice(0, 16) : field.type === 'date' ? text.slice(0, 10) : text} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || 200} disabled={locked} onChange={event => change(field.key, event.target.value === '' ? null : field.type === 'number' ? Number(event.target.value) : field.type === 'datetime-local' ? event.target.value.replace('T', ' ') + ':00' : event.target.value)} />}
    </Field>;
  })}</div>;
}
export function RecordEditor<T extends object>({ title, value, fields, onClose, onSave, children, description }: { title: string; value: T | null; fields: FieldSpec<T>[]; onClose: () => void; onSave: (data: T) => Promise<unknown>; children?: React.ReactNode | ((value: T, onChange: (value: T) => void) => React.ReactNode); description?: string }) {
  const [draft, setDraft] = useState<T | null>(value); const mutation = useMutation(); const formId = useId();
  useEffect(() => setDraft(value), [value]);
  return <BaseDialog open={value !== null} title={title} width="wide" onClose={() => { if (!mutation.busy) onClose(); }} footer={<><Button variant="outline" disabled={mutation.busy} onClick={onClose}>取消</Button><Button type="submit" form={formId} disabled={mutation.busy}>保存</Button></>}>
    {draft && <form id={formId} onSubmit={event => { event.preventDefault(); void mutation.run(() => onSave(draft), onClose); }} className="space-y-4">{description && <p className="oa-ops-warning">{description}</p>}<FormFields value={draft} onChange={setDraft} fields={fields} disabled={mutation.busy} />{typeof children === 'function' ? children(draft, setDraft) : children}</form>}
  </BaseDialog>;
}
export const optionsOf = <T,>(items: T[] | undefined, id: keyof T, label: keyof T) => Object.fromEntries((items || []).map(item => [String(item[id]), String(item[label] ?? item[id])]));
export const today = () => { const value = new Date(); return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-'); };
export const enabledStatuses = { ACTIVE: '启用', DISABLED: '停用' };
export const depreciationMethods = { STRAIGHT_LINE: '直线法', DOUBLE_DECLINING: '双倍余额递减法', SUM_OF_YEARS: '年数总和法' };
export const assetStatuses = { IDLE: '闲置', IN_USE: '在用', MAINTENANCE: '维修', SCRAPPED: '报废', LOST: '丢失', DISPOSED: '已处置' };
export const taskStatuses = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消', BLOCKED: '阻塞' };
export const standings = { EXCELLENT: '优秀', QUALIFIED: '合格', WATCH: '观察', ELIMINATED: '淘汰' };
