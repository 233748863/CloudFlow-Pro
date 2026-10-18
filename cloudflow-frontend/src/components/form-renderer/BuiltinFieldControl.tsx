import React, { useId, useRef, useState } from 'react';
import type { FormField } from '../../types';
import { AmountInput, DatePicker, DeptSelector, EmployeeSelector, Input, PositionSelector, PostSelector, Switch, Textarea, UserSelector } from '@/components/common';
import { DateRangePicker } from '@/components/common/DateRangePicker';
import { SelectorShell } from '@/components/common/SelectorShell';
import { useDict } from '@/hooks/useDict';
import { cn } from '@/utils/cn';
import { applyFieldFillMappings, formatFormReadOnlyDate, getFieldDisplayValue } from '@/utils/formFieldRuntime';
import { formatDecimalAmount, normalizeFormNumber } from '@/utils/amountValue';
import { formHasValue } from '@/utils/formValueRuntime';
import { FormRichText, renderFormMarkdown } from './FormRichText';
import type { FormRenderServices } from './types';

export interface FormScalarControlProps extends FormRenderServices {
  field: FormField;
  fieldPath: string;
  inputId: string;
  labelId?: string;
  errorId?: string;
  value: unknown;
  data: Record<string, unknown>;
  disabled: boolean;
  readonly: boolean;
  invalid?: boolean;
  onChange: (value: unknown, extra?: Record<string, unknown>) => void;
}

const asText = (value: unknown): string => value === undefined || value === null ? '' : String(value);
const asSelection = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : formHasValue(value) ? [String(value)] : [];

const OptionControl: React.FC<{ field: FormField; value: unknown; disabled: boolean; options: Array<{ id: string; label: string }>; loading?: boolean; className?: string; inputId?: string; accessibility?: React.AriaAttributes; onOpen?: () => void; onChange: (value: unknown) => void }> = ({ field, value, disabled, options, loading, className, inputId, accessibility, onOpen, onChange }) => {
  const selected = asSelection(value);
  const multiple = ['MULTI_SELECT', 'CHECKBOX_GROUP', 'USER_MULTI', 'DEPT_MULTI'].includes(field.type) || field.multiple === true;
  return <SelectorShell id={inputId} {...accessibility} options={options} value={selected} disabled={disabled} loading={loading} multiple={multiple} allowClear showAvatar={false} className={className} onOpen={onOpen}
    placeholder={field.placeholder || '请选择'} onToggle={(selectedId) => {
      const next = selected.includes(selectedId) ? selected.filter((item) => item !== selectedId) : [...selected, selectedId];
      onChange(multiple ? next : selected.includes(selectedId) ? '' : selectedId);
    }} onRemove={(selectedId) => onChange(multiple ? selected.filter((item) => item !== selectedId) : '')} />;
};

const DictionaryControl: React.FC<Pick<FormScalarControlProps, 'field' | 'value' | 'disabled' | 'onChange' | 'inputId'> & { accessibility: React.AriaAttributes }> = ({ field, value, disabled, onChange, inputId, accessibility }) => {
  const dictionary = useDict(field.dictType || '', { enabled: Boolean(field.dictType) && !disabled, staleTime: 0, refetchOnMount: true });
  const refreshing = useRef(false);
  return <div className="space-y-1"><OptionControl inputId={inputId} accessibility={accessibility} field={field} value={value} disabled={disabled || dictionary.isError} loading={dictionary.isFetching}
    options={(dictionary.data || []).map((item) => ({ id: item.value, label: item.label }))}
    onOpen={() => {
      if (!disabled && !refreshing.current) {
        refreshing.current = true;
        void dictionary.refetch().finally(() => { refreshing.current = false; });
      }
    }}
    onChange={(next) => { if (!refreshing.current && !dictionary.isFetching && !dictionary.isError) onChange(next); }} />
    {dictionary.isError ? <p role="alert" className="text-xs text-red-600">字典选项加载失败，请刷新重试</p> : null}</div>;
};

