import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FormField } from '../../types';
import type { FieldPermission } from '../../types/workflowSemantic';
import { cn } from '@/utils/cn';
import { isLayoutField, listFormFields } from '@/utils/formTree';
import { formDeclaredFields, formDerivedFields, formExpressionData, formFieldState } from '@/utils/formValueRuntime';
import { firstVisibleFormError } from '@/utils/formErrorFocus';
import { FormScalarControl } from './FormScalarControl';
import { FormSubTable } from './FormSubTable';
import { renderFormMarkdown } from './FormRichText';
import type { FormErrorFocusTarget, FormRenderServices } from './types';

interface FormFieldTreeProps extends FormRenderServices {
  fields: FormField[];
  data: Record<string, unknown>;
  permissions?: FieldPermission[];
  nodeKey?: string;
  disabled: boolean;
  readonly: boolean;
  errors: Record<string, string>;
  errorFocusRequest: number;
  onChange: (field: FormField, value: unknown, extra?: Record<string, unknown>) => void;
}

interface FieldNodeProps extends FormFieldTreeProps {
  field: FormField;
  declared: ReadonlySet<string>;
  expressionData: Record<string, unknown>;
  derived: ReadonlySet<string>;
  parentColumns: number;
  errorFocus?: FormErrorFocusTarget;
}

const spanClasses: Record<number, string> = { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' };
const gridClasses: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' };
const desktopGridClasses: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
const desktopSpanClasses: Record<number, string> = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' };
const containsErrorTarget = (field: FormField, path: string): boolean => listFormFields([field]).some((location) =>
  path === location.path || path.startsWith(`${location.path}[`));

const FieldNode: React.FC<FieldNodeProps> = React.memo((props) => {
  const { field, data, permissions, nodeKey, expressionData, declared, derived, errors, disabled, parentColumns } = props;
  const state = formFieldState(field, field.id, expressionData, declared, { permissions, nodeKey, readonly: props.readonly });
  const projected = useMemo(() => ({ ...field, readonly: state.readonly || derived.has(field.id), required: state.required }), [field, state.readonly, state.required, derived]);
  const [expanded, setExpanded] = useState(field.defaultExpanded !== false);
  const [activeTab, setActiveTab] = useState(field.children?.[0]?.id || '');
  const errorChild = props.errorFocus && field.children?.find((child) => containsErrorTarget(child, props.errorFocus!.path));
  useEffect(() => {
    if (errorChild) { setExpanded(true); setActiveTab(errorChild.id); }
  }, [errorChild?.id, props.errorFocus?.request]);
  if (!state.visible) return null;
  const layout = isLayoutField(field);
  const wide = layout || ['SUB_TABLE', 'TEXTAREA', 'RICH_TEXT', 'DESCRIPTION', 'DIVIDER'].includes(field.type);
  const span = Math.max(1, Math.min(field.span || (wide ? parentColumns : 1), parentColumns));
  const className = cn('min-w-0', props.layoutMode === 'mobile' ? undefined : props.layoutMode === 'desktop' ? desktopSpanClasses[span] : spanClasses[span]);
  const children = (items: FormField[], columns = 2) => <div className={cn('grid gap-x-5 gap-y-5', props.layoutMode === 'desktop' ? desktopGridClasses[columns] : 'grid-cols-1', props.layoutMode !== 'mobile' && props.layoutMode !== 'desktop' && gridClasses[columns])}>
    {items.map((child) => <FieldNode key={child.id} {...props} field={child} readonly={state.readonly} parentColumns={columns} />)}
  </div>;
  if (field.type === 'DIVIDER') return <div id={`field-${field.id}`} role="separator" className={cn(className, 'flex items-center gap-3 py-2 text-xs text-cf-faint')}><span className="h-px flex-1 bg-[var(--cf-border)]" />{field.label}<span className="h-px flex-1 bg-[var(--cf-border)]" /></div>;
  if (field.type === 'DESCRIPTION') return <div id={`field-${field.id}`} className={cn(className, 'rounded-md bg-[var(--cf-surface-muted)] px-3 py-2 text-sm text-cf-subtle')}><p className="font-medium">{field.label}</p><div className="mt-1" dangerouslySetInnerHTML={{ __html: renderFormMarkdown(String(field.defaultValue || field.placeholder || '')) }} /></div>;
  if (field.type === 'TABS') {
    const tabs = (field.children || []).filter((child) => formFieldState(child, child.id, expressionData, declared, { permissions, nodeKey, readonly: state.readonly }).visible);
    const active = tabs.find((child) => child.id === activeTab) || tabs[0];
    return <fieldset id={`field-${field.id}`} className={cn(className, 'overflow-hidden rounded-lg border border-[var(--cf-border)]')}>
      <legend className="ml-3 px-2 text-sm font-medium text-cf-title">{field.title || field.label}</legend>
      <div role="tablist" aria-label={field.title || field.label} className={cn('flex overflow-x-auto border-b border-[var(--cf-border)] bg-[var(--cf-surface-muted)] p-1', props.layoutMode === 'mobile' ? 'gap-2' : props.layoutMode !== 'desktop' && 'gap-2 sm:gap-0')}>
        {tabs.map((tab) => <button key={tab.id} type="button" id={`tab-${field.id}-${tab.id}`} role="tab" aria-selected={active?.id === tab.id} aria-controls={`panel-${field.id}-${tab.id}`} tabIndex={active?.id === tab.id ? 0 : -1}
          className={cn('shrink-0 rounded-md px-3 py-2 text-sm transition-colors duration-150', props.layoutMode === 'mobile' ? 'min-h-11 min-w-11' : props.layoutMode !== 'desktop' && 'min-h-11 min-w-11 sm:min-h-0 sm:min-w-0', active?.id === tab.id ? 'bg-[var(--cf-surface)] font-medium text-cf-title shadow-sm' : 'text-cf-subtle hover:text-cf-title')}
          onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.findIndex((item) => item.id === tab.id);
            const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            setActiveTab(next.id);
            document.getElementById(`tab-${field.id}-${next.id}`)?.focus();
          }}>{tab.title || tab.label}</button>)}
      </div>
      {active ? <div role="tabpanel" id={`panel-${field.id}-${active.id}`} aria-labelledby={`tab-${field.id}-${active.id}`} className="p-4">{children([active])}</div> : null}
    </fieldset>;
  }
  if (field.type === 'COLLAPSE') return <fieldset id={`field-${field.id}`} className={cn(className, 'rounded-lg border border-[var(--cf-border)]')}>
    <legend className="sr-only">{field.title || field.label}</legend>
    <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="cursor-pointer bg-[var(--cf-surface-muted)] px-4 py-3 text-sm font-medium text-cf-title">{field.title || field.label}</summary><div className="p-4">{children(field.children || [])}</div>
    </details>
  </fieldset>;
  if (layout) return <fieldset id={`field-${field.id}`} className={cn(className, 'rounded-lg border border-[var(--cf-border)] p-4')}><legend className="px-2 text-sm font-medium text-cf-title">{field.title || field.label}</legend>{children(field.children || [], field.type === 'GRID' && typeof field.columns === 'number' ? field.columns : 2)}</fieldset>;
  return <div id={`field-${field.id}`} tabIndex={-1} className={className} role="group" aria-labelledby={`label-${field.id}`} aria-describedby={errors[field.id] ? `error-${field.id}` : undefined}>
    <label id={`label-${field.id}`} htmlFor={`input-${field.id}`} className="mb-1.5 block text-xs font-medium text-cf-subtle">{field.label}{!props.readonly && state.required ? <span className="text-red-500"> *</span> : null}</label>
    {field.type === 'SUB_TABLE' ? <FormSubTable {...props} field={projected} value={data[field.id]} data={expressionData} readonly={projected.readonly} onChange={(value) => props.onChange(projected, value)} />
      : <FormScalarControl {...props} field={projected} fieldPath={field.id} inputId={`input-${field.id}`} labelId={`label-${field.id}`} errorId={errors[field.id] ? `error-${field.id}` : undefined} data={data} value={data[field.id]} readonly={projected.readonly} invalid={Boolean(errors[field.id])} onChange={(value, extra) => props.onChange(projected, value, extra)} />}
    {errors[field.id] ? <p id={`error-${field.id}`} role="alert" className="mt-1 text-xs text-red-600">{errors[field.id]}</p> : null}
  </div>;
});

