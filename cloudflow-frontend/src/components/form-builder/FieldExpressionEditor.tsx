import React, { useId, useMemo, useState } from 'react';
import type { FormField } from '../../types';
import { Button, Input, Switch, Textarea } from '@/components/common';
import { listFormFields } from '@/utils/formTree';
import { formExpressionData } from '@/utils/formValueRuntime';
import { evaluateFormExpression, validateFormExpression } from '@/utils/formExpression';

interface FieldExpressionEditorProps {
  fields: FormField[];
  fieldPath: string;
  value?: string;
  label: string;
  onChange: (expression: string | undefined) => void;
}

export const FieldExpressionEditor: React.FC<FieldExpressionEditorProps> = ({ fields, fieldPath, value = '', label, onChange }) => {
  const inputId = useId();
  const [testValues, setTestValues] = useState<Record<string, unknown>>({});
  const [search, setSearch] = useState('');
  const scopeFields = useMemo(() => {
    const tableId = fieldPath.includes('.') ? fieldPath.split('.')[0] : null;
    const locations = listFormFields(fields).filter((location) => !location.path.includes('.') || tableId && location.path.startsWith(`${tableId}.`));
    return [...new Map(locations.map((location) => [location.field.id, location.field])).values()];
  }, [fields, fieldPath]);
  const declared = new Set(scopeFields.map((field) => field.id));
  const error = value.trim() ? validateFormExpression(value, declared) : null;
  const referenced = [...new Set([...value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]))];
  const result = !error && value.trim() ? evaluateFormExpression(value, formExpressionData(scopeFields, testValues), declared) : null;
  return <section className="space-y-2 rounded-md border border-[var(--cf-border)] p-3">
    <label htmlFor={inputId} className="block text-xs font-medium text-cf-title">{label}</label>
    <Textarea id={inputId} value={value} rows={3} maxLength={500} placeholder="留空表示不设置条件" className="font-mono text-xs" onChange={(event) => onChange(event.target.value || undefined)} aria-describedby={error ? `${inputId}-error` : undefined} />
    <div className="flex justify-between text-[11px] text-cf-faint"><span>支持比较、且、或、非和括号</span><span>{value.length} / 500</span></div>
    {error ? <p id={`${inputId}-error`} role="alert" className="text-xs text-red-600">{error}</p> : null}
    <details className="text-xs text-cf-subtle"><summary className="cursor-pointer py-1">插入字段和试算</summary>
      <div className="mt-2 space-y-2"><Input value={search} placeholder="搜索字段名称" className="text-xs" onChange={(event) => setSearch(event.target.value)} />
        <div className="flex max-h-28 flex-wrap gap-1 overflow-auto">{scopeFields.filter((field) => `${field.label} ${field.id}`.toLowerCase().includes(search.toLowerCase())).map((field) => <Button key={field.id} type="button" variant="outline" size="sm" title={field.id} onClick={() => onChange(`${value}\${${field.id}}`.slice(0, 500))}>{field.label}</Button>)}</div>
        {referenced.map((fieldId) => {
          const field = scopeFields.find((candidate) => candidate.id === fieldId);
          return <label key={fieldId} className="flex items-center gap-2"><span className="w-20 shrink-0 truncate">{field?.label || fieldId}</span>{field?.type === 'SWITCH' ? <Switch checked={testValues[fieldId] === true} onCheckedChange={(checked) => setTestValues((previous) => ({ ...previous, [fieldId]: checked }))} />
            : <Input value={String(testValues[fieldId] ?? '')} placeholder="试算值" className="text-xs" onChange={(event) => setTestValues((previous) => ({ ...previous, [fieldId]: event.target.value }))} />}</label>;
        })}
        {result ? <p role="status" className={result.valid ? 'text-cf-subtle' : 'text-amber-700'}>{result.valid ? result.value ? '试算：条件成立' : '试算：条件不成立' : '试算：值类型不匹配，按不可见或只读处理'}</p> : null}
      </div>
    </details>
  </section>;
};