export const BuiltinFieldControl: React.FC<FormScalarControlProps> = ({ field, fieldPath, inputId, labelId, errorId, value, data, disabled, readonly, invalid, onChange, renderReferenceField, renderUploadField, idValuesAsStrings, layoutMode }) => {
  const optionGroup = useId();
  const [selectionError, setSelectionError] = useState('');
  const className = cn(invalid && 'border-red-400 focus-visible:ring-red-200');
  const accessibility: React.AriaAttributes = { 'aria-labelledby': labelId, 'aria-describedby': errorId, 'aria-invalid': invalid || undefined,
    'aria-required': !['DATE', 'DATETIME', 'TIME', 'DATE_RANGE'].includes(field.type) && !field.type.startsWith('UPLOAD_') ? field.required || undefined : undefined };
  const controlProps = { id: inputId, ...accessibility };
  if (field.type.startsWith('UPLOAD_')) {
    return renderUploadField ? renderUploadField({ field, fieldPath, value, disabled, readonly, controlProps, onChange })
      : <div className="rounded-md border border-dashed border-[var(--cf-border)] p-3 text-xs text-cf-subtle">{formHasValue(value) ? `已关联附件：${asSelection(value).join('、')}` : '附件入口需由当前业务表单提供'}</div>;
  }
  if (readonly) {
    if (field.type === 'RICH_TEXT') return <div className="min-h-11 rounded-md bg-[var(--cf-surface-muted)] p-3 text-sm text-cf-title [&_ul]:list-inside [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: renderFormMarkdown(asText(value)) }} />;
    const display = getFieldDisplayValue(field, data, value);
    const text = (field.type === 'AMOUNT' || field.type === 'NUMBER') && (typeof display === 'string' || typeof display === 'number') ? formatDecimalAmount(display, field.precision ?? 2) || (field.type === 'NUMBER' ? asText(display) : '')
      : field.type === 'DATE' ? formatFormReadOnlyDate(display)
        : field.type === 'SWITCH' ? display === true ? '是' : display === false ? '否' : ''
        : Array.isArray(display) ? display.map(String).join('、') : asText(display);
    return <div className="min-h-11 whitespace-pre-wrap break-words rounded-md bg-[var(--cf-surface-muted)] px-3 py-2.5 text-sm text-cf-title">{text || <span className="text-cf-faint">未填写</span>}</div>;
  }
  if (renderReferenceField && ['EMPLOYEE', 'DEPT', 'POST', 'POSITION', 'USER_MULTI', 'DEPT_MULTI', 'DICT_SELECT'].includes(field.type)) {
    return renderReferenceField({ field, fieldPath, value, data, disabled, className, controlProps,
      onChange: (selection) => onChange(selection?.id ?? '', {
        ...applyFieldFillMappings(field, selection ? { id: selection.id, name: selection.label } : null),
        ...(field.displayFieldId ? { [field.displayFieldId]: selection?.label ?? '' } : {}),
      }), onMultiChange: (selections) => onChange(selections.map((selection) => selection.id)),
    });
  }
  const selectMaster = (identifier: unknown, picked: unknown) => {
    if (idValuesAsStrings && typeof identifier === 'number' && !Number.isSafeInteger(identifier)) { setSelectionError('选项编号精度无效，请刷新重试'); return; }
    setSelectionError('');
    onChange(identifier === null || identifier === undefined ? '' : idValuesAsStrings ? String(identifier) : identifier, applyFieldFillMappings(field, picked));
  };
  let control: React.ReactNode;
  if (field.type === 'EMPLOYEE') control = <EmployeeSelector controlProps={controlProps} single disabled={disabled} value={value as string | number | null} onlyActive={field.onlyActive !== false} allowClear placeholder={field.placeholder || '选择员工'} onChange={(identifier, picked) => selectMaster(picked?.id ?? identifier, picked)} />;
  else if (field.type === 'DEPT') control = <DeptSelector controlProps={controlProps} single disabled={disabled} value={value as string | number | null} allowClear placeholder={field.placeholder || '选择部门'} onChange={(identifier, picked) => selectMaster(picked?.deptId ?? identifier, picked)} />;
  else if (field.type === 'POST') control = <PostSelector controlProps={controlProps} single disabled={disabled} value={value as string | number | null} allowClear placeholder={field.placeholder || '选择岗位'} onChange={(identifier, picked) => selectMaster(picked?.postId ?? identifier, picked)} />;
  else if (field.type === 'POSITION') control = <PositionSelector controlProps={controlProps} single disabled={disabled} value={value as string | number | null} deptId={field.filterByDeptFieldId ? data[field.filterByDeptFieldId] as string | number : undefined} allowClear placeholder={field.placeholder || '选择职位'} onChange={(identifier, picked) => selectMaster(picked?.id ?? identifier, picked)} />;
  else if (field.type === 'USER_MULTI') control = <UserSelector controlProps={controlProps} disabled={disabled} value={asSelection(value)} onChange={(identifiers) => onChange(identifiers)} />;
  else if (field.type === 'DEPT_MULTI') control = <DeptSelector controlProps={controlProps} disabled={disabled} value={asSelection(value)} onChange={(identifiers, picked) => onChange(picked.length === identifiers.length ? picked.map((department) => String(department.deptId)) : identifiers.map(String))} />;
  if (control) return <div className="space-y-1">{control}{selectionError ? <p role="alert" className="text-xs text-red-600">{selectionError}</p> : null}</div>;
  if (field.type === 'RICH_TEXT') return <FormRichText id={inputId} {...accessibility} value={asText(value)} disabled={disabled} className={className} onChange={onChange} />;
  if (field.type === 'TEXTAREA') return <Textarea id={inputId} {...accessibility} value={asText(value)} rows={field.rows || 3} disabled={disabled} className={className} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (field.type === 'AMOUNT') return <AmountInput id={inputId} {...accessibility} stringMode value={typeof value === 'number' || typeof value === 'string' ? value : null} precision={field.precision ?? 2} min={field.min} max={field.max} disabled={disabled} className={className} placeholder={field.placeholder} onValueChange={(amount) => onChange(amount ?? '')} />;
  if (field.type === 'SWITCH') return <div className="flex min-h-9 items-center gap-2"><Switch id={inputId} {...accessibility} checked={value === true} disabled={disabled} onCheckedChange={onChange} /><span className="text-sm text-cf-subtle">{value === true ? '是' : '否'}</span></div>;
  if (field.type === 'DATE_RANGE') {
    const dates = asSelection(value);
    return <DateRangePicker id={inputId} {...accessibility} value={{ startDate: dates[0] || '', endDate: dates[1] || '' }} disabled={disabled} className={className} ariaLabel={field.label} onChange={(range) => onChange([range.startDate, range.endDate])} />;
  }
  if (['DATE', 'DATETIME', 'TIME'].includes(field.type)) return <DatePicker id={inputId} {...accessibility} type={field.type === 'DATETIME' ? 'datetime-local' : field.type === 'TIME' ? 'time' : 'date'} value={asText(value).replace(' ', 'T')} disabled={disabled} className={className} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
  if (field.type === 'DICT_SELECT') return <DictionaryControl inputId={inputId} accessibility={accessibility} field={field} value={value} disabled={disabled} onChange={onChange} />;
  if (field.type === 'RADIO_GROUP' || field.type === 'CHECKBOX_GROUP') {
    const multiple = field.type === 'CHECKBOX_GROUP';
    const selected = asSelection(value);
    return <div id={inputId} role={multiple ? 'group' : 'radiogroup'} aria-labelledby={labelId} aria-describedby={errorId} className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">{(field.options || []).map((option) => <label key={option} className={cn('flex items-center gap-2 text-sm text-cf-title', layoutMode === 'mobile' ? 'min-h-11 min-w-11' : layoutMode !== 'desktop' && 'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input type={multiple ? 'checkbox' : 'radio'} aria-describedby={errorId} aria-invalid={invalid || undefined} name={optionGroup} checked={selected.includes(option)} disabled={disabled} className="h-4 w-4 accent-[var(--cf-primary)]" onChange={() => onChange(multiple ? selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option] : option)} />{option}</label>)}</div>;
  }
  if (field.type === 'SELECT' || field.type === 'MULTI_SELECT') return <OptionControl inputId={inputId} accessibility={accessibility} field={field} value={value} disabled={disabled} className={className} options={(field.options || []).map((option) => ({ id: option, label: option }))} onChange={onChange} />;
  return <Input id={inputId} {...accessibility} type="text" inputMode={field.type === 'NUMBER' ? 'decimal' : undefined} value={asText(value)} disabled={disabled} className={className} placeholder={field.placeholder} onChange={(event) => onChange(field.type === 'NUMBER' ? normalizeFormNumber(event.target.value) : event.target.value)} />;
};

export const BuiltinFieldPreview: React.FC<FormScalarControlProps> = (props) => {
  if (props.field.type === 'DIVIDER') return <div className="border-t border-[var(--cf-border)]" />;
  if (props.field.type === 'DESCRIPTION') return <p className="text-xs text-cf-subtle">{String(props.field.defaultValue || '说明文字')}</p>;
  return <BuiltinFieldControl {...props} disabled />;
};