export const FormFieldTree: React.FC<FormFieldTreeProps> = (props) => {
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const [errorFocus, setErrorFocus] = useState<FormErrorFocusTarget>();
  useEffect(() => {
    if (!props.errorFocusRequest) return;
    const snapshot = current.current;
    const path = firstVisibleFormError(snapshot.fields, snapshot.data, snapshot.errors, snapshot);
    setErrorFocus(path ? { path, request: props.errorFocusRequest } : undefined);
  }, [props.errorFocusRequest]);
  useEffect(() => {
    const container = root.current;
    if (!container || !errorFocus) return;
    let frame = 0;
    let stopped = false;
    const stop = () => { stopped = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); };
    const complete = () => { stop(); setErrorFocus(undefined); };
    const locate = () => {
      if (stopped) return;
      if (!current.current.errors[errorFocus.path]) { complete(); return; }
      const field = container.querySelector<HTMLElement>(`#${CSS.escape(`field-${errorFocus.path}`)}`);
      if (!field || field.closest('details:not([open])') || !field.getBoundingClientRect().height || field.querySelector('[role="status"]')) return;
      const primary = field.querySelector<HTMLElement>(`#${CSS.escape(`input-${errorFocus.path}`)}`);
      const input = primary?.matches('[role="group"],[role="radiogroup"]') ? primary.querySelector<HTMLElement>('input:not(:disabled)') : primary;
      if (input?.matches(':disabled,[aria-disabled="true"]')) return;
      complete();
      (input || field).scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      (input || field).focus({ preventScroll: true });
    };
    const schedule = () => { if (!stopped) { cancelAnimationFrame(frame); frame = requestAnimationFrame(locate); } };
    const observer = new MutationObserver(schedule);
    const resize = new ResizeObserver(schedule);
    observer.observe(container, { childList: true, subtree: true, attributes: true });
    resize.observe(container);
    schedule();
    return stop;
  }, [errorFocus]);
  const declared = useMemo(() => formDeclaredFields(props.fields), [props.fields]);
  const derived = useMemo(() => formDerivedFields(props.fields), [props.fields]);
  const expressionData = useMemo(() => formExpressionData(props.fields, props.data), [props.fields, props.data]);
  return <div ref={root} className={cn('grid gap-x-5 gap-y-5', props.layoutMode === 'desktop' ? 'grid-cols-2' : props.layoutMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>{props.fields.map((field) => <FieldNode key={field.id} {...props} errorFocus={errorFocus} field={field} declared={declared} derived={derived} expressionData={expressionData} parentColumns={2} />)}</div>;
};
